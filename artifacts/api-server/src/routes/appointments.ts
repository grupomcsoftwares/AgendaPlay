import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { db, appointmentsTable, queueTable, servicesTable, settingsTable, type DaySchedule, type WeeklySchedule } from "@workspace/db";
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

const router: IRouter = Router();

function formatAppointment(a: typeof appointmentsTable.$inferSelect) {
  // cancelToken is a public capability secret — never include it in generic responses.
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

router.get("/appointments", async (req, res): Promise<void> => {
  const query = ListAppointmentsQueryParams.safeParse(req.query);
  let appointments;
  if (query.success && query.data.date) {
    const date = new Date(query.data.date);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    appointments = await db
      .select()
      .from(appointmentsTable)
      .where(and(gte(appointmentsTable.scheduledAt, date), lt(appointmentsTable.scheduledAt, nextDay)))
      .orderBy(appointmentsTable.scheduledAt);
  } else if (query.success && query.data.status) {
    appointments = await db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.status, query.data.status))
      .orderBy(appointmentsTable.scheduledAt);
  } else {
    appointments = await db
      .select()
      .from(appointmentsTable)
      .orderBy(appointmentsTable.scheduledAt);
  }
  res.json(appointments.map(formatAppointment));
});

router.get("/availability", async (req, res): Promise<void> => {
  const parsed = GetAvailabilityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date, serviceId } = parsed.data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    res.status(400).json({ error: "Invalid date format (expected YYYY-MM-DD)" });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const duration = service.durationMinutes;

  const [settings] = await db.select().from(settingsTable).limit(1);
  const weekly = (settings?.weeklySchedule ?? null) as WeeklySchedule | null;

  const target = new Date(`${date}T12:00:00Z`);
  const dayKey = localDayKey(target);
  const defaults: DaySchedule = { closed: false, open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00" };
  const day: DaySchedule = weekly?.[dayKey] ?? defaults;

  if (day.closed) {
    res.json({ date, dayClosed: true, slots: [] });
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
    .where(and(gte(appointmentsTable.scheduledAt, before), lt(appointmentsTable.scheduledAt, after)));

  const blocked: Array<[number, number]> = [];
  for (const a of appts) {
    if (a.status === "cancelled") continue;
    if (localYMD(a.scheduledAt) !== date) continue;
    const start = parseHHMM(localHHMM(a.scheduledAt));
    blocked.push([start, start + a.serviceDuration]);
  }

  const now = new Date();
  const nowMin = localYMD(now) === date ? parseHHMM(localHHMM(now)) : -1;

  const slots: Array<{ time: string; available: boolean }> = [];
  // Step by the service's own duration so back-to-back slots fit perfectly:
  // a 30-min cut yields 2 slots/hour, a 20-min trim yields 3, etc.
  // Floor of 5 min keeps things sane if a service has duration 0.
  const step = Math.max(5, duration);
  // Required gap (in minutes) between consecutive appointments.
  const BUFFER = 5;
  for (let t = openMin; t + duration <= closeMin; t += step) {
    const end = t + duration;
    const overlapsLunch = hasLunch && t < lunchEnd && end > lunchStart;
    // Expand each blocked window by the buffer on both sides so the new slot
    // cannot start within 5 min of an existing appointment's end, nor end
    // within 5 min of an existing appointment's start.
    const overlapsAppt = blocked.some(([s, e]) => t < e + BUFFER && end + BUFFER > s);
    const inPast = t <= nowMin;
    const available = !overlapsLunch && !overlapsAppt && !inPast;
    const hh = Math.floor(t / 60).toString().padStart(2, "0");
    const mm = (t % 60).toString().padStart(2, "0");
    slots.push({ time: `${hh}:${mm}`, available });
  }

  res.json({ date, dayClosed: false, slots });
});

router.post("/appointments", async (req, res): Promise<void> => {
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
  const localDate = localYMD(scheduledAtDate);
  const startMin = parseHHMM(localHHMM(scheduledAtDate));
  const endMin = startMin + parsed.data.serviceDuration;

  let conflict = false;
  const appointment = await db.transaction(async (tx) => {
    // Serialize availability checks for this date so two concurrent bookings can't both pass.
    // Hash YYYY-MM-DD to a stable int for advisory lock key.
    let hash = 0;
    for (let i = 0; i < localDate.length; i++) hash = ((hash << 5) - hash + localDate.charCodeAt(i)) | 0;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(742003, ${hash})`);

    const dayStart = new Date(`${localDate}T00:00:00Z`);
    const before = new Date(dayStart.getTime() - 24 * 3600 * 1000);
    const after = new Date(dayStart.getTime() + 48 * 3600 * 1000);
    const sameDay = await tx
      .select()
      .from(appointmentsTable)
      .where(and(gte(appointmentsTable.scheduledAt, before), lt(appointmentsTable.scheduledAt, after)));
    // Enforce the same 5-min gap that GET /availability advertises so the
    // server can't accept a booking that the slot grid would have blocked.
    const BUFFER = 5;
    for (const a of sameDay) {
      if (a.status === "cancelled") continue;
      if (localYMD(a.scheduledAt) !== localDate) continue;
      const aStart = parseHHMM(localHHMM(a.scheduledAt));
      const aEnd = aStart + a.serviceDuration;
      if (startMin < aEnd + BUFFER && endMin + BUFFER > aStart) {
        conflict = true;
        return null;
      }
    }

    const [created] = await tx.insert(appointmentsTable).values({
      ...parsed.data,
      servicePrice: String(parsed.data.servicePrice),
      scheduledAt: scheduledAtDate,
      status: "pending",
      cancelToken: crypto.randomUUID(),
    }).returning();

    // Serialize concurrent queue-position assignments with a transaction-scoped advisory lock.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742001")})`);
    const [maxResult] = await tx
      .select({ maxPos: sql<number>`COALESCE(MAX(${queueTable.position}), 0)` })
      .from(queueTable)
      .where(sql`${queueTable.status} != 'completed'`);
    const nextPosition = (maxResult?.maxPos ?? 0) + 1;

    await tx.insert(queueTable).values({
      appointmentId: created.id,
      clientName: created.clientName,
      serviceName: created.serviceName,
      servicePrice: created.servicePrice,
      serviceDuration: created.serviceDuration,
      notes: created.notes,
      position: nextPosition,
      status: "waiting",
    });
    return created;
  });

  if (conflict || !appointment) {
    res.status(409).json({ error: "Esse horário acabou de ser reservado. Escolha outro." });
    return;
  }
  res.status(201).json(formatAppointmentWithToken(appointment));
});

router.get("/appointments/:id", async (req, res): Promise<void> => {
  const params = GetAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.id));
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

router.patch("/appointments/:id", async (req, res): Promise<void> => {
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
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.servicePrice !== undefined) {
    updateData.servicePrice = String(parsed.data.servicePrice);
  }
  if (parsed.data.scheduledAt !== undefined) {
    updateData.scheduledAt = new Date(parsed.data.scheduledAt);
  }
  const [appointment] = await db
    .update(appointmentsTable)
    .set(updateData)
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

router.delete("/appointments/:id", async (req, res): Promise<void> => {
  const params = DeleteAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const appointment = await db.transaction(async (tx) => {
    await tx.delete(queueTable).where(eq(queueTable.appointmentId, params.data.id));
    const [a] = await tx
      .delete(appointmentsTable)
      .where(eq(appointmentsTable.id, params.data.id))
      .returning();
    return a;
  });
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/appointments/:id/start", async (req, res): Promise<void> => {
  const params = StartAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [appointment] = await db
    .update(appointmentsTable)
    .set({ status: "in_progress" })
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

router.post("/appointments/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const appointment = await db.transaction(async (tx) => {
    const [a] = await tx
      .update(appointmentsTable)
      .set({ status: "completed" })
      .where(eq(appointmentsTable.id, params.data.id))
      .returning();
    if (!a) return null;
    await tx.delete(queueTable).where(eq(queueTable.appointmentId, params.data.id));
    return a;
  });
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

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
    // Conditional update — only flip if still in a cancellable state, preventing
    // a concurrent admin start/complete from being overwritten under contention.
    const [updated] = await tx
      .update(appointmentsTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(appointmentsTable.id, existing.id),
        sql`${appointmentsTable.status} IN ('pending', 'confirmed')`,
      ))
      .returning();
    if (!updated) return { error: "locked" as const };
    await tx.delete(queueTable).where(eq(queueTable.appointmentId, existing.id));
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
  res.json(formatAppointmentWithToken(result.appointment!));
});

router.post("/appointments/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const appointment = await db.transaction(async (tx) => {
    const [a] = await tx
      .update(appointmentsTable)
      .set({ status: "cancelled" })
      .where(eq(appointmentsTable.id, params.data.id))
      .returning();
    if (!a) return null;
    await tx.delete(queueTable).where(eq(queueTable.appointmentId, params.data.id));
    return a;
  });
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

export default router;
