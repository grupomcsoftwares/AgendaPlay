import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
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
      const windowEnd = new Date(now.getTime() + 16 * 60 * 1000);
      const subs = await db
        .select()
        .from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.notify15Sent, false));
      for (const sub of subs) {
        const apptTime = new Date(sub.scheduledAt).getTime();
        if (apptTime >= windowStart.getTime() && apptTime <= windowEnd.getTime()) {
          const apptHH = new Date(sub.scheduledAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({
                title: "⏰ Seu horário é em 15 minutos!",
                body: `Seu agendamento está confirmado para as ${apptHH}. Fique pronto!`,
                tag: `appt-${sub.cancelToken}`,
                url: `/agendamento/${sub.cancelToken}`,
              }),
            );
            await db
              .update(pushSubscriptionsTable)
              .set({ notify15Sent: true })
              .where(eq(pushSubscriptionsTable.id, sub.id));
          } catch {
            // subscription expired or invalid — remove it
            await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id));
          }
        }
      }
    } catch { /* ignore scheduler errors */ }
  }, 60_000);
}

export default router;
