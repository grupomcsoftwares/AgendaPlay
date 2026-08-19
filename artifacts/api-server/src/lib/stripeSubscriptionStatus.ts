import type Stripe from "stripe";

type StripeBillingIdentity = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

const isActiveSubscription = (status: Stripe.Subscription.Status): boolean =>
  status === "active" || status === "trialing";

const hasFailedPayment = (status: Stripe.Subscription.Status): boolean =>
  status === "past_due" || status === "unpaid";

/**
 * Resolves the current payment state from Stripe. A null result means Stripe
 * could not be checked, so callers should retain their persisted webhook state.
 */
export async function getStripePaymentFailureStatus(
  stripe: Stripe,
  identity: StripeBillingIdentity,
): Promise<boolean | null> {
  const subscriptions = new Map<string, Stripe.Subscription>();
  let checkedStripe = false;

  if (identity.stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(identity.stripeSubscriptionId);
      subscriptions.set(subscription.id, subscription);
      checkedStripe = true;
    } catch {
      // The subscription may be from an older Stripe environment. The customer
      // query below can still locate the current subscription.
    }
  }

  if (identity.stripeCustomerId) {
    try {
      const result = await stripe.subscriptions.list({
        customer: identity.stripeCustomerId,
        status: "all",
        limit: 20,
      });
      for (const subscription of result.data) {
        subscriptions.set(subscription.id, subscription);
      }
      checkedStripe = true;
    } catch {
      // Keep the last webhook-confirmed state when Stripe is temporarily unavailable.
    }
  }

  if (!checkedStripe) return null;

  const values = [...subscriptions.values()];
  if (values.some((subscription) => isActiveSubscription(subscription.status))) {
    return false;
  }

  return values.some((subscription) => hasFailedPayment(subscription.status));
}