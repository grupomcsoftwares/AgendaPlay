import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthlyUsageResponse,
  countCoveredAppointmentsByPhone,
  sumCreditsUsedForPhone,
  type MonthlyUsagePlanRow,
  type MonthlyUsageSubscriptionRow,
  type SubscriberCreditUsageRow,
  type SubscriberUsagePhoneRow,
} from "../lib/subscriberUsage.ts";

const subscriberPhone = "+55 (11) 99999-1111";

test("monthly usage keeps active and expired subscriptions and scopes plan data to the account", () => {
  const subscriptions: MonthlyUsageSubscriptionRow[] = [
    {
      id: 1,
      userId: "shop-a",
      clientName: "Active client",
      clientPhone: subscriberPhone,
      clientEmail: "active@example.test",
      status: "active",
      expiresAt: null,
      planId: 10,
    },
    {
      id: 2,
      userId: "shop-a",
      clientName: "Expired client",
      clientPhone: "+55 11 98888-2222",
      clientEmail: "expired@example.test",
      status: "expired",
      expiresAt: new Date("2025-01-01T00:00:00.000Z"),
      planId: 20,
    },
    {
      id: 3,
      userId: "shop-b",
      clientName: "Other account",
      clientPhone: "+55 11 97777-3333",
      clientEmail: "other@example.test",
      status: "active",
      expiresAt: null,
      planId: 30,
    },
  ];
  const plans: MonthlyUsagePlanRow[] = [
    { id: 10, userId: "shop-a", name: "Monthly", maxAppointmentsPerMonth: 8 },
    { id: 20, userId: "shop-b", name: "Other shop plan", maxAppointmentsPerMonth: 12 },
  ];
  const usage = new Map([
    ["5511999991111", 3],
    ["5511988882222", 1],
  ]);

  const result = buildMonthlyUsageResponse(subscriptions, plans, usage, "shop-a");

  assert.equal(result.length, 2);
  assert.deepEqual(result.map(({ status }) => status), ["active", "expired"]);
  assert.equal(result[0]?.planName, "Monthly");
  assert.equal(result[0]?.maxAppointmentsPerMonth, 8);
  assert.equal(result[0]?.cutsUsedThisMonth, 3);
  assert.equal(result[1]?.planName, null);
  assert.equal(result[1]?.maxAppointmentsPerMonth, null);
  assert.equal(result[1]?.cutsUsedThisMonth, 1);
  assert.equal(result.some(({ clientName }) => clientName === "Other account"), false);
});

test("monthly usage returns an empty list when the account has no subscriptions", () => {
  assert.deepEqual(buildMonthlyUsageResponse([], [], new Map(), "shop-a"), []);
});

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