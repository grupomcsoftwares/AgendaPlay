import { Router, type IRouter } from "express";
import { eq, sql, and, gte, lt } from "drizzle-orm";
import { db, appointmentsTable, clientsTable, queueTable } from "@workspace/db";
import { requireActiveAuth } from "../middleware/accountActive.js";

const router: IRouter = Router();

router.get("/dashboard/summary", requireActiveAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [todayAppointments, completedToday, pendingToday, monthlyRevenueResult, totalClientsResult, queueResult, currentResult, nextResult] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.userId, userId), gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd))),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, userId),
        gte(appointmentsTable.scheduledAt, todayStart),
        lt(appointmentsTable.scheduledAt, todayEnd),
        eq(appointmentsTable.status, "completed")
      )),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, userId),
        gte(appointmentsTable.scheduledAt, todayStart),
        lt(appointmentsTable.scheduledAt, todayEnd),
        eq(appointmentsTable.status, "pending")
      )),
    db
      .select({ total: sql<string>`COALESCE(SUM(${appointmentsTable.servicePrice}), 0)` })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, userId),
        gte(appointmentsTable.scheduledAt, monthStart),
        lt(appointmentsTable.scheduledAt, nextMonthStart),
        eq(appointmentsTable.status, "completed")
      )),
    db.select({ count: sql<number>`COUNT(*)` }).from(clientsTable).where(eq(clientsTable.userId, userId)),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(queueTable)
      .where(and(eq(queueTable.userId, userId), sql`${queueTable.status} = 'waiting'`)),
    db
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.userId, userId), eq(appointmentsTable.status, "in_progress")))
      .limit(1),
    db
      .select()
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, userId),
        eq(appointmentsTable.status, "pending"),
        gte(appointmentsTable.scheduledAt, now)
      ))
      .orderBy(appointmentsTable.scheduledAt)
      .limit(1),
  ]);

  const formatAppt = (a: typeof appointmentsTable.$inferSelect) => {
    const { cancelToken: _omit, ...rest } = a;
    void _omit;
    return {
      ...rest,
      servicePrice: parseFloat(a.servicePrice),
      scheduledAt: a.scheduledAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
    };
  };

  res.json({
    appointmentsToday: Number(todayAppointments[0]?.count ?? 0),
    appointmentsCompleted: Number(completedToday[0]?.count ?? 0),
    appointmentsPending: Number(pendingToday[0]?.count ?? 0),
    monthlyRevenue: parseFloat(String(monthlyRevenueResult[0]?.total ?? "0")),
    totalClients: Number(totalClientsResult[0]?.count ?? 0),
    queueCount: Number(queueResult[0]?.count ?? 0),
    currentAppointment: currentResult[0] ? formatAppt(currentResult[0]) : null,
    nextAppointment: nextResult[0] ? formatAppt(nextResult[0]) : null,
  });
});

export default router;
