import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, queueTable, appointmentsTable, barbersTable } from "@workspace/db";
import {
  AddToQueueBody,
  RemoveFromQueueParams,
  StartQueueEntryParams,
  StartQueueEntryBody,
} from "@workspace/api-zod";
import { requireActiveAuth } from "../middleware/accountActive.js";

const router: IRouter = Router();

// ── SSE: real-time queue updates per user ───────────────────────────────────
const sseClients = new Map<string, Set<Response>>();

export function broadcastQueueUpdate(userId: string): void {
  const clients = sseClients.get(userId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify({ type: "queue_updated" })}\n\n`;
  for (const res of clients) {
    if (res.writableEnded || res.destroyed) {
      removeSseClient(userId, res);
      continue;
    }
    try {
      res.write(payload);
    } catch {
      removeSseClient(userId, res);
    }
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

router.get("/queue/subscribe", requireActiveAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

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
  barberId: number | null = e.barberId,
  barberName: string | null = null,
) {
  return {
    ...e,
    barberId,
    barberName,
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

  const active = await tx
    .select({ barberId: queueTable.barberId })
    .from(queueTable)
    .where(and(eq(queueTable.userId, userId), eq(queueTable.status, "in_progress")))
  const activeBarberIds = new Set(active.flatMap((row) => row.barberId == null ? [] : [row.barberId]));
  const availableBarbers = await tx
    .select({ id: barbersTable.id })
    .from(barbersTable)
    .where(and(eq(barbersTable.userId, userId), eq(barbersTable.active, true)));
  const available = availableBarbers.filter((barber) => !activeBarberIds.has(barber.id));
  if (available.length === 0) return;

  const candidates = await tx
    .select({
      queue: queueTable,
      scheduledAt: appointmentsTable.scheduledAt,
      appointmentBarberId: appointmentsTable.barberId,
    })
    .from(queueTable)
    .leftJoin(appointmentsTable, eq(queueTable.appointmentId, appointmentsTable.id))
    .where(and(eq(queueTable.userId, userId), sql`${queueTable.status} = 'waiting'`))
    // Same ordering as GET /queue: by scheduled time, walk-ins last by position
    .orderBy(sql`${appointmentsTable.scheduledAt} ASC NULLS LAST`, queueTable.position);

  const remainingCandidates = [...candidates];
  for (const barber of available) {
    const nextIndex = remainingCandidates.findIndex((c) => {
      const isWalkIn = c.queue.appointmentId === null;
      const assignedBarberId = c.queue.barberId ?? c.appointmentBarberId;
      const barberMatches = isWalkIn || assignedBarberId === barber.id;
      const appointmentIsDue = isWalkIn || (c.scheduledAt !== null && c.scheduledAt <= now);
      return barberMatches && appointmentIsDue;
    });
    if (nextIndex < 0) continue;
    const next = remainingCandidates[nextIndex];
    await tx
      .update(queueTable)
      .set({ barberId: barber.id, status: "in_progress", startedAt: new Date() })
      .where(and(eq(queueTable.id, next.queue.id), eq(queueTable.status, "waiting")));
    remainingCandidates.splice(nextIndex, 1);
    if (next.queue.appointmentId !== null) {
      await tx
        .update(appointmentsTable)
        .set({ status: "in_progress" })
        .where(eq(appointmentsTable.id, next.queue.appointmentId));
    }
  }
}

router.get("/queue", requireActiveAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  // Reading the queue must never change its state. In particular, opening the
  // TV must not start the next client or reset a startedAt timestamp.
  const rows = await db
    .select({
      queue: queueTable,
      scheduledAt: appointmentsTable.scheduledAt,
      appointmentBarberId: appointmentsTable.barberId,
      appointmentBarberName: appointmentsTable.barberName,
      barberName: barbersTable.name,
    })
    .from(queueTable)
    .leftJoin(appointmentsTable, eq(queueTable.appointmentId, appointmentsTable.id))
    .leftJoin(barbersTable, eq(queueTable.barberId, barbersTable.id))
    .where(and(
      eq(queueTable.userId, userId),
      sql`${queueTable.status} != 'completed'`,
      // Do not show stale appointment rows after the appointment was
      // completed/cancelled, even if an older queue row was left behind.
      sql`(${queueTable.appointmentId} IS NULL OR ${appointmentsTable.status} NOT IN ('completed', 'cancelled', 'no_show'))`,
    ))
    .orderBy(sql`${appointmentsTable.scheduledAt} ASC NULLS LAST`, queueTable.position);
  res.json(rows.map((r) => formatEntry(
    r.queue,
    r.scheduledAt,
    r.queue.barberId ?? r.appointmentBarberId,
    r.barberName ?? r.appointmentBarberName,
  )));
});

router.post("/queue", requireActiveAuth, async (req, res): Promise<void> => {
  const parsed = AddToQueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  if (parsed.data.barberId != null) {
    const [barber] = await db.select({ id: barbersTable.id })
      .from(barbersTable)
      .where(and(eq(barbersTable.id, parsed.data.barberId), eq(barbersTable.userId, userId), eq(barbersTable.active, true)))
      .limit(1);
    if (!barber) {
      res.status(400).json({ error: "Barbeiro inválido ou inativo." });
      return;
    }
  }
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
  res.status(201).json(formatEntry(entry, null, entry.barberId, null));
});

router.delete("/queue/:id", requireActiveAuth, async (req, res): Promise<void> => {
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
    if (removed.appointmentId && removed.status === "in_progress") {
      await tx
        .update(appointmentsTable)
        .set({ status: "completed" })
        .where(eq(appointmentsTable.id, removed.appointmentId));
    } else if (removed.appointmentId && removed.status === "waiting") {
      await tx
        .update(appointmentsTable)
        .set({ status: "cancelled" })
        .where(and(
          eq(appointmentsTable.id, removed.appointmentId),
          eq(appointmentsTable.status, "pending"),
        ));
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

router.post("/queue/:id/start", requireActiveAuth, async (req, res): Promise<void> => {
  const params = StartQueueEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const body = StartQueueEntryBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const entry = await db.transaction(async (tx) => {
    // Serialize starts and only allow an entry that is still waiting to start.
    // A stale TV/panel request must not restart an in-progress or completed row.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742002")})`);

    const [candidate] = await tx
      .select({
        id: queueTable.id,
        barberId: queueTable.barberId,
        appointmentId: queueTable.appointmentId,
        appointmentBarberId: appointmentsTable.barberId,
      })
      .from(queueTable)
      .leftJoin(appointmentsTable, eq(queueTable.appointmentId, appointmentsTable.id))
      .where(and(
        eq(queueTable.id, params.data.id),
        eq(queueTable.userId, userId),
        eq(queueTable.status, "waiting"),
      ))
      .limit(1);
    if (!candidate) return null;
    const assignedBarberId = candidate.barberId ?? candidate.appointmentBarberId;
    if (assignedBarberId != null && body.data.barberId != null && body.data.barberId !== assignedBarberId) {
      return null;
    }
    const targetBarberId = body.data.barberId != null
      ? body.data.barberId
      : assignedBarberId;
    if (targetBarberId == null) return null;
    const [barber] = await tx.select({ id: barbersTable.id })
      .from(barbersTable)
      .where(and(eq(barbersTable.id, targetBarberId), eq(barbersTable.userId, userId), eq(barbersTable.active, true)))
      .limit(1);
    if (!barber) return null;
    const [busy] = await tx.select({ id: queueTable.id })
      .from(queueTable)
      .where(and(eq(queueTable.userId, userId), eq(queueTable.barberId, targetBarberId), eq(queueTable.status, "in_progress")))
      .limit(1);
    if (busy) return null;

    const [started] = await tx
      .update(queueTable)
      .set({ barberId: targetBarberId, status: "in_progress", startedAt: new Date() })
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
