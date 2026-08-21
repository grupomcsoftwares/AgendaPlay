import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import { accountCanAccess } from "./accountStatus.js";
import { db, usersTable, settingsTable, appointmentsTable, clientsTable, barbersTable, slugRedirectsTable, type DaySchedule, type WeeklySchedule } from "@workspace/db";

const TZ = "America/Sao_Paulo";
const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"] as const;

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

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

// Static route must come before /b/:slug to avoid being caught by the dynamic param.
router.get("/b/client", async (req, res): Promise<void> => {
  const { phone, shopId } = req.query;
  if (!phone || !shopId || typeof phone !== "string" || typeof shopId !== "string") {
    res.json(null);
    return;
  }
  const [client] = await db
    .select({ name: clientsTable.name })
    .from(clientsTable)
    .where(and(eq(clientsTable.userId, shopId), eq(clientsTable.phone, normalizePhone(phone))))
    .limit(1);
  res.json(client ?? null);
});

router.get("/b/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug ?? "").trim().toLowerCase();
  if (!slug) {
    res.status(400).json({ error: "Slug obrigatório" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      barbershopName: usersTable.barbershopName,
      slug: usersTable.slug,
      trialStartedAt: usersTable.trialStartedAt,
      trialEligible: usersTable.trialEligible,
      hasEverPaid: usersTable.hasEverPaid,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      maxBarbers: usersTable.maxBarbers,
    })
    .from(usersTable)
    .where(eq(usersTable.slug, slug))
    .limit(1);

  if (!user) {
    // Look up the slug_redirects history table for any old slug.
    const [redirect] = await db
      .select({ userId: slugRedirectsTable.userId })
      .from(slugRedirectsTable)
      .where(eq(slugRedirectsTable.oldSlug, slug))
      .limit(1);

    if (redirect?.userId) {
      const [current] = await db
        .select({ slug: usersTable.slug })
        .from(usersTable)
        .where(eq(usersTable.id, redirect.userId))
        .limit(1);

      if (current?.slug) {
        res.status(301).json({ redirectToSlug: current.slug });
        return;
      }
    }

    res.status(404).json({ error: "Barbearia não encontrada" });
    return;
  }

  if (!accountCanAccess(user)) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "O link de agendamento está temporariamente indisponível.",
    });
    return;
  }

  const [settings] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, user.id))
    .limit(1);

  res.json({
    shopId: user.id,
    barbershopName: user.barbershopName,
    slug: user.slug,
    logoUrl: settings?.logoUrl ?? null,
  });
});

router.get("/b/:slug/next-available", async (req, res): Promise<void> => {
  const slug = String(req.params.slug ?? "").trim().toLowerCase();
  if (!slug) {
    res.status(400).json({ error: "Slug obrigatório" });
    return;
  }

  const barberIdRaw = req.query.barberId;
  const barberFilter: number | null = barberIdRaw && !Number.isNaN(parseInt(String(barberIdRaw), 10))
    ? parseInt(String(barberIdRaw), 10)
    : null;
  const durationRaw = req.query.duration;
  const requestedDuration = typeof durationRaw === "string" ? Number(durationRaw) : Number.NaN;

  const [user] = await db
    .select({
      id: usersTable.id,
      trialStartedAt: usersTable.trialStartedAt,
      trialEligible: usersTable.trialEligible,
      hasEverPaid: usersTable.hasEverPaid,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      maxBarbers: usersTable.maxBarbers,
    })
    .from(usersTable)
    .where(eq(usersTable.slug, slug))
    .limit(1);

    const [redirect] = await db
      .select({ userId: slugRedirectsTable.userId })
      .from(slugRedirectsTable)
      .where(eq(slugRedirectsTable.oldSlug, slug))
      .limit(1);

  if (!user) {
    res.status(404).json({ error: "Barbearia não encontrada" });
    return;
  }
  if (!accountCanAccess(user)) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "A fila ao vivo está temporariamente indisponível.",
    });
    return;
  }

  const shopId = user.id;

  const [settings] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, shopId))
    .limit(1);

  const shopWeekly = (settings?.weeklySchedule ?? null) as WeeklySchedule | null;
  const maxBookingDays = settings?.maxBookingDays ?? 30;
  const minAdvanceMinutes = settings?.minAdvanceMinutes ?? 0;
  const slotIntervalMinutes = settings?.slotIntervalMinutes ?? 15;
  const SCAN_DURATION = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? Math.floor(requestedDuration)
    : 30;
  const BUFFER = 0;

  // If a barber is requested, validate they belong to this shop and load their schedule.
  let barberWeekly: WeeklySchedule | null = null;
  if (barberFilter !== null) {
    const [barber] = await db
      .select({ weeklySchedule: barbersTable.weeklySchedule })
      .from(barbersTable)
      .where(and(eq(barbersTable.id, barberFilter), eq(barbersTable.userId, shopId)))
      .limit(1);
    if (!barber) {
      // Barber doesn't belong to this shop — fall back to shop-wide scan.
      // (Silently ignore the filter rather than erroring, to keep the banner useful.)
    } else {
      barberWeekly = (barber.weeklySchedule ?? null) as WeeklySchedule | null;
    }
  }

  // Use barber's own schedule when available, otherwise fall back to shop schedule.
  const weekly = barberWeekly ?? shopWeekly;

  const now = new Date();
  const today = localYMD(now);
  const scanDays = Math.min(maxBookingDays, 14);

  for (let dayOffset = 0; dayOffset < scanDays; dayOffset++) {
    const target = new Date(`${today}T12:00:00Z`);
    target.setUTCDate(target.getUTCDate() + dayOffset);
    const date = localYMD(target);

  const dayKey = localDayKey(now);
  const defaults: DaySchedule = { closed: false, open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00" };
  const day: DaySchedule = shopWeekly?.[dayKey] ?? defaults;

  if (day.closed) {
    res.json({ dayClosed: true, totalSlots: 0, bookedSlots: 0, ratio: 0, level: "closed" as const });
    return;
  }

  const openMin = parseHHMM(day.open);
  const closeMin = parseHHMM(day.close);
  const lunchStart = parseHHMM(day.lunchStart);
  const lunchEnd = parseHHMM(day.lunchEnd);
  const hasLunch = lunchEnd > lunchStart;

  // Load today's appointments
  const dStart = new Date(`${today}T00:00:00Z`);
  const before = new Date(dStart.getTime() - 24 * 3600 * 1000);
  const after = new Date(dStart.getTime() + 48 * 3600 * 1000);
  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.userId, shopId),
      gte(appointmentsTable.scheduledAt, before),
      lt(appointmentsTable.scheduledAt, after),
    ));

  const blocked: Array<[number, number]> = [];
  for (const a of appts) {
    if (a.status === "cancelled" || a.status === "completed") continue;
    if (localYMD(a.scheduledAt) !== today) continue;
    const start = parseHHMM(localHHMM(a.scheduledAt));
      blocked.push([start, start + a.serviceDuration]);
    }

    const nowMin = date === today ? parseHHMM(localHHMM(now)) : -1;
  const step = Math.max(5, slotIntervalMinutes);

  for (let t = openMin; t + SCAN_DURATION <= closeMin; t += step) {
    const end = t + SCAN_DURATION;
    const overlapsLunch = hasLunch && t < lunchEnd && end > lunchStart;
    const overlapsAppt = blocked.some(([s, e]) => t < e && end > s);
      const inPast = nowMin >= 0 && t < nowMin + minAdvanceMinutes;
      if (!overlapsLunch && !overlapsAppt && !inPast) {
        const hh = Math.floor(t / 60).toString().padStart(2, "0");
        const mm = (t % 60).toString().padStart(2, "0");
        res.json({ nextDate: date, nextTime: `${hh}:${mm}` });
        return;
      }
    }
  }

  res.json({ nextDate: null, nextTime: null });
});

// ── Busyness ────────────────────────────────────────────────────────────────
// Returns how busy the shop is TODAY based on the ratio of blocked slots to
// total slots. Uses a fixed 30-min scan window (same as next-available) with
// the shop's configured slotIntervalMinutes as the step.
router.get("/b/:slug/busyness", async (req, res): Promise<void> => {
  const slug = String(req.params.slug ?? "").trim().toLowerCase();
  if (!slug) {
    res.status(400).json({ error: "Slug obrigatório" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      trialStartedAt: usersTable.trialStartedAt,
      trialEligible: usersTable.trialEligible,
      hasEverPaid: usersTable.hasEverPaid,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      maxBarbers: usersTable.maxBarbers,
    })
    .from(usersTable)
    .where(eq(usersTable.slug, slug))
    .limit(1);

    const [redirect] = await db
      .select({ userId: slugRedirectsTable.userId })
      .from(slugRedirectsTable)
      .where(eq(slugRedirectsTable.oldSlug, slug))
      .limit(1);

  if (!user) {
    res.status(404).json({ error: "Barbearia não encontrada" });
    return;
  }
  if (!accountCanAccess(user)) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "A fila ao vivo está temporariamente indisponível.",
    });
    return;
  }

  const shopId = user.id;

  const [settings] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, shopId))
    .limit(1);

  const shopWeekly = (settings?.weeklySchedule ?? null) as WeeklySchedule | null;
  const slotIntervalMinutes = settings?.slotIntervalMinutes ?? 15;
  const SCAN_DURATION = 30;

  const barberIdRaw = req.query.barberId;
  const barberId = typeof barberIdRaw === "string" && /^\d+$/.test(barberIdRaw)
    ? Number.parseInt(barberIdRaw, 10)
    : null;

  let weekly = shopWeekly;
  let scopedBarberId: number | null = null;
  if (barberId !== null) {
    const [barber] = await db
      .select({ id: barbersTable.id, weeklySchedule: barbersTable.weeklySchedule })
      .from(barbersTable)
      .where(and(eq(barbersTable.id, barberId), eq(barbersTable.userId, shopId)))
      .limit(1);

    if (barber) {
      scopedBarberId = barber.id;
      weekly = (barber.weeklySchedule ?? shopWeekly) as WeeklySchedule | null;
    }
  }

  const now = new Date();
  const today = localYMD(now);
  const dayKey = localDayKey(now);

  const defaults: DaySchedule = { closed: false, open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00" };
  const day: DaySchedule = weekly?.[dayKey] ?? defaults;

  if (day.closed) {
    res.json({ dayClosed: true, totalSlots: 0, bookedSlots: 0, ratio: 0, level: "closed" as const });
    return;
  }

  const openMin = parseHHMM(day.open);
  const closeMin = parseHHMM(day.close);
  const lunchStart = parseHHMM(day.lunchStart);
  const lunchEnd = parseHHMM(day.lunchEnd);
  const hasLunch = lunchEnd > lunchStart;

  // Load today's appointments
  const dStart = new Date(`${today}T00:00:00Z`);
  const before = new Date(dStart.getTime() - 24 * 3600 * 1000);
  const after = new Date(dStart.getTime() + 48 * 3600 * 1000);
  const appointmentConditions = [
    eq(appointmentsTable.userId, shopId),
    gte(appointmentsTable.scheduledAt, before),
    lt(appointmentsTable.scheduledAt, after),
  ];
  if (scopedBarberId !== null) {
    appointmentConditions.push(eq(appointmentsTable.barberId, scopedBarberId));
  }

  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(and(...appointmentConditions));

  const blocked: Array<[number, number]> = [];
  for (const a of appts) {
    if (a.status === "cancelled" || a.status === "completed") continue;
    if (localYMD(a.scheduledAt) !== today) continue;
    const start = parseHHMM(localHHMM(a.scheduledAt));
    blocked.push([start, start + a.serviceDuration]);
  }

  const step = Math.max(5, slotIntervalMinutes);
  let totalSlots = 0;
  let bookedSlots = 0;

  for (let t = openMin; t + SCAN_DURATION <= closeMin; t += step) {
    const end = t + SCAN_DURATION;
    const overlapsLunch = hasLunch && t < lunchEnd && end > lunchStart;
    if (overlapsLunch) continue;
    totalSlots++;
    const overlapsAppt = blocked.some(([s, e]) => t < e && end > s);
    if (overlapsAppt) bookedSlots++;
  }

  const ratio = totalSlots === 0 ? 0 : bookedSlots / totalSlots;
  const level =
    ratio >= 0.85 ? "critical" :
    ratio >= 0.60 ? "high" :
    ratio >= 0.30 ? "moderate" :
    "low";

  res.json({ dayClosed: false, totalSlots, bookedSlots, ratio, level });
});

export default router;
