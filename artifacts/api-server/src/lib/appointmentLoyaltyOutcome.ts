export type AppointmentLoyaltyOutcome = "completed" | "no_show";

interface ApplyAppointmentLoyaltyOutcomeOptions {
  outcome: AppointmentLoyaltyOutcome;
  changed: boolean;
  clientPhone?: string | null;
  resetBalance?: (clientPhone: string) => Promise<void>;
}

/**
 * Only a newly recorded no-show clears the client's accumulated balance.
 * Normal completion and repeated no-show requests must not mutate loyalty.
 */
export async function applyAppointmentLoyaltyOutcome({
  outcome,
  changed,
  clientPhone,
  resetBalance,
}: ApplyAppointmentLoyaltyOutcomeOptions): Promise<boolean> {
  if (!changed || outcome !== "no_show" || !clientPhone) return false;
  if (!resetBalance) {
    throw new Error("A balance reset callback is required for a new no-show.");
  }

  await resetBalance(clientPhone);
  return true;
}
