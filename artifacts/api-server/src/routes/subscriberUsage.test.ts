import assert from "node:assert/strict";
import test from "node:test";
import {
  countCoveredAppointmentsByPhone,
  sumCreditsUsedForPhone,
  type SubscriberCreditUsageRow,
  type SubscriberUsagePhoneRow,
} from "../lib/subscriberUsage.ts";

const subscriberPhone = "+55 (11) 99999-1111";

test("monthly subscriber history counts plan appointments after the client record is gone", () => {
  const rows: SubscriberUsagePhoneRow[] = [
    { subscriberPhone, clientPhone: null, notes: null },
    { subscriberPhone: null, clientPhone: null, notes: null },
    { subscriberPhone: null, clientPhone: "+55 11 98888-2222", notes: null },
  ];

  const usageByPhone = countCoveredAppointmentsByPhone(rows);

  assert.equal(usageByPhone.get("5511999991111"), 1);
  assert.equal(usageByPhone.get("5511988882222"), 1);
});

test("public credit usage attributes orphaned appointments by the durable snapshot", () => {
  const rows: SubscriberCreditUsageRow[] = [
    { subscriberPhone, clientPhone: null, notes: null, creditsUsed: 2 },
    { subscriberPhone: null, clientPhone: null, notes: null, creditsUsed: 4 },
    {
      subscriberPhone: "+55 11 98888-2222",
      clientPhone: null,
      notes: null,
      creditsUsed: 7,
    },
  ];

  assert.equal(sumCreditsUsedForPhone(rows, "5511999991111"), 2);
});

test("a stored subscriber phone takes precedence over a changed client phone", () => {
  const rows: SubscriberUsagePhoneRow[] = [
    {
      subscriberPhone,
      clientPhone: "+55 11 98888-2222",
      notes: "Tel: +55 11 98888-2222.",
    },
  ];

  const usageByPhone = countCoveredAppointmentsByPhone(rows);

  assert.equal(usageByPhone.get("5511999991111"), 1);
  assert.equal(usageByPhone.has("5511988882222"), false);
});