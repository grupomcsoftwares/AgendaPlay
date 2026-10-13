import assert from "node:assert/strict";
import test from "node:test";
import { applyAppointmentLoyaltyOutcome } from "./appointmentLoyaltyOutcome.ts";

const clientPhone = "5511999991111";

function createLoyaltyBalance(points: number) {
  let currentPoints = points;
  let updates = 0;

  return {
    get points() {
      return currentPoints;
    },
    get updates() {
      return updates;
    },
    reset: async (phone: string) => {
      assert.equal(phone, clientPhone);
      currentPoints = 0;
      updates += 1;
    },
  };
}

test("recording a no-show clears the client's entire loyalty balance", async () => {
  const balance = createLoyaltyBalance(275);

  const changed = await applyAppointmentLoyaltyOutcome({
    outcome: "no_show",
    changed: true,
    clientPhone,
    resetBalance: balance.reset,
  });

  assert.equal(changed, true);
  assert.equal(balance.points, 0);
  assert.equal(balance.updates, 1);
});

test("completing an appointment preserves the client's loyalty balance", async () => {
  const balance = createLoyaltyBalance(275);

  const changed = await applyAppointmentLoyaltyOutcome({
    outcome: "completed",
    changed: true,
    clientPhone,
    resetBalance: balance.reset,
  });

  assert.equal(changed, false);
  assert.equal(balance.points, 275);
  assert.equal(balance.updates, 0);
});

test("repeating a no-show does not update the balance again", async () => {
  const balance = createLoyaltyBalance(275);

  await applyAppointmentLoyaltyOutcome({
    outcome: "no_show",
    changed: true,
    clientPhone,
    resetBalance: balance.reset,
  });
  const changed = await applyAppointmentLoyaltyOutcome({
    outcome: "no_show",
    changed: false,
    clientPhone,
    resetBalance: balance.reset,
  });

  assert.equal(changed, false);
  assert.equal(balance.points, 0);
  assert.equal(balance.updates, 1);
});
