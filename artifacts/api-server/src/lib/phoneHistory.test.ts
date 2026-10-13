import assert from "node:assert/strict";
import test from "node:test";
import { getAccountStatus } from "../routes/accountStatus.ts";
import {
  getAccountPhoneHash,
  isAccountPhoneTrialEligible,
  normalizeAccountPhone,
  rememberFormerAccountPhone,
} from "./phoneHistory.ts";

test("a deleted account's phone prevents a second free trial across phone formats", async () => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "phone-history-test-secret";

  try {
    const formerPhoneHashes = new Set<string>();
    const storedHashes: string[] = [];
    const registrationPhone = "+55 (11) 99999-1234";
    const recreatedPhone = "55 11 99999 1234";

    assert.equal(normalizeAccountPhone(registrationPhone), "5511999991234");
    assert.equal(normalizeAccountPhone(recreatedPhone), "5511999991234");

    const firstAccountTrialEligible = await isAccountPhoneTrialEligible(
      registrationPhone,
      async (hash) => formerPhoneHashes.has(hash),
    );
    assert.equal(firstAccountTrialEligible, true);

    const firstAccountStatus = getAccountStatus({
      trialStartedAt: new Date(),
      trialEligible: firstAccountTrialEligible,
      hasEverPaid: false,
      stripeSubscriptionId: null,
      stripeCurrentPeriodEnd: null,
    });
    assert.equal(firstAccountStatus.trialDaysLeft, 30);
    assert.equal(firstAccountStatus.returningCustomer, false);

    await rememberFormerAccountPhone(registrationPhone, async (hash) => {
      storedHashes.push(hash);
      formerPhoneHashes.add(hash);
    });

    assert.deepEqual(storedHashes, [getAccountPhoneHash("5511999991234")]);
    assert.equal(storedHashes.includes("5511999991234"), false);
    assert.equal(storedHashes.includes(registrationPhone), false);

    const recreatedAccountTrialEligible = await isAccountPhoneTrialEligible(
      recreatedPhone,
      async (hash) => formerPhoneHashes.has(hash),
    );
    assert.equal(recreatedAccountTrialEligible, false);

    const recreatedAccountStatus = getAccountStatus({
      trialStartedAt: new Date(),
      trialEligible: recreatedAccountTrialEligible,
      hasEverPaid: false,
      stripeSubscriptionId: null,
      stripeCurrentPeriodEnd: null,
    });
    assert.equal(recreatedAccountStatus.trialDaysLeft, 0);
    assert.equal(recreatedAccountStatus.returningCustomer, true);
    assert.equal(recreatedAccountStatus.canAccess, false);
  } finally {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  }
});

test("deleting an account without a phone does not create a phone-history record", async () => {
  let saveCount = 0;
  await rememberFormerAccountPhone(null, async () => {
    saveCount += 1;
  });
  assert.equal(saveCount, 0);
});
