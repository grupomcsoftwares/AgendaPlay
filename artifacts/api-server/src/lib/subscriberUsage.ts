export interface SubscriberUsagePhoneRow {
  subscriberPhone: string | null;
  clientPhone: string | null;
  notes: string | null;
}

export interface SubscriberCreditUsageRow extends SubscriberUsagePhoneRow {
  creditsUsed: number | null;
}

export interface MonthlyUsageSubscriptionRow {
  id: number;
  userId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  status: string;
  expiresAt: Date | null;
  planId: number;
}

export interface MonthlyUsagePlanRow {
  id: number;
  userId: string;
  name: string;
  maxAppointmentsPerMonth: number | null;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function buildMonthlyUsageResponse(
  subscriptions: MonthlyUsageSubscriptionRow[],
  plans: MonthlyUsagePlanRow[],
  usageByPhone: ReadonlyMap<string, number>,
  userId: string,
) {
  const planById = new Map(
    plans
      .filter((plan) => plan.userId === userId)
      .map((plan) => [plan.id, plan]),
  );

  return subscriptions
    .filter((subscription) => (
      subscription.userId === userId
      && (subscription.status === "active" || subscription.status === "expired")
    ))
    .map((subscription) => {
      const plan = planById.get(subscription.planId);
      return {
        id: subscription.id,
        clientName: subscription.clientName,
        clientPhone: subscription.clientPhone,
        clientEmail: subscription.clientEmail,
        status: subscription.status,
        expiresAt: subscription.expiresAt?.toISOString() ?? null,
        renewedAt: null,
        planId: subscription.planId,
        planName: plan?.name ?? null,
        maxAppointmentsPerMonth: plan?.maxAppointmentsPerMonth ?? null,
        cutsUsedThisMonth: usageByPhone.get(normalizePhone(subscription.clientPhone)) ?? 0,
      };
    });
}

function resolveSubscriberPhone(row: SubscriberUsagePhoneRow): string {
  const phoneFromNotes = row.notes?.match(/Tel:\s*([^.]+)/)?.[1] ?? "";
  // The appointment snapshot survives client edits/deletion; the join and notes
  // are compatibility fallbacks for older rows that have not been backfilled.
  return normalizePhone(row.subscriberPhone || row.clientPhone || phoneFromNotes);
}

export function countCoveredAppointmentsByPhone(
  rows: SubscriberUsagePhoneRow[],
): Map<string, number> {
  const usageByPhone = new Map<string, number>();
  for (const row of rows) {
    const phone = resolveSubscriberPhone(row);
    if (phone) usageByPhone.set(phone, (usageByPhone.get(phone) ?? 0) + 1);
  }
  return usageByPhone;
}

export function sumCreditsUsedForPhone(
  rows: SubscriberCreditUsageRow[],
  phone: string,
): number {
  const normalizedPhone = normalizePhone(phone);
  return rows.reduce((sum, row) => (
    resolveSubscriberPhone(row) === normalizedPhone
      ? sum + (row.creditsUsed ?? 0)
      : sum
  ), 0);
}