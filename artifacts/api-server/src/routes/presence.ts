import { Router, type IRouter, type Request, type Response } from "express";
import { gte, sql } from "drizzle-orm";
import { db, onlinePresenceTable, usersTable } from "@workspace/db";
import {
  GetAdminOnlineUsersResponse,
  RecordPresenceHeartbeatResponse,
} from "@workspace/api-zod";
import { requireSystemAdmin } from "../lib/systemAdmin.js";
import { getAccountStatus } from "./accountStatus.js";

const router: IRouter = Router();

export const PRESENCE_WINDOW_SECONDS = 60;

router.post(
  "/presence/heartbeat",
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    const recordedAt = new Date();
    await db
      .insert(onlinePresenceTable)
      .values({ userId, lastSeenAt: recordedAt })
      .onConflictDoUpdate({
        target: onlinePresenceTable.userId,
        set: { lastSeenAt: recordedAt },
      });

    res.json(
      RecordPresenceHeartbeatResponse.parse({
        online: true,
        recordedAt: recordedAt.toISOString(),
      }),
    );
  },
);

router.get(
  "/admin/online-users",
  requireSystemAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const updatedAt = new Date();
    const activeSince = new Date(
      updatedAt.getTime() - PRESENCE_WINDOW_SECONDS * 1000,
    );
    const [onlineResult, accounts] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(onlinePresenceTable)
        .where(gte(onlinePresenceTable.lastSeenAt, activeSince)),
      db
        .select({
          email: usersTable.email,
          barbershopName: usersTable.barbershopName,
          trialStartedAt: usersTable.trialStartedAt,
          stripeSubscriptionId: usersTable.stripeSubscriptionId,
          stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
          subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
        })
        .from(usersTable)
        .orderBy(usersTable.createdAt),
    ]);

    const accountSummaries = accounts.map((account) => {
      const status = getAccountStatus(account);
      const billingStatus: "paid" | "trial" | "expired" = status.hasActiveSubscription
        ? "paid"
        : status.trialExpired
          ? "expired"
          : "trial";
      return {
        email: account.email,
        barbershopName: account.barbershopName,
        billingStatus,
      };
    });
    const paidAccounts = accountSummaries.filter((account) => account.billingStatus === "paid").length;
    const trialAccounts = accountSummaries.filter((account) => account.billingStatus === "trial").length;
    const expiredAccounts = accountSummaries.filter((account) => account.billingStatus === "expired").length;

    res.json(
      GetAdminOnlineUsersResponse.parse({
        onlineUsers: Number(onlineResult[0]?.count ?? 0),
        registeredAccounts: accountSummaries.length,
        paidAccounts,
        trialAccounts,
        expiredAccounts,
        accounts: accountSummaries,
        activeWindowSeconds: PRESENCE_WINDOW_SECONDS,
        updatedAt: updatedAt.toISOString(),
      }),
    );
  },
);

export default router;