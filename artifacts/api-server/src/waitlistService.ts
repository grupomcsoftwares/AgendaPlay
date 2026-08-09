import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, appointmentsTable, settingsTable, waitlistTable, type WeeklySchedule } from "@workspace/db";
import { sendWaitlistOfferReminders } from "./routes/push.js";
import { isBarberAllowedForService } from "./routes/barbers.js";

const TZ = "America/Sao_Paulo";
const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "18:00";

function localYMD(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function localDayKey(date: Date): typeof DAY_KEYS[number] {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(date);
  const map: Record<string, typeof DAY_KEYS[number]> = {
    Sun: "sunday", Mon: "monday", Tue: "tuesday", Wed: "wednesday",
    Thu: "thursday", Fri: "friday", Sat: "saturday",
  };
  return map[weekday] ?? "monday";
}

function parseHHMM(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function localMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60
    + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
}

function isBlockingAppointment(status: string): boolean {
  return status !== "cancelled" && status !== "payment_rejected" && status !== "completed";
}

function formatWaitlistEntry(entry: typeof waitlistTable.$inferSelect) {
  return {
    id: entry.id,
    userId: entry.userId,
    clientName: entry.clientName,
    serviceName: entry.serviceName,
    serviceDuration: entry.serviceDuration,
    barberId: entry.offeredBarberId ?? entry.barberId,
    barberName: entry.barberName,
    desiredDate: entry.desiredDate,
    status: entry.status,
    offerToken: entry.offerToken,
    offeredScheduledAt: entry.offeredScheduledAt?.toISOString() ?? null,
  };
}

function dateHash(value: string): number {
  let hash = 0;
  for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return hash;
}

export async function offerNextWaitlistForSlot(slot: {
  userId: string;
  scheduledAt: Date;
  serviceDuration: number;
  barberId: number | null;
}): Promise<boolean> {
  const desiredDate = localYMD(slot.scheduledAt);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(742005, ${dateHash(desiredDate)})`);

    const candidates = await tx
      .select()
      .from(waitlistTable)
      .where(and(
        eq(waitlistTable.userId, slot.userId),
        eq(waitlistTable.desiredDate, desiredDate),
        eq(waitlistTable.status, "active"),
        sql`${waitlistTable.serviceDuration} <= ${slot.serviceDuration}`,
        sql`(${waitlistTable.barberId} IS NULL OR ${slot.barberId} IS NULL OR ${waitlistTable.barberId} = ${slot.barberId})`,
      ))
      .orderBy(asc(waitlistTable.priorityDuration), asc(waitlistTable.createdAt))
      .limit(100);

    const dayStart = new Date(`${desiredDate}T00:00:00Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const sameDayAppointments = await tx
      .select()
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.userId, slot.userId),
        gte(appointmentsTable.scheduledAt, dayStart),
        lt(appointmentsTable.scheduledAt, dayEnd),
      ));
    const slotStart = localMinutes(slot.scheduledAt);

    for (const candidate of candidates) {
      const offeredBarberId = slot.barberId ?? candidate.barberId;
      if (offeredBarberId !== null) {
        let validServices = true;
        for (const serviceId of candidate.serviceIds) {
          const check = await isBarberAllowedForService(tx, offeredBarberId, serviceId, slot.userId);
          if (!check.ok) {
            validServices = false;
            break;
          }
        }
        if (!validServices) continue;
      }

      const candidateEnd = slotStart + candidate.serviceDuration;
      const [settings] = await tx
        .select({ weeklySchedule: settingsTable.weeklySchedule })
        .from(settingsTable)
        .where(eq(settingsTable.userId, slot.userId))
        .limit(1);
      const weekly = settings?.weeklySchedule as WeeklySchedule | null | undefined;
      const schedule = weekly?.[localDayKey(slot.scheduledAt)];
      const closeMin = parseHHMM(schedule?.close ?? DEFAULT_CLOSE);
      if (slotStart + candidate.serviceDuration > closeMin) continue;
      const conflicts = sameDayAppointments.some((appointment) => {
        if (!isBlockingAppointment(appointment.status)) return false;
        if (localYMD(appointment.scheduledAt) !== desiredDate) return false;
        if (offeredBarberId !== null && appointment.barberId !== null && appointment.barberId !== offeredBarberId) {
          return false;
        }
        const appointmentStart = localMinutes(appointment.scheduledAt);
        const appointmentEnd = appointmentStart + appointment.serviceDuration;
        return slotStart < appointmentEnd && candidateEnd > appointmentStart;
      });
      if (conflicts) continue;

      const expiresAt = new Date(Math.min(
        Date.now() + 5 * 60_000,
        slot.scheduledAt.getTime(),
      ));
      const [offered] = await tx
        .update(waitlistTable)
        .set({
          status: "offered",
          offeredScheduledAt: slot.scheduledAt,
          offeredBarberId,
          offerExpiresAt: expiresAt,
          offerLastNotifiedAt: null,
          offerSlotDuration: slot.serviceDuration,
          updatedAt: new Date(),
        })
        .where(and(eq(waitlistTable.id, candidate.id), eq(waitlistTable.status, "active")))
        .returning();
      if (offered) return offered;
    }
    return null;
  });

  if (!result) return false;
  await sendWaitlistOfferReminders();
  return true;
}

export async function cleanupWaitlist(): Promise<void> {
  const today = localYMD(new Date());
  const rows = await db
    .select({
      id: waitlistTable.id,
      userId: waitlistTable.userId,
      desiredDate: waitlistTable.desiredDate,
      status: waitlistTable.status,
      offeredScheduledAt: waitlistTable.offeredScheduledAt,
      offerExpiresAt: waitlistTable.offerExpiresAt,
      offerSlotDuration: waitlistTable.offerSlotDuration,
      serviceDuration: waitlistTable.serviceDuration,
      offeredBarberId: waitlistTable.offeredBarberId,
    })
    .from(waitlistTable)
    .where(inArray(waitlistTable.status, ["active", "offered"]));

  for (const row of rows) {
    let expired = row.desiredDate < today;
    if (row.desiredDate === today) {
      const [settings] = await db
        .select({ weeklySchedule: settingsTable.weeklySchedule })
        .from(settingsTable)
        .where(eq(settingsTable.userId, row.userId))
        .limit(1);
      const weekly = settings?.weeklySchedule as WeeklySchedule | null | undefined;
      const day = weekly?.[localDayKey(new Date())];
      const close = parseHHMM(day?.close ?? DEFAULT_CLOSE);
      expired = Boolean(day?.closed) || localMinutes(new Date()) >= close;
    }
    if (row.status === "offered" && row.offeredScheduledAt && row.offerExpiresAt) {
      expired = expired || row.offerExpiresAt.getTime() <= Date.now();
    }
    if (!expired) continue;

    const [expiredEntry] = await db
      .update(waitlistTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(waitlistTable.id, row.id), inArray(waitlistTable.status, ["active", "offered"])))
      .returning({ id: waitlistTable.id });

    if (expiredEntry && row.status === "offered" && row.offeredScheduledAt) {
      await offerNextWaitlistForSlot({
        userId: row.userId,
        scheduledAt: row.offeredScheduledAt,
        serviceDuration: row.offerSlotDuration ?? row.serviceDuration,
        barberId: row.offeredBarberId,
      });
    }
  }
}

export function formatPublicWaitlistEntry(entry: typeof waitlistTable.$inferSelect) {
  return formatWaitlistEntry(entry);
}
