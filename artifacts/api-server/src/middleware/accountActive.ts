import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getAccountStatus } from "../routes/accountStatus.js";
import { isSystemAdminEmail } from "../lib/systemAdmin.js";

/**
 * Requires an authenticated account with either an active trial or a current
 * paid subscription. Keep this check server-side so an expired session cannot
 * bypass the app's subscription screen by calling data endpoints directly.
 */
export async function requireAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  try {
    const [user] = await db
      .select({
        trialStartedAt: usersTable.trialStartedAt,
        trialEligible: usersTable.trialEligible,
        hasEverPaid: usersTable.hasEverPaid,
        stripeSubscriptionId: usersTable.stripeSubscriptionId,
        stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
        subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
        maxBarbers: usersTable.maxBarbers,
      email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    if (!isSystemAdminEmail(user.email) && !getAccountStatus(user).canAccess) {
      res.status(403).json({
        code: "SUBSCRIPTION_EXPIRED",
        error: "A assinatura ou o período de teste expirou. Reative sua assinatura para continuar.",
      });
      return;
    }
  } catch (error) {
    next(error);
    return;
  }

  next();
}

// Compatibility names for the existing route modules. Both enforce the same
// authenticated, active-account contract.
export const requireActiveAuth = requireAccess;
export const requireActiveAccount = requireAccess;
