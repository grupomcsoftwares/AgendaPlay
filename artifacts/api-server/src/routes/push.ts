import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, appointmentsTable, settingsTable } from "@workspace/db/schema";
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
          id:           pushSubscriptionsTable.id,
          scheduledAt:  pushSubscriptionsTable.scheduledAt,
          endpoint:     pushSubscriptionsTable.endpoint,
          p256dh:       pushSubscriptionsTable.p256dh,
          auth:         pushSubscriptionsTable.auth,
          cancelToken:  pushSubscriptionsTable.cancelToken,
          clientName:   appointmentsTable.clientName,
          serviceName:  appointmentsTable.serviceName,
          barberName:   appointmentsTable.barberName,
          shopName:     settingsTable.barbershopName,
        })
        .from(pushSubscriptionsTable)
        .innerJoin(appointmentsTable, eq(pushSubscriptionsTable.cancelToken, appointmentsTable.cancelToken))
        .leftJoin(settingsTable, eq(appointmentsTable.userId, settingsTable.userId))
        .where(eq(pushSubscriptionsTable.notify15Sent, false));

      for (const row of rows) {
        const apptTime = new Date(row.scheduledAt).getTime();
        if (apptTime < windowStart.getTime() || apptTime > windowEnd.getTime()) continue;

        const apptHH = new Date(row.scheduledAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        });

        const shopLabel   = row.shopName ?? "AgendaPlay";
        const barberPart  = row.barberName ? ` com ${row.barberName}` : "";
        const title       = `⏰ ${shopLabel} — em 15 minutos!`;
        const body        = `${row.clientName} · ${row.serviceName}${barberPart} · ${apptHH}`;

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
