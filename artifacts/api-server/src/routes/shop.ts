import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import { db, usersTable, settingsTable, appointmentsTable, clientsTable, type DaySchedule, type WeeklySchedule } from "@workspace/db";

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
    .where(and(eq(clientsTable.userId, shopId), eq(clientsTable.phone, phone)))
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
    .select({ id: usersTable.id, barbershopName: usersTable.barbershopName, slug: usersTable.slug })
    .from(usersTable)
    .where(eq(usersTable.slug, slug))
    .limit(1);

  if (!user) {
    const [byPrevious] = await db
      .select({ slug: usersTable.slug })
      .from(usersTable)
      .where(eq(usersTable.previousSlug, slug))
      .limit(1);

    if (byPrevious?.slug) {
      res.status(301).json({ redirectToSlug: byPrevious.slug });
    } else {
      res.status(404).json({ error: "Barbearia não encontrada" });
    }
    return;
  }

  const [settings] = await db
    .select({ logoUrl: settingsTable.logoUrl })
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

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.slug, slug))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Barbearia não encontrada" });
    return;
  }

  const shopId = user.id;

  const [settings] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, shopId))
    .limit(1);

  const weekly = (settings?.weeklySchedule ?? null) as WeeklySchedule | null;
  const maxBookingDays = settings?.maxBookingDays ?? 30;
  const minAdvanceMinutes = settings?.minAdvanceMinutes ?? 0;
  const slotIntervalMinutes = settings?.slotIntervalMinutes ?? 15;
  const SCAN_DURATION = 30;
  const BUFFER = 5;

  const now = new Date();
  const today = localYMD(now);

  const scanDays = Math.min(maxBookingDays, 14);

  for (let dayOffset = 0; dayOffset < scanDays; dayOffset++) {
    const target = new Date(`${today}T12:00:00Z`);
    target.setUTCDate(target.getUTCDate() + dayOffset);
    const date = localYMD(target);

    const dayKey = localDayKey(target);
    const defaults: DaySchedule = { closed: false, open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00" };
    const day: DaySchedule = weekly?.[dayKey] ?? defaults;

    if (day.closed) continue;

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
      const aLocalDate = localYMD(a.scheduledAt);
      if (aLocalDate !== date) continue;
      const start = parseHHMM(localHHMM(a.scheduledAt));
      blocked.push([start, start + a.serviceDuration]);
    }

    const nowMin = date === today ? parseHHMM(localHHMM(now)) : -1;
    const step = Math.max(5, slotIntervalMinutes);

    for (let t = openMin; t + SCAN_DURATION <= closeMin; t += step) {
      const end = t + SCAN_DURATION;
      const overlapsLunch = hasLunch && t < lunchEnd && end > lunchStart;
      const overlapsAppt = blocked.some(([s, e]) => t < e + BUFFER && end + BUFFER > s);
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

export default router;
