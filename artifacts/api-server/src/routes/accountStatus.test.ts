import assert from "node:assert/strict";
import test from "node:test";
import { accountCanAccess, getAccountStatus, isSubscriptionExemptEmail } from "./accountStatus.ts";

const expiredAccount = {
  trialStartedAt: new Date("2020-01-01T00:00:00.000Z"),
  trialEligible: false,
  hasEverPaid: true,
  stripeSubscriptionId: null,
  stripeCurrentPeriodEnd: null,
  subscriptionExpiresAt: null,
};

test("the configured internal account keeps access after billing expires", () => {
  const status = getAccountStatus({
    ...expiredAccount,
    email: "  BARBEARIASKINNA@GMAIL.COM ",
  });

  assert.equal(status.subscriptionExempt, true);
  assert.equal(status.canAccess, true);
  assert.equal(status.deletionScheduledAt, null);
  assert.equal(status.deletionDue, false);
  assert.equal(status.firstMonthDiscountEligible, false);
  assert.equal(accountCanAccess({ ...expiredAccount, email: "barbeariaskinna@gmail.com" }), true);
});

test("subscription exemption is limited to the configured email", () => {
  const otherAccount = {
    ...expiredAccount,
    email: "someone-else@example.com",
  };

  assert.equal(isSubscriptionExemptEmail(otherAccount.email), false);
  assert.equal(getAccountStatus(otherAccount).canAccess, false);
});
