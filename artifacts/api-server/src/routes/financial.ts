import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { db, appointmentsTable, barbersTable } from "@workspace/db";
import { GetFinancialSummaryQueryParams } from "@workspace/api-zod";
import { requireActiveAuth } from "../middleware/accountActive.js";

const router: IRouter = Router();
const TZ = "America/Sao_Paulo";

function localDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(day) || day < 1) {
    return false;
  }
  return new Date(Date.UTC(year, month - 1, day)).toISOString().startsWith(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
}

function saoPauloBoundary(year: number, month: number, day: number): Date {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(candidate);
  const localWallTime = Date.UTC(
    Number(parts.find((part) => part.type === "year")?.value),
    Number(parts.find((part) => part.type === "month")?.value) - 1,
    Number(parts.find((part) => part.type === "day")?.value),
    Number(parts.find((part) => part.type === "hour")?.value),
    Number(parts.find((part) => part.type === "minute")?.value),
    Number(parts.find((part) => part.type === "second")?.value),
  );
  return new Date(candidate.getTime() - (localWallTime - candidate.getTime()));
}

router.get("/financial/summary", requireActiveAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const query = GetFinancialSummaryQueryParams.safeParse(req.query);
  const now = new Date();
  const nowParts = localDateParts(now);

  let rangeStart: Date;
  let rangeEnd: Date;

  if (query.success && query.data.dateStart && query.data.dateEnd) {
    const [startYear, startMonth, startDay] = query.data.dateStart.split("-").map(Number);
    const [endYear, endMonth, endDay] = query.data.dateEnd.split("-").map(Number);
    if (
      !isValidCalendarDate(startYear!, startMonth!, startDay!) ||
      !isValidCalendarDate(endYear!, endMonth!, endDay!)
    ) {
      res.status(400).json({ error: "Período inválido." });
      return;
    }
    rangeStart = saoPauloBoundary(startYear!, startMonth!, startDay!);
    rangeEnd = saoPauloBoundary(endYear!, endMonth!, endDay! + 1);
  } else {
    const month = (query.success && query.data.month) ? Number(query.data.month) : nowParts.month;
    const year  = (query.success && query.data.year)  ? Number(query.data.year)  : nowParts.year;
    const day   = (query.success && query.data.day)   ? Number(query.data.day)   : null;
    if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
        !Number.isInteger(month) || month < 1 || month > 12 ||
        (day !== null && !isValidCalendarDate(year, month, day))) {
      res.status(400).json({ error: "Período inválido." });
      return;
    }
    rangeStart = saoPauloBoundary(year, month, day ?? 1);
    rangeEnd = day !== null
      ? saoPauloBoundary(year, month, day + 1)
      : saoPauloBoundary(year, month + 1, 1);
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
    const parts = localDateParts(a.scheduledAt);
    const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
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
    .map(([barberName, data]) => {
      const commissionAmount = data.commissionRate > 0
        ? Math.round(data.revenue * data.commissionRate) / 100
        : 0;
      const shopShareRate = Math.max(0, 100 - data.commissionRate);
      const shopShareAmount = Math.round((data.revenue - commissionAmount) * 100) / 100;

      return {
        barberName,
        revenue: data.revenue,
        commissionRate: data.commissionRate,
        commissionAmount,
        shopShareRate,
        shopShareAmount,
        appointmentCount: data.appointmentCount,
      };
    })
    .sort((a, b) => b.commissionAmount - a.commissionAmount);

  res.json({ totalRevenue, totalAppointments, averageTicket, revenueByService, revenueByDay, commissionByBarber });
});

export default router;
