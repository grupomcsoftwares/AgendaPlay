const TRIAL_DAYS = 30;
const DELETION_GRACE_DAYS = 90;

export type AccountBillingFields = {
  trialStartedAt: Date;
  trialEligible?: boolean;
  hasEverPaid?: boolean;
  firstMonthDiscountRedeemedAt?: Date | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: Date | null;
  subscriptionExpiresAt?: Date | null;
  maxBarbers?: number | null;
};

export function getAccountStatus(user: AccountBillingFields) {
  const trialStarted = new Date(user.trialStartedAt);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const trialStartedMs = trialStarted.getTime();
  const validTrialStart = Number.isFinite(trialStartedMs);
  const daysSinceTrial = validTrialStart
    ? Math.floor((now.getTime() - trialStartedMs) / msPerDay)
    : TRIAL_DAYS;
  const trialEligible = user.trialEligible !== false;
  const trialDaysLeft = trialEligible && validTrialStart
    ? Math.min(TRIAL_DAYS, Math.max(0, TRIAL_DAYS - daysSinceTrial))
    : 0;
  const trialExpired = !trialEligible || !validTrialStart || trialDaysLeft === 0;

  // Stripe's period end is authoritative. An ID without a future validity
  // date must not keep an expired account open.
  const periodEnd = user.stripeCurrentPeriodEnd
    ? new Date(user.stripeCurrentPeriodEnd)
    : user.subscriptionExpiresAt
      ? new Date(user.subscriptionExpiresAt)
      : null;
  const periodEndMs = periodEnd?.getTime() ?? Number.NaN;
  const hasActiveSubscription = Number.isFinite(periodEndMs) && periodEndMs > now.getTime();
  const subscriptionDueDate = Number.isFinite(periodEndMs) ? periodEnd!.toISOString() : null;

  const daysUntilPeriodEnd = Number.isFinite(periodEndMs)
    ? Math.max(0, Math.floor((periodEndMs - now.getTime()) / msPerDay))
    : null;
  const hasEverPaid = user.hasEverPaid === true;
  const firstMonthDiscountEligible =
    trialExpired
    && !hasActiveSubscription
    && !hasEverPaid
    && !user.firstMonthDiscountRedeemedAt;
  const deletionBaseMs = validTrialStart
    ? trialStartedMs + (trialEligible ? TRIAL_DAYS : 0) * msPerDay
    : now.getTime();
  const deletionAtMs = deletionBaseMs + DELETION_GRACE_DAYS * msPerDay;
  const deletionScheduled =
    !hasEverPaid
    && !hasActiveSubscription;
  const deletionScheduledAt = deletionScheduled
    ? new Date(deletionAtMs).toISOString()
    : null;
  const deletionDaysLeft = deletionScheduled
    ? Math.max(0, Math.ceil((deletionAtMs - now.getTime()) / msPerDay))
    : null;
  const deletionDue = deletionScheduled && deletionAtMs <= now.getTime();

  return {
    trialEligible,
    returningCustomer: !trialEligible,
    trialDaysLeft,
    trialExpired,
    hasActiveSubscription,
    canAccess: !trialExpired || hasActiveSubscription,
    // The free trial is intentionally unrestricted so the shop can test the
    // full product before choosing a paid barber-count plan.
    maxBarbers: hasActiveSubscription ? user.maxBarbers ?? null : null,
    subscriptionDueDate,
    subscriptionDaysLeft: daysUntilPeriodEnd,
    firstMonthDiscountEligible,
    deletionScheduledAt,
    deletionDaysLeft,
    deletionDue,
  };
}

export function accountCanAccess(user: AccountBillingFields): boolean {
  return getAccountStatus(user).canAccess;
}