import { Router, type IRouter, type Request, type Response } from "express";
import { gte, sql } from "drizzle-orm";
import { db, onlinePresenceTable, usersTable } from "@workspace/db";
import {
  GetAdminOnlineUsersResponse,
  RecordPresenceHeartbeatResponse,
} from "@workspace/api-zod";
import { requireSystemAdmin } from "../lib/systemAdmin.js";

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
    const [onlineResult, registeredResult] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(onlinePresenceTable)
        .where(gte(onlinePresenceTable.lastSeenAt, activeSince)),
      db
        .select({
          registered: sql<number>`COUNT(*)::int`,
          paid: sql<number>`COUNT(*) FILTER (
            WHERE COALESCE(
              ${usersTable.stripeCurrentPeriodEnd},
              ${usersTable.subscriptionExpiresAt},
              '-infinity'::timestamptz
            ) > NOW()
          )::int`,
          trial: sql<number>`COUNT(*) FILTER (
            WHERE COALESCE(
              ${usersTable.stripeCurrentPeriodEnd},
              ${usersTable.subscriptionExpiresAt},
              '-infinity'::timestamptz
            ) <= NOW()
              AND ${usersTable.trialStartedAt} > NOW() - INTERVAL '30 days'
          )::int`,
          expired: sql<number>`COUNT(*) FILTER (
            WHERE COALESCE(
              ${usersTable.stripeCurrentPeriodEnd},
              ${usersTable.subscriptionExpiresAt},
              '-infinity'::timestamptz
            ) <= NOW()
              AND ${usersTable.trialStartedAt} <= NOW() - INTERVAL '30 days'
          )::int`,
        })
        .from(usersTable),
    ]);

    res.json(
      GetAdminOnlineUsersResponse.parse({
        onlineUsers: Number(onlineResult[0]?.count ?? 0),
        registeredAccounts: Number(registeredResult[0]?.registered ?? 0),
        paidAccounts: Number(registeredResult[0]?.paid ?? 0),
        trialAccounts: Number(registeredResult[0]?.trial ?? 0),
        expiredAccounts: Number(registeredResult[0]?.expired ?? 0),
        activeWindowSeconds: PRESENCE_WINDOW_SECONDS,
        updatedAt: updatedAt.toISOString(),
      }),
    );
  },
);

export default router;