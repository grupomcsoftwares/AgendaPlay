import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { db, appointmentsTable, barbersTable } from "@workspace/db";
import { GetFinancialSummaryQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/financial/summary", async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const query = GetFinancialSummaryQueryParams.safeParse(req.query);
  const now = new Date();

  let rangeStart: Date;
  let rangeEnd: Date;

  if (query.success && query.data.dateStart && query.data.dateEnd) {
    rangeStart = new Date(query.data.dateStart);
    rangeEnd = new Date(query.data.dateEnd);
    // Advance end by one day so the full end date is included
    rangeEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
  } else {
    const month = (query.success && query.data.month) ? Number(query.data.month) : now.getMonth() + 1;
    const year  = (query.success && query.data.year)  ? Number(query.data.year)  : now.getFullYear();
    const day   = (query.success && query.data.day)   ? Number(query.data.day)   : null;
    rangeStart = day !== null ? new Date(year, month - 1, day)     : new Date(year, month - 1, 1);
    rangeEnd   = day !== null ? new Date(year, month - 1, day + 1) : new Date(year, month, 1);
  }

  // Fetch completed appointments joined with barber commission rate
  const rows = await db
    .select({
      servicePrice:   appointmentsTable.servicePrice,
      serviceName:    appointmentsTable.serviceName,
      scheduledAt:    appointmentsTable.scheduledAt,
      barberId:       appointmentsTable.barberId,
      barberName:     appointmentsTable.barberName,
      commissionRate: barbersTable.commissionRate,
    })
    .from(appointmentsTable)
    .leftJoin(barbersTable, eq(appointmentsTable.barberId, barbersTable.id))
    .where(and(
      eq(appointmentsTable.userId, userId),
      gte(appointmentsTable.scheduledAt, rangeStart),
      lt(appointmentsTable.scheduledAt, rangeEnd),
      eq(appointmentsTable.status, "completed"),
    ));

  const totalRevenue      = rows.reduce((sum, a) => sum + parseFloat(a.servicePrice), 0);
  const totalAppointments = rows.length;
  const averageTicket     = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

  // Revenue by service
  const serviceMap = new Map<string, { revenue: number; count: number }>();
  for (const a of rows) {
    const cur = serviceMap.get(a.serviceName) ?? { revenue: 0, count: 0 };
    serviceMap.set(a.serviceName, {
      revenue: cur.revenue + parseFloat(a.servicePrice),
      count:   cur.count + 1,
    });
  }
  const revenueByService = Array.from(serviceMap.entries())
    .map(([serviceName, data]) => ({ serviceName, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  // Revenue by day
  const dayMap = new Map<string, { revenue: number; count: number }>();
  for (const a of rows) {
    const date = a.scheduledAt.toISOString().split("T")[0];
    const cur  = dayMap.get(date) ?? { revenue: 0, count: 0 };
    dayMap.set(date, {
      revenue: cur.revenue + parseFloat(a.servicePrice),
      count:   cur.count + 1,
    });
  }
  const revenueByDay = Array.from(dayMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Commission by barber — only appointments that have a barber assigned
  type BarberAcc = { revenue: number; commissionRate: number; appointmentCount: number };
  const barberMap = new Map<string, BarberAcc>();
  for (const a of rows) {
    if (!a.barberName) continue;
    const rate = a.commissionRate !== null ? parseFloat(a.commissionRate) : 0;
    const cur  = barberMap.get(a.barberName) ?? { revenue: 0, commissionRate: rate, appointmentCount: 0 };
    barberMap.set(a.barberName, {
      revenue:          cur.revenue + parseFloat(a.servicePrice),
      commissionRate:   rate,
      appointmentCount: cur.appointmentCount + 1,
    });
  }
  const commissionByBarber = Array.from(barberMap.entries())
    .map(([barberName, data]) => ({
      barberName,
      revenue:          data.revenue,
      commissionRate:   data.commissionRate,
      commissionAmount: data.commissionRate > 0
        ? Math.round(data.revenue * data.commissionRate) / 100
        : 0,
      appointmentCount: data.appointmentCount,
    }))
    .sort((a, b) => b.commissionAmount - a.commissionAmount);

  res.json({ totalRevenue, totalAppointments, averageTicket, revenueByService, revenueByDay, commissionByBarber });
});

export default router;
