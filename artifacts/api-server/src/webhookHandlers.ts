import { getStripeSync, getUncachableStripeClient } from './stripeClient.js';
import { db } from '@workspace/db';
import { usersTable } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';
import { logger } from './lib/logger.js';
import { getAuthorizedStripePrice } from './stripeCatalog.js';

type StripeSubscriptionEvent = {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string | { id: string };
      // subscription fields
      status?: string;
      current_period_end?: number;
      items?: {
        data: Array<{
          price: {
            id: string;
            product: string;
          };
        }>;
      };
      // checkout.session fields
      mode?: string;
      subscription?: string | null;
      payment_status?: string;
      metadata?: Record<string, string>;
    };
  };
};

async function getMaxBarbersForProduct(productId: string): Promise<number | null> {
  try {
    const stripe = await getUncachableStripeClient();
    const product = await stripe.products.retrieve(productId);
    const raw = product.metadata?.maxBarbers;
    if (raw === undefined || raw === null) return null;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return null;
    return parsed === 0 ? null : parsed;
  } catch {
    return null;
  }
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    let event: StripeSubscriptionEvent;
    try {
      event = JSON.parse(payload.toString()) as StripeSubscriptionEvent;
    } catch {
      logger.warn('Stripe webhook: failed to parse event payload');
      return;
    }

    const { type, data } = event;
    const obj = data?.object;
    const customerId = typeof obj?.customer === 'string'
      ? obj.customer
      : obj?.customer?.id;

    if (!customerId || typeof customerId !== 'string') return;

    if (type === 'invoice.payment_failed') {
      await db
        .update(usersTable)
        .set({ stripePaymentFailing: true })
        .where(eq(usersTable.stripeCustomerId, customerId));
      logger.warn({ customerId, invoiceId: obj.id }, 'User subscription payment failed via webhook');
      return;
    }

    if (type === 'invoice.payment_succeeded') {
      await db
        .update(usersTable)
        .set({
          stripePaymentFailing: false,
          hasEverPaid: true,
          firstPaidAt: sql`coalesce(${usersTable.firstPaidAt}, now())`,
        })
        .where(eq(usersTable.stripeCustomerId, customerId));
      logger.info({ customerId, invoiceId: obj.id }, 'User subscription payment recovered via webhook');
      return;
    }

    if (type === 'checkout.session.completed') {
      // Only act on subscription-mode sessions
      if (obj?.mode !== 'subscription') return;
      const subscriptionId = typeof obj?.subscription === 'string' ? obj.subscription : null;
      if (!subscriptionId) return;

      try {
        const stripe = await getUncachableStripeClient();
        const sub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price.product'],
        });

        const priceItem = sub.items?.data?.[0];
        const stripePriceId = priceItem?.price?.id ?? null;
        const authorizedPrice = stripePriceId
          ? await getAuthorizedStripePrice(stripe, stripePriceId)
          : null;
        if (!authorizedPrice) {
          logger.warn({ customerId, subscriptionId, stripePriceId }, 'Ignored webhook for unauthorized Stripe price');
          return;
        }
        const productId = typeof priceItem?.price?.product === 'string'
          ? priceItem.price.product
          : (priceItem?.price?.product as { id?: string } | undefined)?.id ?? null;
        const maxBarbers = productId ? await getMaxBarbersForProduct(productId) : null;
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end
          ? new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000)
          : null;

        if (sub.status === 'active' || sub.status === 'trialing') {
          const usedFirstMonthPromotion =
            obj.metadata?.promotion === 'agendaplay_first_month_50_v1';
          await db
            .update(usersTable)
            .set({
              stripeSubscriptionId: sub.id,
              stripePriceId,
              maxBarbers,
              stripeCurrentPeriodEnd: periodEnd,
              ...(obj.payment_status === 'paid'
                ? {
                    hasEverPaid: true,
                    firstPaidAt: sql`coalesce(${usersTable.firstPaidAt}, now())`,
                  }
                : {}),
              ...(usedFirstMonthPromotion
                ? {
                    firstMonthDiscountRedeemedAt:
                      sql`coalesce(${usersTable.firstMonthDiscountRedeemedAt}, now())`,
                  }
                : {}),
            })
            .where(eq(usersTable.stripeCustomerId, customerId));
          logger.info({ customerId, subscriptionId: sub.id, stripePriceId, maxBarbers, periodEnd }, 'User subscription activated via checkout.session.completed webhook');
        }
      } catch (err) {
        logger.error({ err, customerId, subscriptionId }, 'Failed to process checkout.session.completed webhook');
      }
      return;
    }

    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const subscriptionId = obj?.id;
      const status = obj?.status;
      if (!subscriptionId) return;

      if (status === 'active' || status === 'trialing') {
        const priceItem = obj?.items?.data?.[0];
        const stripePriceId = priceItem?.price?.id ?? null;
        const productId = priceItem?.price?.product ?? null;
        const stripe = await getUncachableStripeClient();
        const authorizedPrice = stripePriceId
          ? await getAuthorizedStripePrice(stripe, stripePriceId)
          : null;
        if (!authorizedPrice) {
          logger.warn({ customerId, subscriptionId, stripePriceId }, 'Ignored webhook for unauthorized Stripe price');
          return;
        }
        const maxBarbers = productId ? await getMaxBarbersForProduct(productId) : null;
        const periodEnd = obj?.current_period_end
          ? new Date(obj.current_period_end * 1000)
          : null;

        await db
          .update(usersTable)
          .set({
            stripeSubscriptionId: subscriptionId,
            stripePriceId,
            maxBarbers,
            stripeCurrentPeriodEnd: periodEnd,
            stripePaymentFailing: false,
          })
          .where(eq(usersTable.stripeCustomerId, customerId));
        logger.info({ customerId, subscriptionId, stripePriceId, maxBarbers, periodEnd, type }, 'User subscription activated via webhook');
      } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
        await db
          .update(usersTable)
          .set({ stripeSubscriptionId: null, stripePriceId: null, maxBarbers: null, stripeCurrentPeriodEnd: null })
          .where(eq(usersTable.stripeCustomerId, customerId));
        logger.info({ customerId, type, status }, 'User subscription cleared via webhook');
      }
    } else if (type === 'customer.subscription.deleted') {
      await db
        .update(usersTable)
        .set({ stripeSubscriptionId: null, stripePriceId: null, maxBarbers: null, stripeCurrentPeriodEnd: null })
        .where(eq(usersTable.stripeCustomerId, customerId));
      logger.info({ customerId, type }, 'User subscription deleted via webhook');
    }
  }
}
