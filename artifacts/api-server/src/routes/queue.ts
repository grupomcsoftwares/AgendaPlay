import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, queueTable, appointmentsTable } from "@workspace/db";
import {
  AddToQueueBody,
  RemoveFromQueueParams,
  StartQueueEntryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ── SSE: real-time queue updates per user ───────────────────────────────────
const sseClients = new Map<string, Set<Response>>();

export function broadcastQueueUpdate(userId: string): void {
  const clients = sseClients.get(userId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify({ type: "queue_updated" })}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

function addSseClient(userId: string, res: Response): void {
  let set = sseClients.get(userId);
  if (!set) {
    set = new Set();
    sseClients.set(userId, set);
  }
  set.add(res);
}

function removeSseClient(userId: string, res: Response): void {
  const set = sseClients.get(userId);
  if (set) {
    set.delete(res);
    if (set.size === 0) sseClients.delete(userId);
  }
}

router.get("/queue/subscribe", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  addSseClient(userId, res);

  const heartbeat = setInterval(() => {
    res.write(`:ping\n\n`);
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(userId, res);
  });
});

function formatEntry(
  e: typeof queueTable.$inferSelect,
  scheduledAt: Date | null = null,
) {
  return {
    ...e,
    servicePrice: parseFloat(e.servicePrice),
    startedAt: e.startedAt ? e.startedAt.toISOString() : null,
    scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function autoAdvanceInTx(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742002")})`);

  const now = new Date();

  const inProgressRows = await tx
    .select({
      id: queueTable.id,
      startedAt: queueTable.startedAt,
      serviceDuration: queueTable.serviceDuration,
      appointmentId: queueTable.appointmentId,
      scheduledAt: appointmentsTable.scheduledAt,
    })
    .from(queueTable)
    .leftJoin(appointmentsTable, eq(queueTable.appointmentId, appointmentsTable.id))
    .where(and(eq(queueTable.userId, userId), eq(queueTable.status, "in_progress")));

  for (const row of inProgressRows) {
    // Use startedAt as anchor — the service ends after its duration from when it
    // actually started, not from when it was originally scheduled.
    const anchor = row.startedAt;
    if (!anchor) continue;
    const endMs = anchor.getTime() + row.serviceDuration * 60_000;
    if (endMs > now.getTime()) continue;
    await tx
      .update(queueTable)
      .set({ status: "completed" })
      .where(eq(queueTable.id, row.id));
    if (row.appointmentId !== null) {
      await tx
        .update(appointmentsTable)
        .set({ status: "completed" })
        .where(eq(appointmentsTable.id, row.appointmentId));
    }
  }

  const stillInProgress = await tx
    .select({ id: queueTable.id })
    .from(queueTable)
    .where(and(eq(queueTable.userId, userId), eq(queueTable.status, "in_progress")))
    .limit(1);
  if (stillInProgress.length > 0) return;

  const candidates = await tx
    .select({
      id: queueTable.id,
      position: queueTable.position,
      appointmentId: queueTable.appointmentId,
      scheduledAt: appointmentsTable.scheduledAt,
    })
    .from(queueTable)
    .leftJoin(appointmentsTable, eq(queueTable.appointmentId, appointmentsTable.id))
    .where(and(eq(queueTable.userId, userId), sql`${queueTable.status} = 'waiting'`))
    // Same ordering as GET /queue: by scheduled time, walk-ins last by position
    .orderBy(sql`${appointmentsTable.scheduledAt} ASC NULLS LAST`, queueTable.position);

  const next = candidates.find(
    (c) => c.appointmentId === null || (c.scheduledAt !== null && c.scheduledAt <= now),
  );
  if (!next) return;

  await tx
    .update(queueTable)
    .set({ status: "in_progress", startedAt: new Date() })
    .where(eq(queueTable.id, next.id));
  if (next.appointmentId !== null) {
    await tx
      .update(appointmentsTable)
      .set({ status: "in_progress" })
      .where(eq(appointmentsTable.id, next.appointmentId));
  }
}

router.get("/queue", async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  // Reading the queue must never change its state. In particular, opening the
  // TV must not start the next client or reset a startedAt timestamp.
  const rows = await db
    .select({ queue: queueTable, scheduledAt: appointmentsTable.scheduledAt })
    .from(queueTable)
    .leftJoin(appointmentsTable, eq(queueTable.appointmentId, appointmentsTable.id))
    .where(and(eq(queueTable.userId, userId), sql`${queueTable.status} != 'completed'`))
    .orderBy(sql`${appointmentsTable.scheduledAt} ASC NULLS LAST`, queueTable.position);
  res.json(rows.map((r) => formatEntry(r.queue, r.scheduledAt)));
});

router.post("/queue", async (req, res): Promise<void> => {
  const parsed = AddToQueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const entry = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742001")})`);
    const [maxResult] = await tx
      .select({ maxPos: sql<number>`COALESCE(MAX(${queueTable.position}), 0)` })
      .from(queueTable)
      .where(and(eq(queueTable.userId, userId), sql`${queueTable.status} != 'completed'`));
    const nextPosition = (maxResult?.maxPos ?? 0) + 1;
    const [created] = await tx.insert(queueTable).values({
      ...parsed.data,
      userId,
      servicePrice: String(parsed.data.servicePrice),
      position: nextPosition,
      status: "waiting",
    }).returning();
    // Auto-start immediately if the chair is empty (e.g. walk-in with no queue)
    await autoAdvanceInTx(tx, userId);
    return created;
  });
  res.status(201).json(formatEntry(entry));
});

router.delete("/queue/:id", async (req, res): Promise<void> => {
  const params = RemoveFromQueueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const entry = await db.transaction(async (tx) => {
    const [removed] = await tx.delete(queueTable)
      .where(and(eq(queueTable.id, params.data.id), eq(queueTable.userId, userId)))
      .returning();
    if (!removed) return null;
    if (removed.appointmentId) {
      await tx
        .update(appointmentsTable)
        .set({ status: "completed" })
        .where(eq(appointmentsTable.id, removed.appointmentId));
    }
    await autoAdvanceInTx(tx, userId);
    return removed;
  });
  if (!entry) {
    res.status(404).json({ error: "Queue entry not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/queue/:id/start", async (req, res): Promise<void> => {
  const params = StartQueueEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const entry = await db.transaction(async (tx) => {
    // Serialize starts and only allow an entry that is still waiting to start.
    // A stale TV/panel request must not restart an in-progress or completed row.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742002")})`);

    const [candidate] = await tx
      .select({ id: queueTable.id })
      .from(queueTable)
      .where(and(
        eq(queueTable.id, params.data.id),
        eq(queueTable.userId, userId),
        eq(queueTable.status, "waiting"),
      ))
      .limit(1);
    if (!candidate) return null;

    const previouslyActive = await tx
      .update(queueTable)
      .set({ status: "completed" })
      .where(and(eq(queueTable.userId, userId), sql`${queueTable.status} = 'in_progress'`))
      .returning({ appointmentId: queueTable.appointmentId });
    const linkedIds = previouslyActive
      .map((r) => r.appointmentId)
      .filter((v): v is number => v != null);
    if (linkedIds.length > 0) {
      await tx
        .update(appointmentsTable)
        .set({ status: "completed" })
        .where(sql`${appointmentsTable.id} IN (${sql.join(linkedIds, sql`, `)})`);
    }

    const [started] = await tx
      .update(queueTable)
      .set({ status: "in_progress", startedAt: new Date() })
      .where(and(
        eq(queueTable.id, params.data.id),
        eq(queueTable.userId, userId),
        eq(queueTable.status, "waiting"),
      ))
      .returning();
    if (!started) return null;

    if (started.appointmentId) {
      await tx
        .update(appointmentsTable)
        .set({ status: "in_progress" })
        .where(eq(appointmentsTable.id, started.appointmentId));
    }
    return started;
  });
  if (!entry) {
    res.status(404).json({ error: "Queue entry not found" });
    return;
  }
  res.json(formatEntry(entry));
});

export default router;
