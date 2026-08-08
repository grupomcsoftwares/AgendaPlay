import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { accountCanAccess } from "../routes/accountStatus.js";

export async function requireActiveAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  await requireActiveAccount(req, res, next);
}

export async function requireActiveAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  const [user] = await db
    .select({
      trialStartedAt: usersTable.trialStartedAt,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      maxBarbers: usersTable.maxBarbers,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || !accountCanAccess(user)) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "A assinatura ou o período de teste expirou.",
    });
    return;
  }
  next();
}
