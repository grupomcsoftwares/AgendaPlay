import { Router, type IRouter, type Request } from "express";
import { eq, and, gte, gt, lt, sql, inArray } from "drizzle-orm";
import { requireActiveAuth } from "../middleware/accountActive.js";
import { db, appointmentsTable, queueTable, servicesTable, serviceDayPricingTable, comboDiscountsTable, settingsTable, barbersTable, usersTable, loyaltyPointsTable, clientsTable, clientSubscriptionsTable, subscriptionPlansTable, clientReengagementPushSubscriptionsTable, type DaySchedule, type WeeklySchedule, type LoyaltyConfig } from "@workspace/db";
import { isBarberAllowedForService } from "./barbers.js";
import { sendAdminPush, sendClientAppointmentPush } from "./push.js";
import { offerNextWaitlistForSlot } from "../waitlistService.js";
import { broadcastQueueUpdate } from "./queue.js";
import { accountCanAccess } from "./accountStatus.js";
import {
  ListAppointmentsQueryParams,
  CreateAppointmentBody,
  GetAppointmentParams,
  UpdateAppointmentParams,
  UpdateAppointmentBody,
  DeleteAppointmentParams,
  StartAppointmentParams,
  CompleteAppointmentParams,
  CancelAppointmentParams,
  GetAvailabilityQueryParams,
} from "@workspace/api-zod";

const TZ = "America/Sao_Paulo";
const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"] as const;
const DEFAULT_DAY_SCHEDULE: DaySchedule = {
  closed: false,
  open: "09:00",
  close: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
};

function localHHMM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit" }).format(d);
}
function localYMD(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const day = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}
function localDayKey(d: Date): typeof DAY_KEYS[number] {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const map: Record<string, typeof DAY_KEYS[number]> = { Sun: "sunday", Mon: "monday", Tue: "tuesday", Wed: "wednesday", Thu: "thursday", Fri: "friday", Sat: "saturday" };
  return map[wd] ?? "monday";
}
function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isValidCalendarDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return false;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().startsWith(value);
}

function isValidScheduledAtString(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.exec(value);
  return Boolean(match && isValidCalendarDateString(match[1]!));
}

function saoPauloBoundary(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year!, month! - 1, day!));
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

async function getEffectiveDaySchedule(
  shopId: string,
  date: Date,
  barberId: number | null | undefined,
): Promise<DaySchedule> {
  const [settings] = await db
    .select({ weeklySchedule: settingsTable.weeklySchedule })
    .from(settingsTable)
    .where(eq(settingsTable.userId, shopId))
    .limit(1);

  let barberWeekly: WeeklySchedule | null = null;
  if (typeof barberId === "number") {
    const [barber] = await db
      .select({ weeklySchedule: barbersTable.weeklySchedule })
      .from(barbersTable)
      .where(and(eq(barbersTable.id, barberId), eq(barbersTable.userId, shopId)))
      .limit(1);
    barberWeekly = (barber?.weeklySchedule ?? null) as WeeklySchedule | null;
  }

  const shopWeekly = (settings?.weeklySchedule ?? null) as WeeklySchedule | null;
  const weekly = barberWeekly ?? shopWeekly;
  return weekly?.[localDayKey(date)] ?? DEFAULT_DAY_SCHEDULE;
}

async function getBookingWindowError(
  shopId: string,
  date: Date,
  duration: number,
  barberId: number | null | undefined,
): Promise<string | null> {
  if (date.getTime() <= Date.now()) return "O horário deve estar no futuro.";
  const [settings] = await db
    .select({ maxBookingDays: settingsTable.maxBookingDays })
    .from(settingsTable)
    .where(eq(settingsTable.userId, shopId))
    .limit(1);
  const maxBookingDays = settings?.maxBookingDays ?? 30;
  const todayDate = new Date(`${localYMD(new Date())}T12:00:00Z`);
  const requestedDate = new Date(`${localYMD(date)}T12:00:00Z`);
  const daysDiff = Math.round((requestedDate.getTime() - todayDate.getTime()) / (24 * 3600 * 1000));
  if (daysDiff < 0 || daysDiff >= maxBookingDays) {
    return "A data está fora da janela de agendamento.";
  }

  const day = await getEffectiveDaySchedule(shopId, date, barberId);
  if (day.closed) return "A barbearia não funciona neste dia.";
  const startMin = parseHHMM(localHHMM(date));
  const endMin = startMin + duration;
  const openMin = parseHHMM(day.open);
  const closeMin = parseHHMM(day.close);
  const lunchStart = parseHHMM(day.lunchStart);
  const lunchEnd = parseHHMM(day.lunchEnd);
  if (startMin < openMin || endMin > closeMin) {
    return "O horário está fora do expediente da barbearia.";
  }
  if (lunchEnd > lunchStart && startMin < lunchEnd && endMin > lunchStart) {
    return "O horário escolhido coincide com o intervalo da barbearia.";
  }
  return null;
}

export async function resolveAuthoritativeBooking(
  shopId: string,
  data: {
    serviceId?: number;
    serviceIds?: number[];
    serviceName: string;
    servicePrice: number;
    serviceDuration: number;
  },
  date: Date,
  isPublicBooking: boolean,
): Promise<{
  serviceId: number | null;
  serviceName: string;
  serviceDuration: number;
  servicePrice: number;
  serviceIds: number[];
} | { error: string }> {
  const requestedIds = Array.from(new Set(
    (data.serviceIds?.length ? data.serviceIds : data.serviceId ? [data.serviceId] : [])
      .filter((id): id is number => Number.isInteger(id) && id > 0),
  ));
  if (requestedIds.length === 0) {
    return { error: isPublicBooking ? "Selecione ao menos um serviço cadastrado." : "serviceId é obrigatório." };
  }
  if (isPublicBooking && !data.serviceIds?.length) {
    return { error: "Os serviços selecionados são obrigatórios." };
  }
  if (data.serviceId != null && requestedIds.length === 1 && data.serviceId !== requestedIds[0]) {
    return { error: "Serviço inválido." };
  }

  const services = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.userId, shopId), inArray(servicesTable.id, requestedIds)));
  const byId = new Map(services.map((service) => [service.id, service]));
  if (services.length !== requestedIds.length) {
    return { error: "Um dos serviços selecionados não está disponível." };
  }
  const ordered = requestedIds.map((id) => byId.get(id)!);
  const dayOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    .indexOf(localDayKey(date));
  const dayPrices = await db
    .select()
    .from(serviceDayPricingTable)
    .where(inArray(serviceDayPricingTable.serviceId, requestedIds));
  const dayPriceByService = new Map(
    dayPrices
      .filter((price) => price.dayOfWeek === dayOfWeek)
      .map((price) => [price.serviceId, parseFloat(price.price)]),
  );
  const basePrices = new Map(ordered.map((service) => [
    service.id,
    dayPriceByService.get(service.id) ?? parseFloat(service.price),
  ]));
  const totalBasePrice = ordered.reduce((sum, service) => sum + (basePrices.get(service.id) ?? 0), 0);
  const totalBaseDuration = ordered.reduce((sum, service) => sum + service.durationMinutes, 0);
  let price = totalBasePrice;
  let duration = totalBaseDuration;
  const [settings] = await db
    .select({ combosEnabled: settingsTable.combosEnabled })
    .from(settingsTable)
    .where(eq(settingsTable.userId, shopId))
    .limit(1);
  if (settings?.combosEnabled !== false && requestedIds.length > 1) {
    const combos = await db
      .select()
      .from(comboDiscountsTable)
      .where(eq(comboDiscountsTable.userId, shopId));
    const applicable = combos
      .filter((combo) =>
        combo.enabled &&
        combo.serviceIds.length >= 2 &&
        combo.serviceIds.every((id) => requestedIds.includes(id)),
      )
      .sort((a, b) => {
        const aValue = a.discountType === "value"
          ? parseFloat(a.discountPercent)
          : (a.serviceIds.reduce((sum, id) => sum + (basePrices.get(id) ?? 0), 0) * parseFloat(a.discountPercent)) / 100;
        const bValue = b.discountType === "value"
          ? parseFloat(b.discountPercent)
          : (b.serviceIds.reduce((sum, id) => sum + (basePrices.get(id) ?? 0), 0) * parseFloat(b.discountPercent)) / 100;
        return bValue - aValue;
      })[0];
    if (applicable) {
      const comboPrice = applicable.serviceIds.reduce((sum, id) => sum + (basePrices.get(id) ?? 0), 0);
      const discount = applicable.discountType === "value"
        ? parseFloat(applicable.discountPercent)
        : (comboPrice * parseFloat(applicable.discountPercent)) / 100;
      price = Math.max(0, totalBasePrice - discount);
      duration = Math.max(5, totalBaseDuration - applicable.timeDiscountMinutes);
    }
  }
  return {
    serviceId: requestedIds.length === 1 ? requestedIds[0]! : null,
    serviceIds: requestedIds,
    serviceName: ordered.map((service) => service.name).join(" + "),
    serviceDuration: duration,
    servicePrice: price,
  };
}

function resolveShop(req: Request): string | null {
  if (req.session?.userId) return req.session.userId;
  const shopId = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
  return shopId || null;
}

const router: IRouter = Router();

function formatAppointment(a: typeof appointmentsTable.$inferSelect) {
  const { cancelToken: _omit, ...rest } = a;
  void _omit;
  return {
    ...rest,
    servicePrice: parseFloat(a.servicePrice),
    scheduledAt: a.scheduledAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  };
}

function formatAppointmentWithToken(a: typeof appointmentsTable.$inferSelect) {
  return {
    ...a,
    servicePrice: parseFloat(a.servicePrice),
    scheduledAt: a.scheduledAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  };
}

function isBlockingAppointment(status: string): boolean {
  return status !== "cancelled" && status !== "payment_rejected" && status !== "completed";
}

/**
 * Auto-start / auto-complete appointments based on wall-clock time.
 * Runs independently of the live queue so appointments get the right status
 * even when the barbeiro has not opened the queue view.
 *
 *  pending  → in_progress  when  scheduledAt          <= now
 *  in_progress → completed when  scheduledAt + duration <= now
 */
async function autoAdvanceAppointmentsByTime(userId: string): Promise<void> {
  const now = new Date();
  let queueChanged = false;

  await db.transaction(async (tx) => {
    // Serialize scheduler runs across API instances. This prevents two
    // autoscale processes from starting the same waiting client at once.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(742004, hashtext(${userId}))`);

    // Keep appointment and live-queue timing aligned. The service duration
    // starts when the barber actually starts the queue entry, not when the
    // customer was originally scheduled.
    const activeAppointmentRows = await tx
      .select({
        queueId: queueTable.id,
        appointmentId: queueTable.appointmentId,
        startedAt: queueTable.startedAt,
        serviceDuration: queueTable.serviceDuration,
      })
      .from(queueTable)
      .where(and(
        eq(queueTable.userId, userId),
        eq(queueTable.status, "in_progress"),
        sql`${queueTable.appointmentId} IS NOT NULL`,
      ));

    const completedRows = activeAppointmentRows.filter((row) => (
      row.appointmentId !== null &&
      row.startedAt !== null &&
      row.startedAt.getTime() + row.serviceDuration * 60_000 <= now.getTime()
    ));
    const completedAppointmentIds = completedRows
      .map((row) => row.appointmentId)
      .filter((id): id is number => id !== null);

    if (completedRows.length > 0) {
      queueChanged = true;
      await tx
        .update(queueTable)
        .set({ status: "completed" })
        .where(inArray(queueTable.id, completedRows.map((row) => row.queueId)));
      await tx
        .update(appointmentsTable)
        .set({ status: "completed" })
        .where(inArray(appointmentsTable.id, completedAppointmentIds));
    }

    // Do not automatically start another appointment while a walk-in or
    // another appointment is still being served.
    const activeQueue = await tx
      .select({ id: queueTable.id })
      .from(queueTable)
      .where(and(
        eq(queueTable.userId, userId),
        eq(queueTable.status, "in_progress"),
      ))
      .limit(1);
    const activeAppointment = await tx
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, userId),
        eq(appointmentsTable.status, "in_progress"),
      ))
      .limit(1);

    if (activeQueue.length > 0 || activeAppointment.length > 0) return;

    // Start only the earliest appointment that is due. This avoids starting
    // several delayed appointments at the same time after the server wakes up.
    const [nextDue] = await tx
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, userId),
        eq(appointmentsTable.status, "pending"),
        lt(appointmentsTable.scheduledAt, now),
      ))
      .orderBy(appointmentsTable.scheduledAt)
      .limit(1);

    if (!nextDue) return;

    const started = await tx
      .update(appointmentsTable)
      .set({ status: "in_progress" })
      .where(
        and(
          eq(appointmentsTable.id, nextDue.id),
          eq(appointmentsTable.userId, userId),
          eq(appointmentsTable.status, "pending"),
        ),
      )
      .returning({ id: appointmentsTable.id });

    if (started.length > 0) {
      queueChanged = true;
      await tx
        .update(queueTable)
        .set({ status: "in_progress", startedAt: now })
        .where(and(
          inArray(queueTable.appointmentId, started.map((appointment) => appointment.id)),
          sql`${queueTable.status} = 'waiting'`,
        ));
    }
  });

  if (queueChanged) broadcastQueueUpdate(userId);
}

export async function canShopAutoAdvance(userId: string): Promise<boolean> {
  const [account] = await db
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
  return Boolean(account && accountCanAccess(account));
}

let appointmentSchedulerRunning = false;

/**
 * Advances every shop's due appointments without depending on the TV,
 * barber panel, or public booking page being open.
 */
export async function runAppointmentScheduler(): Promise<void> {
  if (appointmentSchedulerRunning) return;
  appointmentSchedulerRunning = true;

  try {
    const rows = await db
      .select({ userId: appointmentsTable.userId })
      .from(appointmentsTable)
      .where(sql`${appointmentsTable.status} IN ('pending', 'in_progress')`);

    const userIds = [...new Set(rows.map((row) => row.userId))];
    for (const userId of userIds) {
      await autoAdvanceAppointmentsByTime(userId);
    }
  } finally {
    appointmentSchedulerRunning = false;
  }
}

export function startAppointmentScheduler(): void {
  void runAppointmentScheduler().catch(() => {});
  setInterval(() => {
    void runAppointmentScheduler().catch(() => {});
  }, 30_000);
}

router.get("/appointments", requireActiveAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  // Auto-advance stale appointments before returning the list so the admin
  // panel always sees accurate statuses without needing the queue to be open.
  await autoAdvanceAppointmentsByTime(userId);
  const query = ListAppointmentsQueryParams.safeParse(req.query);
  let appointments;
  if (query.success && query.data.dateStart && query.data.dateEnd) {
    if (
      !isValidCalendarDateString(query.data.dateStart) ||
      !isValidCalendarDateString(query.data.dateEnd)
    ) {
      res.status(400).json({ error: "Período inválido." });
      return;
    }
    const rangeStart = saoPauloBoundary(query.data.dateStart);
    const endDate = new Date(`${query.data.dateEnd}T12:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const rangeEnd = saoPauloBoundary(endDate.toISOString().slice(0, 10));
    appointments = await db
      .select()
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, userId),
        gte(appointmentsTable.scheduledAt, rangeStart),
        lt(appointmentsTable.scheduledAt, rangeEnd),
      ))
      .orderBy(appointmentsTable.scheduledAt);
  } else if (query.success && query.data.date) {
    if (!isValidCalendarDateString(query.data.date)) {
      res.status(400).json({ error: "Data inválida." });
      return;
    }
    const date = saoPauloBoundary(query.data.date);
    const nextDayValue = new Date(`${query.data.date}T12:00:00Z`);
    nextDayValue.setUTCDate(nextDayValue.getUTCDate() + 1);
    const nextDay = saoPauloBoundary(nextDayValue.toISOString().slice(0, 10));
    appointments = await db
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.userId, userId), gte(appointmentsTable.scheduledAt, date), lt(appointmentsTable.scheduledAt, nextDay)))
      .orderBy(appointmentsTable.scheduledAt);
  } else if (query.success && query.data.status) {
    appointments = await db
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.userId, userId), eq(appointmentsTable.status, query.data.status)))
      .orderBy(appointmentsTable.scheduledAt);
  } else {
    appointments = await db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.userId, userId))
      .orderBy(appointmentsTable.scheduledAt);
  }
  res.json(appointments.map(formatAppointment));
});

router.get("/availability", async (req, res): Promise<void> => {
  const shopId = resolveShop(req);
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
    return;
  }

  const parsed = GetAvailabilityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    date,
    serviceId,
    serviceDuration: serviceDurationParam,
    barberId,
    excludeAppointmentToken,
  } = parsed.data;
  if (!isValidCalendarDateString(date)) {
    res.status(400).json({ error: "Invalid date (expected a real YYYY-MM-DD date)" });
    return;
  }

  let duration: number;
  if (typeof serviceDurationParam === "number" && serviceDurationParam > 0) {
    duration = serviceDurationParam;
  } else if (typeof serviceId === "number") {
    const [service] = await db.select().from(servicesTable)
      .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.userId, shopId)));
    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
    duration = service.durationMinutes;
  } else {
    res.status(400).json({ error: "serviceId ou serviceDuration obrigatório" });
    return;
  }
  const barberFilter = typeof barberId === "number" ? barberId : null;

  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.userId, shopId)).limit(1);
  const shopWeekly = (settings?.weeklySchedule ?? null) as WeeklySchedule | null;

  // Booking rules from settings
  const maxBookingDays = settings?.maxBookingDays ?? 30;
  const minAdvanceMinutes = 0; // always show nearest available slot — no advance buffer
  const slotIntervalMinutes = settings?.slotIntervalMinutes ?? 15;
  const smartSlots = settings?.smartSlots ?? false;

  // Reject dates too far in the future
  const today = localYMD(new Date());
  const requestedDate = new Date(`${date}T12:00:00Z`);
  const todayDate = new Date(`${today}T12:00:00Z`);
  const daysDiff = Math.round((requestedDate.getTime() - todayDate.getTime()) / (24 * 3600 * 1000));
  // maxBookingDays is the number of selectable calendar days including today.
  // For example, a 7-day window exposes today through today + 6.
  if (daysDiff >= maxBookingDays) {
    res.json({ date, dayClosed: true, waitlistAvailable: false, slots: [] });
    return;
  }

  let barberWeekly: WeeklySchedule | null = null;
  if (barberFilter !== null) {
    const [b] = await db.select().from(barbersTable)
      .where(and(eq(barbersTable.id, barberFilter), eq(barbersTable.userId, shopId)));
    barberWeekly = (b?.weeklySchedule ?? null) as WeeklySchedule | null;
  }
  const weekly = barberWeekly ?? shopWeekly;

  const target = new Date(`${date}T12:00:00Z`);
  const dayKey = localDayKey(target);
  const defaults: DaySchedule = { closed: false, open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00" };
  const day: DaySchedule = weekly?.[dayKey] ?? defaults;

  if (day.closed) {
    res.json({ date, dayClosed: true, waitlistAvailable: false, slots: [] });
    return;
  }

  const openMin = parseHHMM(day.open);
  const closeMin = parseHHMM(day.close);
  const lunchStart = parseHHMM(day.lunchStart);
  const lunchEnd = parseHHMM(day.lunchEnd);
  const hasLunch = lunchEnd > lunchStart;

  const dStart = new Date(`${date}T00:00:00Z`);
  const before = new Date(dStart.getTime() - 24 * 3600 * 1000);
  const after = new Date(dStart.getTime() + 48 * 3600 * 1000);
  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.userId, shopId), gte(appointmentsTable.scheduledAt, before), lt(appointmentsTable.scheduledAt, after)));

  let excludedAppointmentId: number | null = null;
  if (excludeAppointmentToken) {
    const [excludedAppointment] = await db
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.cancelToken, excludeAppointmentToken),
        eq(appointmentsTable.userId, shopId),
      ))
      .limit(1);
    if (!excludedAppointment) {
      res.status(400).json({ error: "Token de agendamento inválido." });
      return;
    }
    excludedAppointmentId = excludedAppointment.id;
  }

  const blocked: Array<[number, number]> = [];
  for (const a of appts) {
    if (a.id === excludedAppointmentId) continue;
    if (!isBlockingAppointment(a.status)) continue;
    if (localYMD(a.scheduledAt) !== date) continue;
    if (barberFilter !== null && a.barberId !== null && a.barberId !== barberFilter) continue;
    const start = parseHHMM(localHHMM(a.scheduledAt));
    blocked.push([start, start + a.serviceDuration]);
  }

  const now = new Date();
  const nowMin = localYMD(now) === date ? parseHHMM(localHHMM(now)) : -1;

  const slots: Array<{ time: string; available: boolean }> = [];
  // Step: smartSlots spaces slots by the service duration itself so each slot
  // is a natural fit for the selected service/combo. Normal mode uses the
  // configured fixed grid (e.g. every 15 min).
  const step = smartSlots ? Math.max(5, duration) : Math.max(5, slotIntervalMinutes);
  const BUFFER = 0; // no gap between appointments — back-to-back booking allowed
  for (let t = openMin; t + duration <= closeMin; t += step) {
    const end = t + duration;
    const overlapsLunch = hasLunch && t < lunchEnd && end > lunchStart;
    const overlapsAppt = blocked.some(([s, e]) => t < e + BUFFER && end + BUFFER > s);
    const inPast = nowMin >= 0 && t < nowMin + minAdvanceMinutes;
    const available = !overlapsLunch && !overlapsAppt && !inPast;
    const hh = Math.floor(t / 60).toString().padStart(2, "0");
    const mm = (t % 60).toString().padStart(2, "0");
    slots.push({ time: `${hh}:${mm}`, available });
  }

  const waitlistAvailable = nowMin < 0 || nowMin + duration <= closeMin;
  res.json({ date, dayClosed: false, waitlistAvailable, slots });
});

router.post("/appointments", async (req, res): Promise<void> => {
  // shopId can come from session (admin booking) or body (public booking page)
  const isAdminBooking = !!req.session?.userId;
  const shopId = req.session?.userId ?? (typeof req.body?.shopId === "string" ? req.body.shopId.trim() : "");
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
    return;
  }
  const [account] = await db
    .select({
      trialStartedAt: usersTable.trialStartedAt,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      maxBarbers: usersTable.maxBarbers,
    })
    .from(usersTable)
    .where(eq(usersTable.id, shopId))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Barbearia não encontrada" });
    return;
  }
  if (!accountCanAccess(account)) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "Não é possível criar agendamentos porque a assinatura expirou.",
    });
    return;
  }

  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const scheduledAtDate = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAtDate.getTime())) {
    res.status(400).json({ error: "Invalid scheduledAt" });
    return;
  }
  const authoritative = await resolveAuthoritativeBooking(
    shopId,
    parsed.data,
    scheduledAtDate,
    !isAdminBooking,
  );
  if ("error" in authoritative) {
    res.status(400).json({ error: authoritative.error });
    return;
  }
  const localDate = localYMD(scheduledAtDate);
  const startMin = parseHHMM(localHHMM(scheduledAtDate));
  const bookingWindowError = await getBookingWindowError(
    shopId,
    scheduledAtDate,
    authoritative.serviceDuration,
    typeof parsed.data.barberId === "number" ? parsed.data.barberId : null,
  );
  if (bookingWindowError) {
    res.status(400).json({ error: bookingWindowError });
    return;
  }
  const endMin = startMin + authoritative.serviceDuration;

  if (typeof parsed.data.barberId === "number") {
    for (const serviceId of authoritative.serviceIds) {
      const check = await isBarberAllowedForService(db, parsed.data.barberId, serviceId, shopId);
      if (!check.ok) {
        res.status(400).json({ error: `Profissional inválido: ${check.reason}` });
        return;
      }
      parsed.data.barberName = check.barberName;
    }
  } else {
    parsed.data.barberName = undefined;
  }

  // ── Loyalty: setup, fast-path validation, authoritative discount ─────────
  const loyaltyPointsRedeemed = parsed.data.loyaltyPointsRedeemed ?? 0;

  // Extract phone from notes once — used for both redemption and earning.
  const notesStr = parsed.data.notes ?? "";
  const phoneMatch = notesStr.match(/Tel:\s*([\d\s()\-+.]+)/);
  const loyaltyPhone = phoneMatch ? (phoneMatch[1] ?? "").replace(/\D/g, "") || null : null;

  // Load loyalty config if there is a phone (needed for earning even without redemption).
  let loyaltyConfig: LoyaltyConfig | null = null;
  if (loyaltyPhone) {
    const [settingsRow] = await db
      .select({ lc: settingsTable.loyaltyConfig })
      .from(settingsTable)
      .where(eq(settingsTable.userId, shopId))
      .limit(1);
    loyaltyConfig = (settingsRow?.lc ?? null) as LoyaltyConfig | null;
  }

  // Fast-path redemption validation (UX error before entering transaction).
  let loyaltyDiscount = 0;
  if (loyaltyPointsRedeemed > 0) {
    if (!loyaltyPhone) {
      res.status(400).json({ error: "Telefone necessário para resgate de pontos" });
      return;
    }
    if (!loyaltyConfig?.enabled || !loyaltyConfig.pointsPerRedemptionUnit) {
      res.status(400).json({ error: "Programa de fidelidade não está ativo" });
      return;
    }
    const expirationDays = loyaltyConfig.expirationDays ?? 0;
    if (expirationDays > 0) {
      await db
        .update(loyaltyPointsTable)
        .set({ points: 0, updatedAt: new Date() })
        .where(and(
          eq(loyaltyPointsTable.userId, shopId),
          eq(loyaltyPointsTable.clientPhone, loyaltyPhone),
          gt(loyaltyPointsTable.points, 0),
          lt(loyaltyPointsTable.updatedAt, sql`NOW() - (${expirationDays} * INTERVAL '1 day')`),
        ));
    }
    const [balanceRow] = await db
      .select({ points: loyaltyPointsTable.points })
      .from(loyaltyPointsTable)
      .where(and(eq(loyaltyPointsTable.userId, shopId), eq(loyaltyPointsTable.clientPhone, loyaltyPhone)))
      .limit(1);
    if ((balanceRow?.points ?? 0) < loyaltyPointsRedeemed) {
      res.status(400).json({ error: "Pontos insuficientes para resgate" });
      return;
    }
    // Authoritative discount: integer R$ (server-computed, not from client)
    loyaltyDiscount = Math.floor(loyaltyPointsRedeemed / loyaltyConfig.pointsPerRedemptionUnit);
  }

  // Final price is server-authoritative. Service and combo values come from
  // the shop catalog; only the loyalty discount is applied afterward.
  const finalServicePrice = Math.max(0, authoritative.servicePrice - loyaltyDiscount);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Subscription credits validation ─────────────────────────────────────
  const coveredByPlan = parsed.data.coveredByPlan ?? false;
  let subscriptionCreditCost = 0;
  let subscriptionCreditError: string | null = null;
  if (coveredByPlan && loyaltyPhone) {
    const [sub] = await db
      .select()
      .from(clientSubscriptionsTable)
      .where(and(
        eq(clientSubscriptionsTable.userId, shopId),
        eq(clientSubscriptionsTable.clientPhone, loyaltyPhone),
        eq(clientSubscriptionsTable.status, "active"),
      ))
      .limit(1);
    if (!sub) {
      subscriptionCreditError = "Assinatura não encontrada ou inativa";
    } else if (sub.expiresAt && new Date() > new Date(sub.expiresAt)) {
      subscriptionCreditError = "Créditos do plano expiraram";
    } else {
      const creditCost = Math.ceil(finalServicePrice);
      const remaining = sub.creditsRemaining ?? 0;
      if (remaining < creditCost) {
        subscriptionCreditError = `Créditos insuficientes no plano. Necessário ${creditCost}, disponível ${remaining}.`;
      } else {
        subscriptionCreditCost = creditCost;
      }
    }
  }
  if (subscriptionCreditError) {
    res.status(400).json({ error: subscriptionCreditError });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  let conflict = false;
  let redeemConflict = false;
  const awaitingPayment = parsed.data.paymentMethod === "now" && !isAdminBooking;
  const appointment = await db.transaction(async (tx) => {
    let hash = 0;
    for (let i = 0; i < localDate.length; i++) hash = ((hash << 5) - hash + localDate.charCodeAt(i)) | 0;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(742003, ${hash})`);

    const expirationDays = loyaltyConfig?.expirationDays ?? 0;
    if (expirationDays > 0 && loyaltyPhone) {
      await tx
        .update(loyaltyPointsTable)
        .set({ points: 0, updatedAt: new Date() })
        .where(and(
          eq(loyaltyPointsTable.userId, shopId),
          eq(loyaltyPointsTable.clientPhone, loyaltyPhone),
          gt(loyaltyPointsTable.points, 0),
          lt(loyaltyPointsTable.updatedAt, sql`NOW() - (${expirationDays} * INTERVAL '1 day')`),
        ));
    }

    const dayStart = new Date(`${localDate}T00:00:00Z`);
    const before = new Date(dayStart.getTime() - 24 * 3600 * 1000);
    const after = new Date(dayStart.getTime() + 48 * 3600 * 1000);
    const sameDay = await tx
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.userId, shopId), gte(appointmentsTable.scheduledAt, before), lt(appointmentsTable.scheduledAt, after)));
    const BUFFER = 0; // no gap between appointments — back-to-back booking allowed
    const incomingBarberId = parsed.data.barberId ?? null;
    for (const a of sameDay) {
      if (!isBlockingAppointment(a.status)) continue;
      if (localYMD(a.scheduledAt) !== localDate) continue;
      if (incomingBarberId !== null && a.barberId !== null && a.barberId !== incomingBarberId) continue;
      const aStart = parseHHMM(localHHMM(a.scheduledAt));
      const aEnd = aStart + a.serviceDuration;
      if (startMin < aEnd + BUFFER && endMin + BUFFER > aStart) {
        conflict = true;
        return null;
      }
    }

    // Atomic conditional deduction — the single definitive check, concurrency-safe.
    // Uses a conditional UPDATE (points >= redeemed) instead of GREATEST(), so a
    // concurrent booking that already spent the same points returns 0 rows and we fail.
    if (loyaltyPointsRedeemed > 0 && loyaltyPhone && !awaitingPayment) {
      const deducted = await tx
        .update(loyaltyPointsTable)
        .set({
          points: sql`${loyaltyPointsTable.points} - ${loyaltyPointsRedeemed}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(loyaltyPointsTable.userId, shopId),
          eq(loyaltyPointsTable.clientPhone, loyaltyPhone),
          gte(loyaltyPointsTable.points, loyaltyPointsRedeemed),
        ))
        .returning({ points: loyaltyPointsTable.points });
      if (deducted.length === 0) {
        redeemConflict = true;
        return null;
      }
    }

    const {
      shopId: _shopId,
      serviceIds: _serviceIds,
      serviceId: _serviceId,
      serviceName: _serviceName,
      servicePrice: _servicePrice,
      serviceDuration: _serviceDuration,
      ...appointmentInput
    } = parsed.data;
    void _shopId;
    void _serviceIds;
    void _serviceId;
    void _serviceName;
    void _servicePrice;
    void _serviceDuration;
    const [created] = await tx.insert(appointmentsTable).values({
      ...appointmentInput,
      userId: shopId,
      serviceId: authoritative.serviceId,
      serviceName: authoritative.serviceName,
      servicePrice: String(finalServicePrice),
      serviceDuration: authoritative.serviceDuration,
      scheduledAt: scheduledAtDate,
      status: awaitingPayment ? "pending_payment" : "pending",
      cancelToken: crypto.randomUUID(),
      creditsUsed: awaitingPayment ? null : (coveredByPlan ? subscriptionCreditCost : null),
      pendingCreditsUsed: awaitingPayment ? (coveredByPlan ? subscriptionCreditCost : null) : null,
      pendingLoyaltyPointsRedeemed: awaitingPayment ? loyaltyPointsRedeemed : 0,
      pendingLoyaltyPointsEarned: 0,
    }).returning();

    // Atomic subscription credit deduction inside transaction
    if (coveredByPlan && subscriptionCreditCost > 0 && loyaltyPhone && !awaitingPayment) {
      const deducted = await tx
        .update(clientSubscriptionsTable)
        .set({
          creditsRemaining: sql`${clientSubscriptionsTable.creditsRemaining} - ${subscriptionCreditCost}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(clientSubscriptionsTable.userId, shopId),
          eq(clientSubscriptionsTable.clientPhone, loyaltyPhone),
          eq(clientSubscriptionsTable.status, "active"),
          sql`${clientSubscriptionsTable.creditsRemaining} >= ${subscriptionCreditCost}`,
          sql`${clientSubscriptionsTable.expiresAt} > NOW()`,
        ))
        .returning({ id: clientSubscriptionsTable.id });
      if (deducted.length === 0) {
        redeemConflict = true;
        return null;
      }
    }

    if (!awaitingPayment) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742001")})`);
      const [maxResult] = await tx
        .select({ maxPos: sql<number>`COALESCE(MAX(${queueTable.position}), 0)` })
        .from(queueTable)
        .where(and(eq(queueTable.userId, shopId), sql`${queueTable.status} != 'completed'`));
      const nextPosition = (maxResult?.maxPos ?? 0) + 1;

      await tx.insert(queueTable).values({
        userId: shopId,
        appointmentId: created.id,
        clientName: created.clientName,
        serviceName: created.serviceName,
        servicePrice: created.servicePrice,
        serviceDuration: created.serviceDuration,
        notes: created.notes,
        position: nextPosition,
        status: "waiting",
      });
    }

    // Auto-upsert client record for history, and link clientId to the appointment.
    if (loyaltyPhone && parsed.data.clientName) {
      const [existing] = await tx
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.userId, shopId), eq(clientsTable.phone, loyaltyPhone)))
        .limit(1);
      const clientId = existing
        ? existing.id
        : (await tx.insert(clientsTable).values({
            userId: shopId,
            name: parsed.data.clientName,
            phone: loyaltyPhone,
          }).returning({ id: clientsTable.id }))[0]?.id ?? null;

      // Link clientId so future edits to the client propagate to this appointment.
      if (clientId) {
        await tx
          .update(appointmentsTable)
          .set({ clientId })
          .where(eq(appointmentsTable.id, created.id));
      }
    }

    // Credit earned points inside the same transaction (durable — if appointment
    // creation fails the whole tx rolls back, so points are never credited on failure).
    // Points are only earned on client-initiated bookings (public link), not admin-panel bookings.
    let pointsEarned = 0;
    if (!isAdminBooking && loyaltyConfig?.enabled && loyaltyConfig.pointsPerReal && loyaltyPhone) {
      pointsEarned = Math.floor(finalServicePrice * loyaltyConfig.pointsPerReal);
      if (pointsEarned > 0 && !awaitingPayment) {
        await tx
          .insert(loyaltyPointsTable)
          .values({ userId: shopId, clientPhone: loyaltyPhone, points: pointsEarned })
          .onConflictDoUpdate({
            target: [loyaltyPointsTable.userId, loyaltyPointsTable.clientPhone],
            set: { points: sql`${loyaltyPointsTable.points} + ${pointsEarned}`, updatedAt: new Date() },
          });
      }
    }

    // Store loyalty point totals on the appointment so cancellation can reverse them.
    if (awaitingPayment) {
      if (pointsEarned > 0) {
        await tx
          .update(appointmentsTable)
          .set({ pendingLoyaltyPointsEarned: pointsEarned })
          .where(eq(appointmentsTable.id, created.id));
      }
    } else if (loyaltyPointsRedeemed > 0 || pointsEarned > 0) {
      await tx
        .update(appointmentsTable)
        .set({ loyaltyPointsRedeemed, loyaltyPointsEarned: pointsEarned })
        .where(eq(appointmentsTable.id, created.id));
    }

    return created;
  });

  if (redeemConflict) {
    res.status(409).json({ error: "Pontos já utilizados em outro agendamento simultâneo. Tente novamente." });
    return;
  }
  if (conflict || !appointment) {
    res.status(409).json({ error: "Esse horário acabou de ser reservado. Escolha outro." });
    return;
  }

  // A new booking restarts the inactivity cycle for every browser subscription
  // registered for this client, including subscriptions from older devices.
  if (loyaltyPhone && appointment.clientName) {
    await db
      .update(clientReengagementPushSubscriptionsTable)
      .set({
        clientName: appointment.clientName,
        lastAppointmentAt: appointment.createdAt,
        reengagementSentAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(clientReengagementPushSubscriptionsTable.userId, appointment.userId),
        eq(clientReengagementPushSubscriptionsTable.clientPhone, loyaltyPhone),
      ));
  }

  // Notify admin via push
  const apptHH = new Date(appointment.scheduledAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
  const apptDD = new Date(appointment.scheduledAt).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo",
  });
  sendAdminPush(appointment.userId, {
    title: awaitingPayment ? "💳 Pagamento Pix pendente" : "📅 Novo agendamento",
    body: `${appointment.clientName} · ${appointment.serviceName} · ${apptDD} às ${apptHH}`,
    tag: awaitingPayment ? `pix-pending-${appointment.id}` : `new-${appointment.id}`,
    url: `/agendamento/${appointment.cancelToken}`,
    sound: awaitingPayment ? "pix_pending" : "new",
  }).catch(() => {});

  res.status(201).json(formatAppointmentWithToken(appointment));
});

router.get("/appointments/:id", requireActiveAuth, async (req, res): Promise<void> => {
  const params = GetAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)));
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

router.patch("/appointments/:id", requireActiveAuth, async (req, res): Promise<void> => {
  const params = UpdateAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const updateData: Record<string, unknown> = {};
  for (const field of ["clientName", "serviceId", "barberId", "barberName", "status", "notes"] as const) {
    if (parsed.data[field] !== undefined) updateData[field] = parsed.data[field];
  }
  if (parsed.data.scheduledAt !== undefined) {
    if (!isValidScheduledAtString(parsed.data.scheduledAt)) {
      res.status(400).json({ error: "scheduledAt inválido. Use uma data ISO UTC válida." });
      return;
    }
    updateData.scheduledAt = new Date(parsed.data.scheduledAt);
    if (Number.isNaN((updateData.scheduledAt as Date).getTime())) {
      res.status(400).json({ error: "Invalid scheduledAt" });
      return;
    }
  }

  const [existingAppointment] = await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
    .limit(1);
  if (!existingAppointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const requestedServiceChanged =
    parsed.data.serviceId !== undefined &&
    parsed.data.serviceId !== existingAppointment.serviceId;
  if (requestedServiceChanged) {
    if (parsed.data.serviceId === null) {
      res.status(400).json({ error: "Selecione um serviço cadastrado para alterar o serviço." });
      return;
    }
    const authoritative = await resolveAuthoritativeBooking(
      userId,
      {
        serviceId: parsed.data.serviceId,
        serviceName: "",
        servicePrice: 0,
        serviceDuration: 0,
      },
      parsed.data.scheduledAt ? updateData.scheduledAt as Date : existingAppointment.scheduledAt,
      false,
    );
    if ("error" in authoritative) {
      res.status(400).json({ error: authoritative.error });
      return;
    }
    updateData.serviceId = authoritative.serviceId;
    updateData.serviceName = authoritative.serviceName;
    updateData.servicePrice = String(authoritative.servicePrice);
    updateData.serviceDuration = authoritative.serviceDuration;
  } else if (existingAppointment.serviceId !== null &&
             (parsed.data.scheduledAt !== undefined || parsed.data.barberId !== undefined)) {
    const authoritative = await resolveAuthoritativeBooking(
      userId,
      {
        serviceId: existingAppointment.serviceId,
        serviceName: "",
        servicePrice: 0,
        serviceDuration: 0,
      },
      parsed.data.scheduledAt ? updateData.scheduledAt as Date : existingAppointment.scheduledAt,
      false,
    );
    if ("error" in authoritative) {
      res.status(400).json({ error: authoritative.error });
      return;
    }
    updateData.serviceName = authoritative.serviceName;
    updateData.servicePrice = String(authoritative.servicePrice);
    updateData.serviceDuration = authoritative.serviceDuration;
  }

  if (
    parsed.data.scheduledAt !== undefined ||
    parsed.data.barberId !== undefined ||
    requestedServiceChanged
  ) {
    const targetDate = parsed.data.scheduledAt
      ? updateData.scheduledAt as Date
      : existingAppointment.scheduledAt;
    const targetBarberId = parsed.data.barberId !== undefined
      ? parsed.data.barberId
      : existingAppointment.barberId;
    const windowError = await getBookingWindowError(
      userId,
      targetDate,
      (typeof updateData.serviceDuration === "number"
        ? updateData.serviceDuration
        : existingAppointment.serviceDuration),
      targetBarberId,
    );
    if (windowError) {
      res.status(400).json({ error: windowError });
      return;
    }
    if (typeof targetBarberId === "number") {
      const barberCheck = await isBarberAllowedForService(
        db,
        targetBarberId,
        typeof updateData.serviceId === "number"
          ? updateData.serviceId
          : existingAppointment.serviceId,
        userId,
      );
      if (!barberCheck.ok) {
        res.status(400).json({ error: `Profissional inválido: ${barberCheck.reason}` });
        return;
      }
      updateData.barberName = barberCheck.barberName;
    }

    const targetDateKey = localYMD(targetDate);
    const dayStart = new Date(`${targetDateKey}T00:00:00Z`);
    const targetStart = parseHHMM(localHHMM(targetDate));
    const targetEnd = targetStart + (typeof updateData.serviceDuration === "number"
      ? updateData.serviceDuration
      : existingAppointment.serviceDuration);
    let hash = 0;
    for (let i = 0; i < targetDateKey.length; i++) {
      hash = ((hash << 5) - hash + targetDateKey.charCodeAt(i)) | 0;
    }
    const updateResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(742003, ${hash})`);
      const sameDay = await tx
        .select()
        .from(appointmentsTable)
        .where(and(
          eq(appointmentsTable.userId, userId),
          gte(appointmentsTable.scheduledAt, new Date(dayStart.getTime() - 24 * 3600 * 1000)),
          lt(appointmentsTable.scheduledAt, new Date(dayStart.getTime() + 48 * 3600 * 1000)),
        ));
      for (const other of sameDay) {
        if (other.id === existingAppointment.id || !isBlockingAppointment(other.status)) continue;
        if (localYMD(other.scheduledAt) !== targetDateKey) continue;
        if (targetBarberId !== null && targetBarberId !== undefined &&
            other.barberId !== null && other.barberId !== targetBarberId) continue;
        const otherStart = parseHHMM(localHHMM(other.scheduledAt));
        const otherEnd = otherStart + other.serviceDuration;
        if (targetStart < otherEnd && targetEnd > otherStart) {
          return { error: "conflict" as const };
        }
      }

      const [appointment] = await tx
        .update(appointmentsTable)
        .set(updateData)
        .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
        .returning();
      return appointment ? { appointment } : { error: "notfound" as const };
    });
    if (updateResult.error === "conflict") {
      res.status(409).json({ error: "Esse horário já está ocupado." });
      return;
    }
    if (updateResult.error === "notfound") {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    res.json(formatAppointment(updateResult.appointment));
    return;
  }

  const [appointment] = await db
    .update(appointmentsTable)
    .set(updateData)
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
    .returning();
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

router.delete("/appointments/:id", requireActiveAuth, async (req, res): Promise<void> => {
  const params = DeleteAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const appointment = await db.transaction(async (tx) => {
    await tx.delete(queueTable).where(eq(queueTable.appointmentId, params.data.id));
    const [a] = await tx
      .delete(appointmentsTable)
      .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
      .returning();
    return a;
  });
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/appointments/:id/start", requireActiveAuth, async (req, res): Promise<void> => {
  const params = StartAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const appointment = await db.transaction(async (tx) => {
    const [started] = await tx
      .update(appointmentsTable)
      .set({ status: "in_progress" })
      .where(and(
        eq(appointmentsTable.id, params.data.id),
        eq(appointmentsTable.userId, userId),
        eq(appointmentsTable.status, "pending"),
      ))
      .returning();
    if (!started) return null;

    await tx
      .update(queueTable)
      .set({ status: "in_progress", startedAt: new Date() })
      .where(and(
        eq(queueTable.appointmentId, started.id),
        sql`${queueTable.status} = 'waiting'`,
      ));
    return started;
  });
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  broadcastQueueUpdate(userId);
  res.json(formatAppointment(appointment));
});

router.post("/appointments/:id/approve-payment", requireActiveAuth, async (req, res): Promise<void> => {
  const params = GetAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.id, params.data.id),
        eq(appointmentsTable.userId, userId),
      ))
      .for("update")
      .limit(1);
    if (!existing) return { error: "notfound" as const };
    if (existing.status !== "pending_payment") return { error: "state" as const };

    const phoneMatch = existing.notes?.match(/Tel:\s*([\d\s()\-+.]+)/);
    const loyaltyPhone = phoneMatch ? (phoneMatch[1] ?? "").replace(/\D/g, "") || null : null;
    const pointsToRedeem = existing.pendingLoyaltyPointsRedeemed ?? 0;
    const pointsToEarn = existing.pendingLoyaltyPointsEarned ?? 0;
    const creditsToUse = existing.pendingCreditsUsed ?? 0;

    if (pointsToRedeem > 0) {
      if (!loyaltyPhone) return { error: "points" as const };
      const deducted = await tx
        .update(loyaltyPointsTable)
        .set({
          points: sql`${loyaltyPointsTable.points} - ${pointsToRedeem}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(loyaltyPointsTable.userId, userId),
          eq(loyaltyPointsTable.clientPhone, loyaltyPhone),
          gte(loyaltyPointsTable.points, pointsToRedeem),
        ))
        .returning({ points: loyaltyPointsTable.points });
      if (deducted.length === 0) return { error: "points" as const };
    }

    if (creditsToUse > 0) {
      if (!loyaltyPhone) return { error: "credits" as const };
      const deducted = await tx
        .update(clientSubscriptionsTable)
        .set({
          creditsRemaining: sql`${clientSubscriptionsTable.creditsRemaining} - ${creditsToUse}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(clientSubscriptionsTable.userId, userId),
          eq(clientSubscriptionsTable.clientPhone, loyaltyPhone),
          eq(clientSubscriptionsTable.status, "active"),
          sql`${clientSubscriptionsTable.creditsRemaining} >= ${creditsToUse}`,
          sql`${clientSubscriptionsTable.expiresAt} > NOW()`,
        ))
        .returning({ id: clientSubscriptionsTable.id });
      if (deducted.length === 0) return { error: "credits" as const };
    }

    if (pointsToEarn > 0 && loyaltyPhone) {
      await tx
        .insert(loyaltyPointsTable)
        .values({ userId, clientPhone: loyaltyPhone, points: pointsToEarn })
        .onConflictDoUpdate({
          target: [loyaltyPointsTable.userId, loyaltyPointsTable.clientPhone],
          set: { points: sql`${loyaltyPointsTable.points} + ${pointsToEarn}`, updatedAt: new Date() },
        });
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742001")})`);
    const [maxResult] = await tx
      .select({ maxPos: sql<number>`COALESCE(MAX(${queueTable.position}), 0)` })
      .from(queueTable)
      .where(and(eq(queueTable.userId, userId), sql`${queueTable.status} != 'completed'`));
    const nextPosition = (maxResult?.maxPos ?? 0) + 1;
    await tx.insert(queueTable).values({
      userId,
      appointmentId: existing.id,
      clientName: existing.clientName,
      serviceName: existing.serviceName,
      servicePrice: existing.servicePrice,
      serviceDuration: existing.serviceDuration,
      notes: existing.notes,
      position: nextPosition,
      status: "waiting",
    });

    const [approved] = await tx
      .update(appointmentsTable)
      .set({
        status: "pending",
        creditsUsed: creditsToUse > 0 ? creditsToUse : null,
        loyaltyPointsRedeemed: pointsToRedeem,
        loyaltyPointsEarned: pointsToEarn,
        pendingCreditsUsed: null,
        pendingLoyaltyPointsRedeemed: 0,
        pendingLoyaltyPointsEarned: 0,
      })
      .where(and(
        eq(appointmentsTable.id, existing.id),
        eq(appointmentsTable.userId, userId),
        eq(appointmentsTable.status, "pending_payment"),
      ))
      .returning();
    if (!approved) return { error: "state" as const };
    return { appointment: approved };
  });

  if (result.error === "notfound") {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  if (result.error === "state") {
    res.status(409).json({ error: "Este agendamento não está aguardando aprovação de pagamento." });
    return;
  }
  if (result.error === "points") {
    res.status(409).json({ error: "O cliente não possui mais pontos suficientes para este agendamento." });
    return;
  }
  if (result.error === "credits") {
    res.status(409).json({ error: "O plano do cliente não possui mais créditos suficientes." });
    return;
  }

  const appointment = result.appointment!;
  await sendClientAppointmentPush(appointment.cancelToken!, {
    title: "✅ Pagamento Pix confirmado",
    body: `Seu agendamento de ${appointment.serviceName} foi liberado para ${new Date(appointment.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ })}.`,
    tag: `payment-approved-${appointment.id}`,
    url: `/agendamento/${appointment.cancelToken}`,
  }).catch(() => {});
  broadcastQueueUpdate(userId);
  res.json(formatAppointmentWithToken(appointment));
});

router.post("/appointments/:id/reject-payment", requireActiveAuth, async (req, res): Promise<void> => {
  const params = GetAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [appointment] = await db
    .update(appointmentsTable)
    .set({
      status: "payment_rejected",
      pendingCreditsUsed: null,
      pendingLoyaltyPointsRedeemed: 0,
      pendingLoyaltyPointsEarned: 0,
    })
    .where(and(
      eq(appointmentsTable.id, params.data.id),
      eq(appointmentsTable.userId, userId),
      eq(appointmentsTable.status, "pending_payment"),
    ))
    .returning();
  if (!appointment) {
    const [existing] = await db
      .select({ id: appointmentsTable.id, status: appointmentsTable.status })
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Appointment not found" });
    } else {
      res.status(409).json({ error: "Este agendamento não está aguardando aprovação de pagamento." });
    }
    return;
  }
  await db.delete(queueTable).where(eq(queueTable.appointmentId, appointment.id));
  await sendClientAppointmentPush(appointment.cancelToken!, {
    title: "Pagamento Pix não confirmado",
    body: "A barbearia não confirmou o pagamento. O horário foi liberado; faça um novo agendamento quando quiser.",
    tag: `payment-rejected-${appointment.id}`,
    url: `/agendamento/${appointment.cancelToken}`,
  }).catch(() => {});
  broadcastQueueUpdate(userId);
  res.json(formatAppointmentWithToken(appointment));
});

router.post("/appointments/:id/complete", requireActiveAuth, async (req, res): Promise<void> => {
  const params = CompleteAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const appointment = await db.transaction(async (tx) => {
    const [a] = await tx
      .update(appointmentsTable)
      .set({ status: "completed" })
      .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
      .returning();
    if (!a) return null;
    await tx.delete(queueTable).where(eq(queueTable.appointmentId, params.data.id));
    return a;
  });
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  broadcastQueueUpdate(userId);
  res.json(formatAppointment(appointment));
});

// Token-based routes — token is globally unique, no shopId needed.
// We derive the shop from the appointment's own userId for availability checks.
router.get("/appointments/by-token/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token ?? "");
  if (!token) {
    res.status(400).json({ error: "Token required" });
    return;
  }
  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.cancelToken, token));
  if (!appointment) {
    res.status(404).json({ error: "Agendamento não encontrado" });
    return;
  }
  res.json(formatAppointmentWithToken(appointment));
});

router.post("/appointments/by-token/:token/cancel", async (req, res): Promise<void> => {
  const token = String(req.params.token ?? "");
  if (!token) {
    res.status(400).json({ error: "Token required" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.cancelToken, token));
    if (!existing) return { error: "notfound" as const };
    if (existing.status === "cancelled") return { appointment: existing };
    if (existing.status === "completed" || existing.status === "in_progress") {
      return { error: "locked" as const };
    }
    const [updated] = await tx
      .update(appointmentsTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(appointmentsTable.id, existing.id),
        sql`${appointmentsTable.status} IN ('pending', 'confirmed', 'pending_payment')`,
      ))
      .returning();
    if (!updated) return { error: "locked" as const };
    await tx.delete(queueTable).where(eq(queueTable.appointmentId, existing.id));

    // Reverse loyalty points: return redeemed pts, subtract earned pts.
    const phoneMatch = existing.notes?.match(/Tel:\s*([^.]+)/);
    const loyaltyPhone = phoneMatch ? (phoneMatch[1] ?? "").replace(/\D/g, "") || null : null;
    const netChange = existing.loyaltyPointsRedeemed - existing.loyaltyPointsEarned;
    if (loyaltyPhone && netChange !== 0) {
      if (netChange > 0) {
        await tx
          .insert(loyaltyPointsTable)
          .values({ userId: existing.userId, clientPhone: loyaltyPhone, points: netChange })
          .onConflictDoUpdate({
            target: [loyaltyPointsTable.userId, loyaltyPointsTable.clientPhone],
            set: { points: sql`${loyaltyPointsTable.points} + ${netChange}`, updatedAt: new Date() },
          });
      } else {
        await tx
          .update(loyaltyPointsTable)
          .set({ points: sql`GREATEST(0, ${loyaltyPointsTable.points} + ${netChange})`, updatedAt: new Date() })
          .where(and(eq(loyaltyPointsTable.userId, existing.userId), eq(loyaltyPointsTable.clientPhone, loyaltyPhone)));
      }
    }

    return { appointment: updated };
  });
  if (result.error === "notfound") {
    res.status(404).json({ error: "Agendamento não encontrado" });
    return;
  }
  if (result.error === "locked") {
    res.status(409).json({ error: "Este agendamento já foi iniciado ou concluído e não pode ser cancelado." });
    return;
  }
  if (result.appointment) {
    const a = result.appointment;
    const apptHH = new Date(a.scheduledAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const apptDD = new Date(a.scheduledAt).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    sendAdminPush(a.userId, {
      title: "❌ Agendamento cancelado",
      body: `${a.clientName} · ${a.serviceName} · horário cancelado: ${apptDD} às ${apptHH}`,
      tag: `cancelled-${a.id}`,
      url: `/agendamento/${a.cancelToken}`,
      sound: "changed",
    }).catch(() => {});
    await offerNextWaitlistForSlot({
      userId: result.appointment.userId,
      scheduledAt: result.appointment.scheduledAt,
      serviceDuration: result.appointment.serviceDuration,
      barberId: result.appointment.barberId,
    }).catch(() => {});
  }
  res.json(formatAppointmentWithToken(result.appointment!));
});

router.post("/appointments/by-token/:token/reschedule", async (req, res): Promise<void> => {
  const token = String(req.params.token ?? "");
  if (!token) {
    res.status(400).json({ error: "Token required" });
    return;
  }
  const rawSched = typeof req.body?.scheduledAt === "string" ? req.body.scheduledAt : null;
  if (!rawSched) {
    res.status(400).json({ error: "scheduledAt required" });
    return;
  }
  const newDate = new Date(rawSched);
  if (Number.isNaN(newDate.getTime())) {
    res.status(400).json({ error: "Invalid scheduledAt" });
    return;
  }
  const [appointmentForValidation] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.cancelToken, token))
    .limit(1);
  if (!appointmentForValidation) {
    res.status(404).json({ error: "Agendamento não encontrado" });
    return;
  }
  const [accountForValidation] = await db
    .select({
      trialStartedAt: usersTable.trialStartedAt,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      maxBarbers: usersTable.maxBarbers,
    })
    .from(usersTable)
    .where(eq(usersTable.id, appointmentForValidation.userId))
    .limit(1);
  if (!accountForValidation || !accountCanAccess(accountForValidation)) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "O agendamento não pode ser alterado porque a barbearia está inativa.",
    });
    return;
  }
  const validationBarberId =
    typeof req.body?.barberId === "number" ? req.body.barberId : appointmentForValidation.barberId;
  const bookingWindowError = await getBookingWindowError(
    appointmentForValidation.userId,
    newDate,
    appointmentForValidation.serviceDuration,
    validationBarberId,
  );
  if (bookingWindowError) {
    res.status(400).json({ error: bookingWindowError });
    return;
  }
  const localDate = localYMD(newDate);
  const startMin = parseHHMM(localHHMM(newDate));

  let overrideBarberName: string | undefined;
  if (typeof req.body?.barberId === "number") {
    const check = await isBarberAllowedForService(
      db,
      req.body.barberId,
      appointmentForValidation.serviceId ?? null,
      appointmentForValidation.userId,
    );
    if (!check.ok) {
      res.status(400).json({ error: `Profissional inválido: ${check.reason}` });
      return;
    }
    overrideBarberName = check.barberName;
  }

  const result = await db.transaction(async (tx) => {
    let hash = 0;
    for (let i = 0; i < localDate.length; i++) hash = ((hash << 5) - hash + localDate.charCodeAt(i)) | 0;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(742003, ${hash})`);

    const [existing] = await tx
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.cancelToken, token));
    if (!existing) return { error: "notfound" as const };
    if (existing.status === "cancelled") return { error: "cancelled" as const };
    if (existing.status === "in_progress" || existing.status === "completed") {
      return { error: "locked" as const };
    }

    const endMin = startMin + existing.serviceDuration;
    const BUFFER = 0; // no gap between appointments — back-to-back booking allowed
    const dayStart = new Date(`${localDate}T00:00:00Z`);
    const before = new Date(dayStart.getTime() - 24 * 3600 * 1000);
    const after = new Date(dayStart.getTime() + 48 * 3600 * 1000);
    // Scope conflict check to the same shop
    const sameDay = await tx
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.userId, existing.userId), gte(appointmentsTable.scheduledAt, before), lt(appointmentsTable.scheduledAt, after)));
    const targetBarberId = typeof req.body?.barberId === "number" ? req.body.barberId : existing.barberId;
    for (const a of sameDay) {
      if (a.id === existing.id) continue;
      if (!isBlockingAppointment(a.status)) continue;
      if (localYMD(a.scheduledAt) !== localDate) continue;
      if (targetBarberId !== null && a.barberId !== null && a.barberId !== targetBarberId) continue;
      const aStart = parseHHMM(localHHMM(a.scheduledAt));
      const aEnd = aStart + a.serviceDuration;
      if (startMin < aEnd + BUFFER && endMin + BUFFER > aStart) {
        return { error: "conflict" as const };
      }
    }

    const updateSet: Record<string, unknown> = { scheduledAt: newDate };
    if (typeof req.body?.barberId === "number" && req.body.barberId !== existing.barberId) {
      updateSet.barberId = req.body.barberId;
      updateSet.barberName = overrideBarberName ?? null;
    }
    const [updated] = await tx
      .update(appointmentsTable)
      .set(updateSet)
      .where(and(
        eq(appointmentsTable.id, existing.id),
        sql`${appointmentsTable.status} IN ('pending', 'confirmed', 'pending_payment')`,
      ))
      .returning();
    if (!updated) return { error: "locked" as const };
    return { appointment: updated };
  });

  if (result.error === "notfound") {
    res.status(404).json({ error: "Agendamento não encontrado" });
    return;
  }
  if (result.error === "cancelled") {
    res.status(409).json({ error: "Este agendamento foi cancelado." });
    return;
  }
  if (result.error === "locked") {
    res.status(409).json({ error: "Este agendamento já foi iniciado ou concluído." });
    return;
  }
  if (result.error === "conflict") {
    res.status(409).json({ error: "Esse horário acabou de ser reservado. Escolha outro." });
    return;
  }
  // Notify admin via push about reschedule
  if (result.appointment) {
    const a = result.appointment;
    const apptHH = new Date(a.scheduledAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    });
    const apptDD = new Date(a.scheduledAt).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo",
    });
    sendAdminPush(a.userId, {
      title: "🔄 Horário alterado",
      body: `${a.clientName} · ${a.serviceName} · novo horário: ${apptDD} às ${apptHH}`,
      tag: `resched-${a.id}`,
      url: `/agendamento/${a.cancelToken}`,
      sound: "changed",
    }).catch(() => {});
  }

  res.json(formatAppointmentWithToken(result.appointment!));
});

router.post("/appointments/:id/cancel", requireActiveAuth, async (req, res): Promise<void> => {
  const params = CancelAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const appointment = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)));
    if (!existing) return null;
    const [a] = await tx
      .update(appointmentsTable)
      .set({ status: "cancelled" })
      .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
      .returning();
    if (!a) return null;
    await tx.delete(queueTable).where(eq(queueTable.appointmentId, params.data.id));

    // Reverse loyalty points: return redeemed pts, subtract earned pts.
    const phoneMatch = existing.notes?.match(/Tel:\s*([^.]+)/);
    const loyaltyPhone = phoneMatch ? (phoneMatch[1] ?? "").replace(/\D/g, "") || null : null;
    const netChange = existing.loyaltyPointsRedeemed - existing.loyaltyPointsEarned;
    if (loyaltyPhone && netChange !== 0) {
      if (netChange > 0) {
        await tx
          .insert(loyaltyPointsTable)
          .values({ userId, clientPhone: loyaltyPhone, points: netChange })
          .onConflictDoUpdate({
            target: [loyaltyPointsTable.userId, loyaltyPointsTable.clientPhone],
            set: { points: sql`${loyaltyPointsTable.points} + ${netChange}`, updatedAt: new Date() },
          });
      } else {
        await tx
          .update(loyaltyPointsTable)
          .set({ points: sql`GREATEST(0, ${loyaltyPointsTable.points} + ${netChange})`, updatedAt: new Date() })
          .where(and(eq(loyaltyPointsTable.userId, userId), eq(loyaltyPointsTable.clientPhone, loyaltyPhone)));
      }
    }

    return a;
  });
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  await offerNextWaitlistForSlot({
    userId: appointment.userId,
    scheduledAt: appointment.scheduledAt,
    serviceDuration: appointment.serviceDuration,
    barberId: appointment.barberId,
  }).catch(() => {});
  const apptHH = new Date(appointment.scheduledAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const apptDD = new Date(appointment.scheduledAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  sendAdminPush(appointment.userId, {
    title: "❌ Agendamento cancelado",
    body: `${appointment.clientName} · ${appointment.serviceName} · horário cancelado: ${apptDD} às ${apptHH}`,
    tag: `cancelled-${appointment.id}`,
    url: `/agendamento/${appointment.cancelToken}`,
    sound: "changed",
  }).catch(() => {});
  res.json(formatAppointment(appointment));
});

// Trigger endpoint — can be pinged periodically by the client (no auth required
// for the public booking page) to auto-advance appointment statuses by time.
// Requires shopId so we know which shop to advance.
router.post("/appointments/auto-start", async (req, res): Promise<void> => {
  const shopId = typeof req.body?.shopId === "string" ? req.body.shopId.trim()
    : typeof req.query.shopId === "string" ? req.query.shopId.trim()
    : req.session?.userId ?? null;
  if (!shopId) {
    res.status(400).json({ error: "shopId required" });
    return;
  }
  if (!(await canShopAutoAdvance(shopId))) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "A barbearia não está ativa.",
    });
    return;
  }
  await autoAdvanceAppointmentsByTime(shopId);
  res.json({ ok: true });
});

export { autoAdvanceAppointmentsByTime };
export default router;
