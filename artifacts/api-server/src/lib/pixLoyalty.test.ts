import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBookingLoyaltyPoints,
  creditPendingPixLoyaltyPoints,
  type PendingPixLoyaltyAppointment,
} from "./pixLoyalty.ts";

const loyaltyConfig = {
  enabled: true,
  pointsPerReal: 2,
  pointsPerRedemptionUnit: 100,
  prepaymentBonusPoints: 15,
};

test("public Pix booking holds normal points and bonus until approval", () => {
  const points = calculateBookingLoyaltyPoints({
    loyaltyConfig,
    servicePrice: 100,
    isAdminBooking: false,
    hasClientPhone: true,
    awaitingPixApproval: true,
    pointsRedeemed: 0,
  });

  assert.deepEqual(points, {
    pointsEarned: 215,
    pendingPointsEarned: 215,
    pointsToCreditImmediately: 0,
  });
});

test("approved Pix credits normal points plus bonus only once", async () => {
  const points = calculateBookingLoyaltyPoints({
    loyaltyConfig,
    servicePrice: 100,
    isAdminBooking: false,
    hasClientPhone: true,
    awaitingPixApproval: true,
    pointsRedeemed: 0,
  });
  let balance = 7;
  const appointment: PendingPixLoyaltyAppointment = {
    status: "pending_payment",
    pendingLoyaltyPointsEarned: points.pendingPointsEarned,
  };
  const credit = async (amount: number) => {
    balance += amount;
  };

  assert.equal(await creditPendingPixLoyaltyPoints(appointment, credit), true);
  assert.equal(balance, 222);

  // The approval transaction changes the status and consumes the pending amount.
  appointment.status = "pending";
  appointment.pendingLoyaltyPointsEarned = 0;
  assert.equal(await creditPendingPixLoyaltyPoints(appointment, credit), false);
  assert.equal(balance, 222);
});

test("rejected, cancelled, and late payment states never credit pending Pix points", async (t) => {
  for (const status of ["payment_rejected", "cancelled"] as const) {
    await t.test(status, async () => {
      let balance = 7;
      const appointment: PendingPixLoyaltyAppointment = {
        status,
        pendingLoyaltyPointsEarned: 215,
      };

      assert.equal(
        await creditPendingPixLoyaltyPoints(appointment, async (amount) => {
          balance += amount;
        }),
        false,
      );
      assert.equal(balance, 7);
    });
  }
});

test("Pix approval does not credit points when loyalty is unavailable", async () => {
  const points = calculateBookingLoyaltyPoints({
    loyaltyConfig: { ...loyaltyConfig, enabled: false },
    servicePrice: 100,
    isAdminBooking: false,
    hasClientPhone: true,
    awaitingPixApproval: true,
    pointsRedeemed: 0,
  });

  assert.deepEqual(points, {
    pointsEarned: 0,
    pendingPointsEarned: 0,
    pointsToCreditImmediately: 0,
  });
});