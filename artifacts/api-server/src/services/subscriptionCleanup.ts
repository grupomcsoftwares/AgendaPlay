import { db, usersTable } from "@workspace/db";
import { and, asc, eq, lte, or } from "drizzle-orm";
import { isSystemAdminEmail } from "../lib/systemAdmin.js";
import { logger } from "../lib/logger.js";
import { getAccountStatus } from "../routes/accountStatus.js";
import { deleteAccountData } from "./accountDeletion.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 25;

let lastCleanupStartedAt = 0;
let cleanupPromise: Promise<number> | null = null;

export async function cleanupExpiredAccounts(
  limit = CLEANUP_BATCH_SIZE,
): Promise<number> {
  const now = new Date();
  const eligibleTrialCutoff = new Date(now.getTime() - 120 * DAY_MS);
  const noTrialCutoff = new Date(now.getTime() - 90 * DAY_MS);

  const candidates = await db
    .select()
    .from(usersTable)
    .where(and(
      eq(usersTable.hasEverPaid, false),
      or(
        and(
          eq(usersTable.trialEligible, true),
          lte(usersTable.trialStartedAt, eligibleTrialCutoff),
        ),
        and(
          eq(usersTable.trialEligible, false),
          lte(usersTable.trialStartedAt, noTrialCutoff),
        ),
      ),
    ))
    .orderBy(asc(usersTable.trialStartedAt))
    .limit(limit);

  let deleted = 0;
  for (const user of candidates) {
    if (isSystemAdminEmail(user.email)) continue;
    if (!getAccountStatus(user).deletionDue) continue;
    if (await deleteAccountData(user.id, { onlyIfDeletionDue: true })) {
      deleted += 1;
    }
  }

  if (deleted > 0) {
    logger.info({ deleted }, "Expired unpaid accounts deleted");
  }
  return deleted;
}

export function maybeRunExpiredAccountCleanup(): Promise<number> {
  const now = Date.now();
  if (cleanupPromise) return cleanupPromise;
  if (now - lastCleanupStartedAt < CLEANUP_INTERVAL_MS) {
    return Promise.resolve(0);
  }

  lastCleanupStartedAt = now;
  cleanupPromise = cleanupExpiredAccounts()
    .catch((error) => {
      logger.error({ err: error }, "Expired account cleanup failed");
      return 0;
    })
    .finally(() => {
      cleanupPromise = null;
    });
  return cleanupPromise;
}

export async function cleanupExpiredAccountByEmail(email: string): Promise<boolean> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user || isSystemAdminEmail(user.email) || !getAccountStatus(user).deletionDue) {
    return false;
  }
  return deleteAccountData(user.id, { onlyIfDeletionDue: true });
}