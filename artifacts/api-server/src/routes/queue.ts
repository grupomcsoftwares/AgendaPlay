import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, queueTable, appointmentsTable } from "@workspace/db";
import {
  AddToQueueBody,
  RemoveFromQueueParams,
  StartQueueEntryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

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

// Auto-advance: if the chair is empty, promote the next eligible waiting entry.
// Walk-ins (no appointmentId) are always eligible. Booked entries become eligible
// once their scheduledAt has arrived. Runs inside a tx with an advisory lock so
// concurrent polls cannot promote two entries.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function autoAdvanceInTx(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742002")})`);

  const now = new Date();

  // Auto-complete any in-progress entry whose scheduled window has ended.
  // For booked entries we use scheduledAt + serviceDuration (the planned end).
  // For walk-ins we use startedAt + serviceDuration (so a forgotten chair
  // doesn't block the queue forever).
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
    .where(eq(queueTable.status, "in_progress"));

  for (const row of inProgressRows) {
    const anchor = row.scheduledAt ?? row.startedAt;
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
    .where(eq(queueTable.status, "in_progress"))
    .limit(1);
  if (stillInProgress.length > 0) return;

  // Walk-ins first (any waiting entry with no appointment), else booked entries
  // whose scheduled time has arrived — within each group, lowest position wins.
  const candidates = await tx
    .select({
      id: queueTable.id,
      position: queueTable.position,
      appointmentId: queueTable.appointmentId,
      scheduledAt: appointmentsTable.scheduledAt,
    })
    .from(queueTable)
    .leftJoin(appointmentsTable, eq(queueTable.appointmentId, appointmentsTable.id))
    .where(sql`${queueTable.status} = 'waiting'`)
    .orderBy(queueTable.position);

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

router.get("/queue", async (_req, res): Promise<void> => {
  await db.transaction(async (tx) => {
    await autoAdvanceInTx(tx);
  });
  const rows = await db
    .select({ queue: queueTable, scheduledAt: appointmentsTable.scheduledAt })
    .from(queueTable)
    .leftJoin(appointmentsTable, eq(queueTable.appointmentId, appointmentsTable.id))
    .where(sql`${queueTable.status} != 'completed'`)
    .orderBy(queueTable.position);
  res.json(rows.map((r) => formatEntry(r.queue, r.scheduledAt)));
});

router.post("/queue", async (req, res): Promise<void> => {
  const parsed = AddToQueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const entry = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw("742001")})`);
    const [maxResult] = await tx
      .select({ maxPos: sql<number>`COALESCE(MAX(${queueTable.position}), 0)` })
      .from(queueTable)
      .where(sql`${queueTable.status} != 'completed'`);
    const nextPosition = (maxResult?.maxPos ?? 0) + 1;
    const [created] = await tx.insert(queueTable).values({
      ...parsed.data,
      servicePrice: String(parsed.data.servicePrice),
      position: nextPosition,
      status: "waiting",
    }).returning();
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
  const entry = await db.transaction(async (tx) => {
    const [removed] = await tx.delete(queueTable).where(eq(queueTable.id, params.data.id)).returning();
    if (!removed) return null;
    if (removed.appointmentId) {
      await tx
        .update(appointmentsTable)
        .set({ status: "completed" })
        .where(eq(appointmentsTable.id, removed.appointmentId));
    }
    // Promote next eligible entry into the empty chair right away.
    await autoAdvanceInTx(tx);
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
  const entry = await db.transaction(async (tx) => {
    // Complete all currently in-progress queue entries (and their linked appointments).
    const previouslyActive = await tx
      .update(queueTable)
      .set({ status: "completed" })
      .where(sql`${queueTable.status} = 'in_progress'`)
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
      .where(eq(queueTable.id, params.data.id))
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
