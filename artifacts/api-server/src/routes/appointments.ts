import { Router, type IRouter, type Request } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { db, appointmentsTable, queueTable, servicesTable, settingsTable, barbersTable, loyaltyPointsTable, clientsTable, clientSubscriptionsTable, subscriptionPlansTable, type DaySchedule, type WeeklySchedule, type LoyaltyConfig } from "@workspace/db";
import { isBarberAllowedForService } from "./barbers.js";
import { resolveServicePrice } from "./services.js";
import { sendAdminPush } from "./push.js";
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

router.get("/appointments", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const query = ListAppointmentsQueryParams.safeParse(req.query);
  let appointments;
  if (query.success && query.data.dateStart && query.data.dateEnd) {
    const rangeStart = new Date(query.data.dateStart);
    const rangeEnd = new Date(query.data.dateEnd);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
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
    const date = new Date(query.data.date);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
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
  const { date, serviceId, serviceDuration: serviceDurationParam, barberId } = parsed.data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    res.status(400).json({ error: "Invalid date format (expected YYYY-MM-DD)" });
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
  const minAdvanceMinutes = settings?.minAdvanceMinutes ?? 0;
  const slotIntervalMinutes = settings?.slotIntervalMinutes ?? 15;
  const smartSlots = settings?.smartSlots ?? false;

  // Reject dates too far in the future
  const today = localYMD(new Date());
  const requestedDate = new Date(`${date}T12:00:00Z`);
  const todayDate = new Date(`${today}T12:00:00Z`);
  const daysDiff = Math.round((requestedDate.getTime() - todayDate.getTime()) / (24 * 3600 * 1000));
  if (daysDiff > maxBookingDays) {
    res.json({ date, dayClosed: true, slots: [] });
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
    .where(and(eq(appointmentsTable.userId, shopId), gte(appointmentsTable.scheduledAt, before), lt(appointmentsTable.scheduledAt, after)));

  const blocked: Array<[number, number]> = [];
  for (const a of appts) {
    if (a.status === "cancelled") continue;
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
  const BUFFER = 5;
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

  res.json({ date, dayClosed: false, slots });
});

router.post("/appointments", async (req, res): Promise<void> => {
  // shopId can come from session (admin booking) or body (public booking page)
  const shopId = req.session?.userId ?? (typeof req.body?.shopId === "string" ? req.body.shopId.trim() : "");
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
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
  const localDate = localYMD(scheduledAtDate);
  const startMin = parseHHMM(localHHMM(scheduledAtDate));
  const endMin = startMin + parsed.data.serviceDuration;

  if (typeof parsed.data.barberId === "number") {
    const check = await isBarberAllowedForService(db, parsed.data.barberId, parsed.data.serviceId ?? null);
    if (!check.ok) {
      res.status(400).json({ error: `Profissional inválido: ${check.reason}` });
      return;
    }
    parsed.data.barberName = check.barberName;
  } else {
    parsed.data.barberName = undefined;
  }

  // ── Loyalty: setup, fast-path validation, authoritative discount ─────────
  const loyaltyPointsRedeemed = parsed.data.loyaltyPointsRedeemed ?? 0;

  // Extract phone from notes once — used for both redemption and earning.
  const notesStr = parsed.data.notes ?? "";
  const phoneMatch = notesStr.match(/Tel:\s*([^\s.]+)/);
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

  // Resolve day-based pricing if applicable
  let dayBasedPrice = parsed.data.servicePrice;
  if (parsed.data.serviceId != null) {
    const resolvedPrice = await resolveServicePrice(parsed.data.serviceId, shopId, scheduledAtDate);
    if (resolvedPrice !== null) {
      dayBasedPrice = resolvedPrice;
    }
  }

  // Final price is server-authoritative. Client sends the pre-loyalty price.
  const finalServicePrice = Math.max(0, dayBasedPrice - loyaltyDiscount);
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
  const appointment = await db.transaction(async (tx) => {
    let hash = 0;
    for (let i = 0; i < localDate.length; i++) hash = ((hash << 5) - hash + localDate.charCodeAt(i)) | 0;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(742003, ${hash})`);

    const dayStart = new Date(`${localDate}T00:00:00Z`);
    const before = new Date(dayStart.getTime() - 24 * 3600 * 1000);
    const after = new Date(dayStart.getTime() + 48 * 3600 * 1000);
    const sameDay = await tx
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.userId, shopId), gte(appointmentsTable.scheduledAt, before), lt(appointmentsTable.scheduledAt, after)));
    const BUFFER = 5;
    const incomingBarberId = parsed.data.barberId ?? null;
    for (const a of sameDay) {
      if (a.status === "cancelled") continue;
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
    if (loyaltyPointsRedeemed > 0 && loyaltyPhone) {
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

    const [created] = await tx.insert(appointmentsTable).values({
      ...parsed.data,
      userId: shopId,
      servicePrice: String(finalServicePrice),
      scheduledAt: scheduledAtDate,
      status: "pending",
      cancelToken: crypto.randomUUID(),
      creditsUsed: coveredByPlan ? subscriptionCreditCost : null,
    }).returning();

    // Atomic subscription credit deduction inside transaction
    if (coveredByPlan && subscriptionCreditCost > 0 && loyaltyPhone) {
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

    // Auto-upsert client record for history (insert only if no record with this phone exists).
    if (loyaltyPhone && parsed.data.clientName) {
      const [existing] = await tx
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.userId, shopId), eq(clientsTable.phone, loyaltyPhone)))
        .limit(1);
      if (!existing) {
        await tx.insert(clientsTable).values({
          userId: shopId,
          name: parsed.data.clientName,
          phone: loyaltyPhone,
        });
      }
    }

    // Credit earned points inside the same transaction (durable — if appointment
    // creation fails the whole tx rolls back, so points are never credited on failure).
    if (loyaltyConfig?.enabled && loyaltyConfig.pointsPerReal && loyaltyPhone) {
      const earned = Math.floor(finalServicePrice * loyaltyConfig.pointsPerReal);
      if (earned > 0) {
        await tx
          .insert(loyaltyPointsTable)
          .values({ userId: shopId, clientPhone: loyaltyPhone, points: earned })
          .onConflictDoUpdate({
            target: [loyaltyPointsTable.userId, loyaltyPointsTable.clientPhone],
            set: { points: sql`${loyaltyPointsTable.points} + ${earned}`, updatedAt: new Date() },
          });
      }
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

  // Notify admin via push
  const apptHH = new Date(appointment.scheduledAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
  const apptDD = new Date(appointment.scheduledAt).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo",
  });
  sendAdminPush(appointment.userId, {
    title: "📅 Novo agendamento",
    body: `${appointment.clientName} · ${appointment.serviceName} · ${apptDD} às ${apptHH}`,
    tag: `new-${appointment.id}`,
    url: `/agendamento/${appointment.cancelToken}`,
    sound: "new",
  }).catch(() => {});

  res.status(201).json(formatAppointmentWithToken(appointment));
});

router.get("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
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

router.patch("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
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
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
    .returning();
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

router.delete("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
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

router.post("/appointments/:id/start", requireAuth, async (req, res): Promise<void> => {
  const params = StartAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [appointment] = await db
    .update(appointmentsTable)
    .set({ status: "in_progress" })
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.userId, userId)))
    .returning();
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(formatAppointment(appointment));
});

router.post("/appointments/:id/complete", requireAuth, async (req, res): Promise<void> => {
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
  if (newDate.getTime() <= Date.now()) {
    res.status(400).json({ error: "O novo horário deve estar no futuro." });
    return;
  }
  const localDate = localYMD(newDate);
  const startMin = parseHHMM(localHHMM(newDate));

  let overrideBarberName: string | undefined;
  if (typeof req.body?.barberId === "number") {
    const [pre] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.cancelToken, token));
    if (pre) {
      const check = await isBarberAllowedForService(db, req.body.barberId, pre.serviceId ?? null);
      if (!check.ok) {
        res.status(400).json({ error: `Profissional inválido: ${check.reason}` });
        return;
      }
      overrideBarberName = check.barberName;
    }
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
    const BUFFER = 5;
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
      if (a.status === "cancelled") continue;
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
        sql`${appointmentsTable.status} IN ('pending', 'confirmed')`,
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
      sound: "rescheduled",
    }).catch(() => {});
  }

  res.json(formatAppointmentWithToken(result.appointment!));
});

router.post("/appointments/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const params = CancelAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const appointment = await db.transaction(async (tx) => {
    const [a] = await tx
      .update(appointmentsTable)
      .set({ status: "cancelled" })
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
  res.json(formatAppointment(appointment));
});

export default router;
