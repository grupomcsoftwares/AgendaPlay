const TRIAL_DAYS = 7;

export type AccountBillingFields = {
  trialStartedAt: Date;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: Date | null;
  subscriptionExpiresAt?: Date | null;
  maxBarbers?: number | null;
};

export function getAccountStatus(user: AccountBillingFields) {
  const trialStarted = new Date(user.trialStartedAt);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceTrial = Math.floor((now.getTime() - trialStarted.getTime()) / msPerDay);
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceTrial);
  const trialExpired = trialDaysLeft === 0;

  // Stripe's period end is authoritative. An ID without a future validity
  // date must not keep an expired account open.
  const periodEnd = user.stripeCurrentPeriodEnd
    ? new Date(user.stripeCurrentPeriodEnd)
    : user.subscriptionExpiresAt
      ? new Date(user.subscriptionExpiresAt)
      : null;
  const hasActiveSubscription = !!periodEnd && periodEnd.getTime() > now.getTime();

  const daysUntilPeriodEnd = periodEnd
    ? Math.max(0, Math.floor((periodEnd.getTime() - now.getTime()) / msPerDay))
    : null;

  return {
    trialDaysLeft,
    trialExpired,
    hasActiveSubscription,
    canAccess: !trialExpired || hasActiveSubscription,
    maxBarbers: user.maxBarbers ?? null,
    subscriptionDueDate: periodEnd?.toISOString() ?? null,
    subscriptionDaysLeft: daysUntilPeriodEnd,
  };
}

export function accountCanAccess(user: AccountBillingFields): boolean {
  return getAccountStatus(user).canAccess;
}