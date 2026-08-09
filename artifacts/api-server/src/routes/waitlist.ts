import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { db, servicesTable, settingsTable, waitlistTable } from "@workspace/db";
import {
  JoinWaitlistBody,
  GetWaitlistOfferParams,
  AcceptWaitlistOfferParams,
  DeclineWaitlistOfferParams,
} from "@workspace/api-zod";
import { resolveAuthoritativeBooking } from "./appointments.js";
import { isBarberAllowedForService } from "./barbers.js";
import { offerNextWaitlistForSlot, formatPublicWaitlistEntry } from "../waitlistService.js";
import { accountCanAccess } from "./accountStatus.js";
import { usersTable } from "@workspace/db";

const router = Router();
const TZ = "America/Sao_Paulo";

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function getOffer(token: string) {
  const [entry] = await db
    .select()
    .from(waitlistTable)
    .where(eq(waitlistTable.offerToken, token))
    .limit(1);
  return entry;
}

function publicOffer(entry: typeof waitlistTable.$inferSelect, shopName: string) {
  return {
    ...formatPublicWaitlistEntry(entry),
    shopName,
    offerExpiresAt: entry.offerExpiresAt?.toISOString() ?? "",
  };
}

router.post("/waitlist", async (req, res): Promise<void> => {
  const parsed = JoinWaitlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const shopId = data.shopId.trim();
  const clientName = data.clientName.trim();
  const clientPhone = data.clientPhone.replace(/\D/g, "");
  if (!shopId || !clientName || clientPhone.length < 8 || !validDate(data.desiredDate)) {
    res.status(400).json({ error: "Informe nome, telefone e uma data válida." });
    return;
  }
  const [account] = await db.select({
    trialStartedAt: usersTable.trialStartedAt,
    stripeSubscriptionId: usersTable.stripeSubscriptionId,
    stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
    subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    maxBarbers: usersTable.maxBarbers,
  }).from(usersTable).where(eq(usersTable.id, shopId)).limit(1);
  if (!account || !accountCanAccess(account)) {
    res.status(403).json({ code: "SUBSCRIPTION_EXPIRED", error: "A barbearia não está ativa." });
    return;
  }

  const authoritative = await resolveAuthoritativeBooking(shopId, {
    serviceIds: data.serviceIds,
    serviceName: data.serviceName,
    servicePrice: 0,
    serviceDuration: data.serviceDuration,
  }, new Date(`${data.desiredDate}T12:00:00Z`), true);
  if ("error" in authoritative) {
    res.status(400).json({ error: authoritative.error });
    return;
  }
  if (data.barberId != null) {
    for (const serviceId of authoritative.serviceIds) {
      const check = await isBarberAllowedForService(db, data.barberId, serviceId, shopId);
      if (!check.ok) {
        res.status(400).json({ error: `Profissional inválido: ${check.reason}` });
        return;
      }
    }
  }
  const availabilityQuery = new URLSearchParams({
    shopId,
    date: data.desiredDate,
    serviceDuration: String(authoritative.serviceDuration),
  });
  if (data.barberId != null) availabilityQuery.set("barberId", String(data.barberId));
  const availabilityResponse = await fetch(
    `http://127.0.0.1:${process.env.PORT ?? "8080"}/api/availability?${availabilityQuery.toString()}`,
  );
  if (availabilityResponse.ok) {
    const availability = await availabilityResponse.json() as {
      dayClosed?: boolean;
      slots?: Array<{ available?: boolean }>;
    };
    if (availability.dayClosed) {
      res.status(409).json({ error: "A barbearia não funciona nesta data." });
      return;
    }
    if (availability.slots?.some((slot) => slot.available)) {
      res.status(409).json({ error: "Ainda existe um horário compatível nesta data." });
      return;
    }
  }
  if (!data.endpoint || !data.p256dh || !data.auth) {
    res.status(400).json({ error: "Ative as notificações para entrar na fila de espera." });
    return;
  }

  const selectedServices = await db
    .select({ durationMinutes: servicesTable.durationMinutes })
    .from(servicesTable)
    .where(and(
      eq(servicesTable.userId, shopId),
      inArray(servicesTable.id, authoritative.serviceIds),
    ));
  const priorityDuration = Math.max(
    ...selectedServices.map((service) => service.durationMinutes),
    authoritative.serviceDuration,
  );

  const [existing] = await db.select().from(waitlistTable).where(and(
    eq(waitlistTable.userId, shopId),
    eq(waitlistTable.clientPhone, clientPhone),
    eq(waitlistTable.desiredDate, data.desiredDate),
    eq(waitlistTable.status, "active"),
  )).limit(1);
  if (existing) {
    res.status(409).json({ error: "Você já está na fila para esta data." });
    return;
  }

  const [entry] = await db.insert(waitlistTable).values({
    userId: shopId,
    clientName,
    clientPhone,
    serviceIds: authoritative.serviceIds,
    serviceName: authoritative.serviceName,
    serviceDuration: authoritative.serviceDuration,
    priorityDuration,
    servicePrice: String(authoritative.servicePrice),
    barberId: data.barberId ?? null,
    barberName: data.barberName ?? null,
    desiredDate: data.desiredDate,
    endpoint: data.endpoint,
    p256dh: data.p256dh,
    auth: data.auth,
    offerToken: crypto.randomUUID(),
  }).returning();
  if (!entry) {
    res.status(500).json({ error: "Não foi possível entrar na fila." });
    return;
  }
  res.status(201).json(formatPublicWaitlistEntry(entry));
});

router.get("/waitlist/offers/:token", async (req, res): Promise<void> => {
  const parsed = GetWaitlistOfferParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const entry = await getOffer(parsed.data.token);
  if (!entry) {
    res.status(404).json({ error: "Oferta não encontrada." });
    return;
  }
  if (entry.status === "offered" && entry.offerExpiresAt && entry.offerExpiresAt.getTime() <= Date.now()) {
    const [expiredEntry] = await db.update(waitlistTable).set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(waitlistTable.id, entry.id), eq(waitlistTable.status, "offered")))
      .returning({ id: waitlistTable.id });
    if (expiredEntry && entry.offeredScheduledAt) {
      await offerNextWaitlistForSlot({
        userId: entry.userId,
        scheduledAt: entry.offeredScheduledAt,
        serviceDuration: entry.offerSlotDuration ?? entry.serviceDuration,
        barberId: entry.offeredBarberId ?? entry.barberId,
      });
    }
    res.status(410).json({ error: "Esta oferta expirou." });
    return;
  }
  const [settings] = await db.select({ barbershopName: settingsTable.barbershopName })
    .from(settingsTable).where(eq(settingsTable.userId, entry.userId)).limit(1);
  res.json(publicOffer(entry, settings?.barbershopName ?? "AgendaPlay"));
});

router.post("/waitlist/offers/:token/accept", async (req, res): Promise<void> => {
  const parsed = AcceptWaitlistOfferParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db
    .select()
    .from(waitlistTable)
    .where(and(eq(waitlistTable.offerToken, parsed.data.token), eq(waitlistTable.status, "offered")))
    .limit(1);
  if (!entry || !entry.offeredScheduledAt) {
    res.status(409).json({ error: "Esta oferta não está mais disponível." });
    return;
  }
  if (entry.offerExpiresAt && entry.offerExpiresAt.getTime() <= Date.now()) {
    const [expiredEntry] = await db.update(waitlistTable).set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(waitlistTable.id, entry.id), eq(waitlistTable.status, "offered")))
      .returning({ id: waitlistTable.id });
    if (expiredEntry && entry.offeredScheduledAt) {
      await offerNextWaitlistForSlot({
        userId: entry.userId,
        scheduledAt: entry.offeredScheduledAt,
        serviceDuration: entry.offerSlotDuration ?? entry.serviceDuration,
        barberId: entry.offeredBarberId ?? entry.barberId,
      });
    }
    res.status(410).json({ error: "Esta oferta expirou." });
    return;
  }

  // Claim the offer before creating the appointment. This prevents two taps,
  // or two browser tabs, from both creating an appointment for the same slot.
  const [claimed] = await db.update(waitlistTable)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(and(eq(waitlistTable.id, entry.id), eq(waitlistTable.status, "offered")))
    .returning();
  if (!claimed) {
    res.status(409).json({ error: "Esta oferta já foi aceita." });
    return;
  }

  const origin = `http://127.0.0.1:${process.env.PORT ?? "8080"}`;
  const appointmentResponse = await fetch(`${origin}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shopId: entry.userId,
      clientName: entry.clientName,
      serviceIds: entry.serviceIds,
      serviceName: entry.serviceName,
      servicePrice: Number(entry.servicePrice),
      serviceDuration: entry.serviceDuration,
      barberId: entry.offeredBarberId ?? entry.barberId ?? undefined,
      barberName: entry.barberName ?? undefined,
      scheduledAt: entry.offeredScheduledAt.toISOString(),
      paymentMethod: "on_site",
      notes: `Tel: ${entry.clientPhone}. Agendamento aceito pela fila de espera.`,
    }),
  });
  const payload = await appointmentResponse.json().catch(() => ({}));
  if (!appointmentResponse.ok) {
    await db.update(waitlistTable)
      .set({ status: "offered", offerLastNotifiedAt: null, updatedAt: new Date() })
      .where(and(eq(waitlistTable.id, entry.id), eq(waitlistTable.status, "accepted")));
    res.status(appointmentResponse.status === 409 ? 409 : 400).json(payload);
    return;
  }
  res.status(201).json(payload);
});

router.post("/waitlist/offers/:token/decline", async (req, res): Promise<void> => {
  const parsed = DeclineWaitlistOfferParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const entry = await getOffer(parsed.data.token);
  if (!entry) {
    res.status(404).json({ error: "Oferta não encontrada." });
    return;
  }
  const [declined] = await db.update(waitlistTable)
    .set({ status: "declined", updatedAt: new Date() })
    .where(and(eq(waitlistTable.id, entry.id), eq(waitlistTable.status, "offered")))
    .returning();
  if (declined?.offeredScheduledAt) {
    await offerNextWaitlistForSlot({
      userId: declined.userId,
      scheduledAt: declined.offeredScheduledAt,
      serviceDuration: declined.offerSlotDuration ?? declined.serviceDuration,
      barberId: declined.offeredBarberId ?? declined.barberId,
    });
  }
  res.json(formatPublicWaitlistEntry(declined ?? entry));
});

export default router;