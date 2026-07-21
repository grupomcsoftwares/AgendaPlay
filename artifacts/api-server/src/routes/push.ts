import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, adminPushSubscriptionsTable, appointmentsTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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

router.delete("/push/unsubscribe/:token", async (req, res) => {
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.cancelToken, req.params.token));
  res.json({ ok: true });
});

// Trigger endpoint: when a client page pings this, the server checks
// if any 15-min reminders are due right now and sends them immediately.
// Works on autoscale because it's driven by client requests, not a timer.
router.post("/push/trigger-reminders", async (_req, res) => {
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
        or(
          eq(pushSubscriptionsTable.notify15Sent, false),
          eq(pushSubscriptionsTable.notify10Sent, false),
          eq(pushSubscriptionsTable.notify5Sent,  false),
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
    res.json({ sent });
  } catch {
    res.json({ sent: 0 });
  }
});

// ── Admin push subscriptions ─────────────────────────────────────────

router.post("/push/admin/subscribe", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
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

router.delete("/push/admin/unsubscribe", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
  if (endpoint) {
    await db.delete(adminPushSubscriptionsTable).where(eq(adminPushSubscriptionsTable.endpoint, endpoint));
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
  sound?: "new" | "rescheduled";
}) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
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

export async function runPushScheduler() {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  setInterval(async () => {
    try {
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
        .where(eq(pushSubscriptionsTable.notify15Sent, false));

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
    } catch { /* ignore scheduler errors */ }
  }, 60_000);
}

export default router;
