import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import {
  pushSubscriptionsTable,
  adminPushSubscriptionsTable,
  appointmentsTable,
  settingsTable,
  usersTable,
  clientsTable,
  clientReengagementPushSubscriptionsTable,
  nativePushSubscriptionsTable,
} from "@workspace/db/schema";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { requireActiveAuth } from "../middleware/accountActive.js";

const router = Router();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contato@agendaplay.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY ?? "" });
});

router.post("/push/native/subscribe", requireActiveAuth, async (req, res) => {
  const expoPushToken = typeof req.body?.expoPushToken === "string"
    ? req.body.expoPushToken.trim()
    : "";
  if (!/^ExponentPushToken\[[^\]]+\]$/.test(expoPushToken)) {
    res.status(400).json({ error: "Token nativo inválido." });
    return;
  }

  await db
    .insert(nativePushSubscriptionsTable)
    .values({
      userId: req.session.userId!,
      expoPushToken,
      platform: "android",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [nativePushSubscriptionsTable.userId, nativePushSubscriptionsTable.expoPushToken],
      set: { updatedAt: new Date(), platform: "android" },
    });
  res.json({ ok: true });
});

router.post("/push/native/status", requireActiveAuth, async (req, res) => {
  const expoPushToken = typeof req.body?.expoPushToken === "string"
    ? req.body.expoPushToken.trim()
    : "";

  if (!expoPushToken) {
    res.json({ ok: true, enabled: false });
    return;
  }

  const subscriptions = await db
    .select({ id: nativePushSubscriptionsTable.id })
    .from(nativePushSubscriptionsTable)
    .where(and(
      eq(nativePushSubscriptionsTable.userId, req.session.userId!),
      eq(nativePushSubscriptionsTable.expoPushToken, expoPushToken),
    ))
    .limit(1);

  res.json({ ok: true, enabled: subscriptions.length > 0 });
});

router.delete("/push/native/subscribe", requireActiveAuth, async (req, res) => {
  const expoPushToken = typeof req.body?.expoPushToken === "string"
    ? req.body.expoPushToken.trim()
    : "";
  const conditions = [eq(nativePushSubscriptionsTable.userId, req.session.userId!)];
  if (expoPushToken) conditions.push(eq(nativePushSubscriptionsTable.expoPushToken, expoPushToken));
  await db.delete(nativePushSubscriptionsTable).where(and(...conditions));
  res.json({ ok: true });
});

router.post("/push/subscribe", async (req, res) => {
  const { cancelToken, scheduledAt, endpoint, p256dh, auth } = req.body ?? {};
  if (
    typeof cancelToken !== "string" || !cancelToken ||
    typeof scheduledAt !== "string" || !scheduledAt ||
    typeof endpoint !== "string" || !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" || !p256dh ||
    typeof auth !== "string" || !auth
  ) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  await db
    .insert(pushSubscriptionsTable)
    .values({ cancelToken, scheduledAt: new Date(scheduledAt), endpoint, p256dh, auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.cancelToken,
      set: { endpoint, p256dh, auth, scheduledAt: new Date(scheduledAt), notify15Sent: false },
    });
  res.json({ ok: true });
});

// Registers the same browser subscription for the inactive-client automation.
// The appointment token is used as the source of truth for the shop and client.
router.post("/push/reengagement-subscribe", async (req, res) => {
  const { cancelToken, endpoint, p256dh, auth } = req.body ?? {};
  if (
    typeof cancelToken !== "string" || !cancelToken ||
    typeof endpoint !== "string" || !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" || !p256dh ||
    typeof auth !== "string" || !auth
  ) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }

  const [appointment] = await db
    .select({
      userId: appointmentsTable.userId,
      clientName: appointmentsTable.clientName,
      clientPhone: clientsTable.phone,
      createdAt: appointmentsTable.createdAt,
    })
    .from(appointmentsTable)
    .leftJoin(clientsTable, eq(appointmentsTable.clientId, clientsTable.id))
    .where(eq(appointmentsTable.cancelToken, cancelToken))
    .limit(1);

  if (!appointment || !appointment.clientPhone) {
    res.status(404).json({ error: "Agendamento ou cliente não encontrado." });
    return;
  }

  await db
    .insert(clientReengagementPushSubscriptionsTable)
    .values({
      userId: appointment.userId,
      clientPhone: appointment.clientPhone,
      clientName: appointment.clientName,
      endpoint,
      p256dh,
      auth,
      lastAppointmentAt: appointment.createdAt,
      reengagementSentAt: null,
    })
    .onConflictDoUpdate({
      target: [
        clientReengagementPushSubscriptionsTable.userId,
        clientReengagementPushSubscriptionsTable.clientPhone,
        clientReengagementPushSubscriptionsTable.endpoint,
      ],
      set: {
        clientName: appointment.clientName,
        lastAppointmentAt: appointment.createdAt,
        reengagementSentAt: null,
        p256dh,
        auth,
        updatedAt: new Date(),
      },
    });
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
      eq(clientReengagementPushSubscriptionsTable.clientPhone, appointment.clientPhone),
    ));

  res.json({ ok: true });
});

router.delete("/push/unsubscribe/:token", async (req, res) => {
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.cancelToken, req.params.token));
  res.json({ ok: true });
});

// Trigger endpoint: when a client page pings this, the server checks
// if any 15-min reminders are due right now and sends them immediately.
// Works on autoscale because it's driven by client requests, not a timer.
router.post("/push/trigger-reminders", async (req, res) => {
  // Also auto-advance appointment statuses by time (independent of queue).
  // The shopId comes from the request body (sent by the client booking page).
  const shopIdForAutoStart = typeof req.body?.shopId === "string" ? req.body.shopId.trim() : null;
  if (shopIdForAutoStart) {
    try {
      const { autoAdvanceAppointmentsByTime, canShopAutoAdvance } = await import("./appointments.js");
      if (await canShopAutoAdvance(shopIdForAutoStart)) {
        await autoAdvanceAppointmentsByTime(shopIdForAutoStart);
      }
    } catch { /* non-critical */ }
  }

  if (!process.env.VAPID_PUBLIC_KEY) {
    res.json({ sent: 0, reason: "vapid_not_configured" });
    return;
  }
  try {
    const now = new Date();
    const nowMs = now.getTime();

    // Fetch subscriptions that still have at least one reminder to send
    const { or } = await import("drizzle-orm");
    const rows = await db
      .select({
        id:              pushSubscriptionsTable.id,
        scheduledAt:     pushSubscriptionsTable.scheduledAt,
        endpoint:        pushSubscriptionsTable.endpoint,
        p256dh:          pushSubscriptionsTable.p256dh,
        auth:            pushSubscriptionsTable.auth,
        cancelToken:     pushSubscriptionsTable.cancelToken,
        notify15Sent:    pushSubscriptionsTable.notify15Sent,
        notify10Sent:    pushSubscriptionsTable.notify10Sent,
        notify5Sent:     pushSubscriptionsTable.notify5Sent,
        serviceName:     appointmentsTable.serviceName,
        servicePrice:    appointmentsTable.servicePrice,
        serviceDuration: appointmentsTable.serviceDuration,
        shopName:        settingsTable.barbershopName,
      })
      .from(pushSubscriptionsTable)
      .innerJoin(appointmentsTable, eq(pushSubscriptionsTable.cancelToken, appointmentsTable.cancelToken))
      .leftJoin(settingsTable, eq(appointmentsTable.userId, settingsTable.userId))
      .where(
        and(
          notInArray(appointmentsTable.status, ["pending_payment", "payment_rejected", "cancelled", "completed"]),
          or(
            eq(pushSubscriptionsTable.notify15Sent, false),
            eq(pushSubscriptionsTable.notify10Sent, false),
            eq(pushSubscriptionsTable.notify5Sent,  false),
          )!,
        )!
      );

    // Each reminder fires in a ±1 min window around the target offset
    const windows = [
      { minutesBefore: 15, sentField: "notify15Sent" as const, label: "15 minutos" },
      { minutesBefore: 10, sentField: "notify10Sent" as const, label: "10 minutos" },
      { minutesBefore:  5, sentField: "notify5Sent"  as const, label: "5 minutos"  },
    ] as const;

    let sent = 0;
    for (const row of rows) {
      const apptMs = new Date(row.scheduledAt).getTime();
      const diffMs = apptMs - nowMs; // positive = appointment is in the future

      const apptHH    = new Date(row.scheduledAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
      });
      const shopLabel = row.shopName ?? "AgendaPlay";
      const price     = row.servicePrice != null ? `R$ ${Number(row.servicePrice).toFixed(2).replace(".", ",")}` : "";
      const duration  = row.serviceDuration ? `${row.serviceDuration} min` : "";

      for (const w of windows) {
        if (row[w.sentField]) continue; // already sent

        const targetMs  = w.minutesBefore * 60 * 1000;
        const windowMin = targetMs - 60 * 1000; // 1 min before target
        const windowMax = targetMs + 60 * 1000; // 1 min after target

        if (diffMs < windowMin || diffMs > windowMax) continue; // not in window yet

        const title = `⏰ ${shopLabel} — faltam ${w.label}!`;
        const body  = `${row.serviceName} · ${duration} · ${price} · ${apptHH}`;

        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify({ title, body, tag: `appt-${row.cancelToken}-${w.minutesBefore}`, url: `/agendamento/${row.cancelToken}` }),
          );
          await db.update(pushSubscriptionsTable)
            .set({ [w.sentField]: true })
            .where(eq(pushSubscriptionsTable.id, row.id));
          sent++;
        } catch {
          // Subscription expired or invalid — remove it
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, row.id));
          break; // no point trying other windows for a dead subscription
        }
      }
    }
    const reengagementSent = await sendClientReengagementPushes();
    res.json({ sent, reengagementSent });
  } catch {
    res.json({ sent: 0 });
  }
});

// ── Admin push subscriptions ─────────────────────────────────────────

router.post("/push/admin/subscribe", requireActiveAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { endpoint, p256dh, auth } = req.body ?? {};
  if (
    typeof endpoint !== "string" || !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" || !p256dh ||
    typeof auth !== "string" || !auth
  ) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  await db
    .insert(adminPushSubscriptionsTable)
    .values({ userId, endpoint, p256dh, auth })
    .onConflictDoUpdate({
      target: [adminPushSubscriptionsTable.userId, adminPushSubscriptionsTable.endpoint],
      set: { p256dh, auth },
    });
  res.json({ ok: true });
});

router.delete("/push/admin/unsubscribe", requireActiveAuth, async (req, res) => {
  const userId = req.session.userId!;
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
  if (endpoint) {
    await db.delete(adminPushSubscriptionsTable).where(and(
      eq(adminPushSubscriptionsTable.endpoint, endpoint),
      eq(adminPushSubscriptionsTable.userId, userId),
    ));
  } else {
    await db.delete(adminPushSubscriptionsTable).where(eq(adminPushSubscriptionsTable.userId, userId));
  }
  res.json({ ok: true });
});

export async function sendAdminPush(userId: string, payload: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  sound?: "new" | "changed" | "pix_pending";
}) {
  if (process.env.VAPID_PUBLIC_KEY) {
    const subs = await db
      .select()
      .from(adminPushSubscriptionsTable)
      .where(eq(adminPushSubscriptionsTable.userId, userId));
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch {
        await db.delete(adminPushSubscriptionsTable).where(eq(adminPushSubscriptionsTable.id, sub.id));
      }
    }
  }

  const nativeSubs = await db
    .select()
    .from(nativePushSubscriptionsTable)
    .where(eq(nativePushSubscriptionsTable.userId, userId));
  for (const sub of nativeSubs) {
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sub.expoPushToken,
          title: payload.title,
          body: payload.body,
          data: {
            url: payload.url ?? "/",
            sound: payload.sound ?? "new",
            tag: payload.tag ?? "agendaplay",
          },
          sound: payload.sound === "pix_pending"
            ? "pix-pending.mp3"
            : payload.sound === "changed"
              ? "appointment-changed.mp3"
              : "new-appointment.mp3",
          channelId: payload.sound === "pix_pending"
            ? "agendaplay-pix-pending"
            : payload.sound === "changed"
              ? "agendaplay-appointment-changed"
              : "agendaplay-new-appointment",
          priority: "high",
        }),
      });
      const result = await response.json().catch(() => ({})) as {
        data?: { status?: string; details?: { error?: string } };
      };
      if (!response.ok || result.data?.status === "error") {
        const error = result.data?.details?.error;
        if (error === "DeviceNotRegistered" || error === "InvalidCredentials") {
          await db.delete(nativePushSubscriptionsTable).where(eq(nativePushSubscriptionsTable.id, sub.id));
        }
      }
    } catch {
      // Keep the token for transient Expo service/network failures.
    }
  }
}

async function sendPendingPaymentAlerts() {
  const pending = await db
    .select({
      id: appointmentsTable.id,
      userId: appointmentsTable.userId,
      clientName: appointmentsTable.clientName,
      serviceName: appointmentsTable.serviceName,
      scheduledAt: appointmentsTable.scheduledAt,
      cancelToken: appointmentsTable.cancelToken,
      shopName: settingsTable.barbershopName,
    })
    .from(appointmentsTable)
    .leftJoin(settingsTable, eq(appointmentsTable.userId, settingsTable.userId))
    .where(eq(appointmentsTable.status, "pending_payment"));

  await Promise.all(pending.map(async (appointment) => {
    const scheduledAt = new Date(appointment.scheduledAt);
    const date = scheduledAt.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const time = scheduledAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    await sendAdminPush(appointment.userId, {
      title: "💳 Pix aguardando aprovação",
      body: `${appointment.clientName} · ${appointment.serviceName} · ${date} às ${time}`,
      tag: `pix-pending-${appointment.id}`,
      url: `/agendamento/${appointment.cancelToken}`,
      sound: "pix_pending",
    }).catch(() => {});
  }));
}

export async function sendClientAppointmentPush(cancelToken: string, payload: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  const [sub] = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.cancelToken, cancelToken))
    .limit(1);
  if (!sub) return;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
  } catch {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id));
  }
}

export async function runPushScheduler() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sendPendingPaymentAlerts();
      if (!process.env.VAPID_PUBLIC_KEY) return;
      const now = new Date();
      const windowStart = new Date(now.getTime() + 14 * 60 * 1000);
      const windowEnd   = new Date(now.getTime() + 16 * 60 * 1000);

      // Join with appointments + settings for rich notification content
      const rows = await db
        .select({
          id:              pushSubscriptionsTable.id,
          scheduledAt:     pushSubscriptionsTable.scheduledAt,
          endpoint:        pushSubscriptionsTable.endpoint,
          p256dh:          pushSubscriptionsTable.p256dh,
          auth:            pushSubscriptionsTable.auth,
          cancelToken:     pushSubscriptionsTable.cancelToken,
          clientName:      appointmentsTable.clientName,
          serviceName:     appointmentsTable.serviceName,
          servicePrice:    appointmentsTable.servicePrice,
          serviceDuration: appointmentsTable.serviceDuration,
          barberName:      appointmentsTable.barberName,
          shopName:        settingsTable.barbershopName,
        })
        .from(pushSubscriptionsTable)
        .innerJoin(appointmentsTable, eq(pushSubscriptionsTable.cancelToken, appointmentsTable.cancelToken))
        .leftJoin(settingsTable, eq(appointmentsTable.userId, settingsTable.userId))
        .where(and(
          eq(pushSubscriptionsTable.notify15Sent, false),
          notInArray(appointmentsTable.status, ["pending_payment", "payment_rejected", "cancelled", "completed"]),
        ));

      for (const row of rows) {
        const apptTime = new Date(row.scheduledAt).getTime();
        if (apptTime < windowStart.getTime() || apptTime > windowEnd.getTime()) continue;

        const apptHH     = new Date(row.scheduledAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        });

        const shopLabel  = row.shopName ?? "AgendaPlay";
        const price      = row.servicePrice != null ? `R$ ${Number(row.servicePrice).toFixed(2).replace(".", ",")}` : "";
        const duration   = row.serviceDuration ? `${row.serviceDuration} min` : "";
        const title      = `⏰ ${shopLabel} — faltam 15 minutos!`;
        const body       = `${row.serviceName} · ${duration} · ${price} · ${apptHH}`;

        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify({
              title,
              body,
              tag: `appt-${row.cancelToken}`,
              url: `/agendamento/${row.cancelToken}`,
            }),
          );
          await db
            .update(pushSubscriptionsTable)
            .set({ notify15Sent: true })
            .where(eq(pushSubscriptionsTable.id, row.id));
        } catch {
          // subscription expired or invalid — remove it
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, row.id));
        }
      }
      await sendClientReengagementPushes();
    } catch { /* ignore scheduler errors */ }
    finally {
      running = false;
    }
  };

  void run();
  setInterval(() => { void run(); }, 60_000);
}

function renderReengagementMessage(template: string, values: {
  name: string;
  days: number;
  shopName: string;
}) {
  return template
    .replace(/\{\{\s*nome\s*\}\}/gi, values.name)
    .replace(/\{\{\s*dias\s*\}\}/gi, String(values.days))
    .replace(/\{\{\s*barbearia\s*\}\}/gi, values.shopName);
}

export async function sendClientReengagementPushes(): Promise<number> {
  if (!process.env.VAPID_PUBLIC_KEY) return 0;

  const rows = await db
    .select({
      id: clientReengagementPushSubscriptionsTable.id,
      clientName: clientReengagementPushSubscriptionsTable.clientName,
      endpoint: clientReengagementPushSubscriptionsTable.endpoint,
      p256dh: clientReengagementPushSubscriptionsTable.p256dh,
      auth: clientReengagementPushSubscriptionsTable.auth,
      lastAppointmentAt: clientReengagementPushSubscriptionsTable.lastAppointmentAt,
      config: settingsTable.clientReengagementConfig,
      shopName: settingsTable.barbershopName,
      shopSlug: usersTable.slug,
    })
    .from(clientReengagementPushSubscriptionsTable)
    .innerJoin(settingsTable, eq(clientReengagementPushSubscriptionsTable.userId, settingsTable.userId))
    .leftJoin(usersTable, eq(clientReengagementPushSubscriptionsTable.userId, usersTable.id))
    .where(isNull(clientReengagementPushSubscriptionsTable.reengagementSentAt));

  const now = Date.now();
  let sent = 0;

  for (const row of rows) {
    const config = row.config;
    if (!config?.enabled) continue;
    const inactiveDays = config.inactiveDays === 15 ? 15 : 30;
    const ageDays = Math.floor((now - new Date(row.lastAppointmentAt).getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays < inactiveDays) continue;

    // Claim before sending so simultaneous scheduler/trigger calls do not send twice.
    const claimed = await db
      .update(clientReengagementPushSubscriptionsTable)
      .set({ reengagementSentAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(clientReengagementPushSubscriptionsTable.id, row.id),
        isNull(clientReengagementPushSubscriptionsTable.reengagementSentAt),
      ))
      .returning({ id: clientReengagementPushSubscriptionsTable.id });
    if (claimed.length === 0) continue;

    const body = renderReengagementMessage(config.message, {
      name: row.clientName,
      days: inactiveDays,
      shopName: row.shopName ?? "sua barbearia",
    });

    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify({
          title: row.shopName ?? "AgendaPlay",
          body,
          tag: `reengagement-${row.id}`,
          url: row.shopSlug ? `/b/${encodeURIComponent(row.shopSlug)}` : "/",
        }),
      );
      sent++;
    } catch {
      await db
        .update(clientReengagementPushSubscriptionsTable)
        .set({ reengagementSentAt: null, updatedAt: new Date() })
        .where(eq(clientReengagementPushSubscriptionsTable.id, row.id));
    }
  }

  return sent;
}

export default router;
