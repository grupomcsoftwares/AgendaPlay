import { getStripeSync } from './stripeClient.js';
import { db } from '@workspace/db';
import { usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { logger } from './lib/logger.js';

type StripeEventPayload = {
  type: string;
  data: {
    object: {
      id: string;
      customer: string;
      status?: string;
    };
  };
};

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

    let event: StripeEventPayload;
    try {
      event = JSON.parse(payload.toString()) as StripeEventPayload;
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
        await db
          .update(usersTable)
          .set({ stripeSubscriptionId: subscriptionId })
          .where(eq(usersTable.stripeCustomerId, customerId));
        logger.info({ customerId, subscriptionId, type }, 'User subscription activated via webhook');
      } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
        await db
          .update(usersTable)
          .set({ stripeSubscriptionId: null })
          .where(eq(usersTable.stripeCustomerId, customerId));
        logger.info({ customerId, type, status }, 'User subscription cleared via webhook');
      }
    } else if (type === 'customer.subscription.deleted') {
      await db
        .update(usersTable)
        .set({ stripeSubscriptionId: null })
        .where(eq(usersTable.stripeCustomerId, customerId));
      logger.info({ customerId, type }, 'User subscription deleted via webhook');
    }
  }
}
