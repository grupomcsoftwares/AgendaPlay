export interface SubscriberUsagePhoneRow {
  subscriberPhone: string | null;
  clientPhone: string | null;
  notes: string | null;
}

export interface SubscriberCreditUsageRow extends SubscriberUsagePhoneRow {
  creditsUsed: number | null;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
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