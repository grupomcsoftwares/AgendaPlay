import type { LoyaltyConfig } from "@workspace/db";

export interface BookingLoyaltyPointsInput {
  loyaltyConfig: LoyaltyConfig | null;
  servicePrice: number;
  isAdminBooking: boolean;
  hasClientPhone: boolean;
  awaitingPixApproval: boolean;
  pointsRedeemed: number;
}

export interface BookingLoyaltyPoints {
  pointsEarned: number;
  pendingPointsEarned: number;
  pointsToCreditImmediately: number;
}

export function calculateBookingLoyaltyPoints({
  loyaltyConfig,
  servicePrice,
  isAdminBooking,
  hasClientPhone,
  awaitingPixApproval,
  pointsRedeemed,
}: BookingLoyaltyPointsInput): BookingLoyaltyPoints {
  let pointsEarned = 0;
  if (!isAdminBooking && hasClientPhone && loyaltyConfig?.enabled) {
    if (loyaltyConfig.pointsPerReal > 0) {
      pointsEarned = Math.floor(servicePrice * loyaltyConfig.pointsPerReal);
    }
    if (awaitingPixApproval && pointsRedeemed === 0) {
      const bonus = loyaltyConfig.prepaymentBonusPoints ?? 0;
      if (Number.isSafeInteger(bonus) && bonus > 0) pointsEarned += bonus;
    }
  }

  return {
    pointsEarned,
    pendingPointsEarned: awaitingPixApproval ? pointsEarned : 0,
    pointsToCreditImmediately: awaitingPixApproval ? 0 : pointsEarned,
  };
}

export interface PendingPixLoyaltyAppointment {
  status: string;
  pendingLoyaltyPointsEarned: number | null;
}

export async function creditPendingPixLoyaltyPoints(
  appointment: PendingPixLoyaltyAppointment,
  credit: (points: number) => Promise<void>,
): Promise<boolean> {
  if (appointment.status !== "pending_payment") return false;

  const points = appointment.pendingLoyaltyPointsEarned ?? 0;
  if (points > 0) await credit(points);
  return true;
}