import { getStripeSync, getUncachableStripeClient } from './stripeClient.js';
import { db } from '@workspace/db';
import { usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { logger } from './lib/logger.js';

type StripeSubscriptionEvent = {
  type: string;
  data: {
    object: {
      id: string;
      customer: string;
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
    const customerId = obj?.customer;

    if (!customerId || typeof customerId !== 'string') return;

    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const subscriptionId = obj?.id;
      const status = obj?.status;
      if (!subscriptionId) return;

      if (status === 'active' || status === 'trialing') {
        const priceItem = obj?.items?.data?.[0];
        const stripePriceId = priceItem?.price?.id ?? null;
        const productId = priceItem?.price?.product ?? null;
        const maxBarbers = productId ? await getMaxBarbersForProduct(productId) : null;
        const periodEnd = obj?.current_period_end
          ? new Date(obj.current_period_end * 1000)
          : null;

        await db
          .update(usersTable)
          .set({ stripeSubscriptionId: subscriptionId, stripePriceId, maxBarbers, stripeCurrentPeriodEnd: periodEnd })
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
