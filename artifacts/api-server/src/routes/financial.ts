import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { db, appointmentsTable } from "@workspace/db";
import { GetFinancialSummaryQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/financial/summary", async (req, res): Promise<void> => {
  const query = GetFinancialSummaryQueryParams.safeParse(req.query);
  const now = new Date();
  const month = (query.success && query.data.month) ? Number(query.data.month) : now.getMonth() + 1;
  const year = (query.success && query.data.year) ? Number(query.data.year) : now.getFullYear();
  const day = (query.success && query.data.day) ? Number(query.data.day) : null;

  const rangeStart = day !== null ? new Date(year, month - 1, day) : new Date(year, month - 1, 1);
  const rangeEnd = day !== null ? new Date(year, month - 1, day + 1) : new Date(year, month, 1);

  const appointments = await db
    .select()
    .from(appointmentsTable)
    .where(and(
      gte(appointmentsTable.scheduledAt, rangeStart),
      lt(appointmentsTable.scheduledAt, rangeEnd),
      eq(appointmentsTable.status, "completed")
    ));

  const totalRevenue = appointments.reduce((sum, a) => sum + parseFloat(a.servicePrice), 0);
  const totalAppointments = appointments.length;
  const averageTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

  // Revenue by service
  const serviceMap = new Map<string, { revenue: number; count: number }>();
  for (const a of appointments) {
    const existing = serviceMap.get(a.serviceName) ?? { revenue: 0, count: 0 };
    serviceMap.set(a.serviceName, {
      revenue: existing.revenue + parseFloat(a.servicePrice),
      count: existing.count + 1,
    });
  }
  const revenueByService = Array.from(serviceMap.entries())
    .map(([serviceName, data]) => ({ serviceName, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  // Revenue by day
  const dayMap = new Map<string, { revenue: number; count: number }>();
  for (const a of appointments) {
    const date = a.scheduledAt.toISOString().split("T")[0];
    const existing = dayMap.get(date) ?? { revenue: 0, count: 0 };
    dayMap.set(date, {
      revenue: existing.revenue + parseFloat(a.servicePrice),
      count: existing.count + 1,
    });
  }
  const revenueByDay = Array.from(dayMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ totalRevenue, totalAppointments, averageTicket, revenueByService, revenueByDay });
});

export default router;
