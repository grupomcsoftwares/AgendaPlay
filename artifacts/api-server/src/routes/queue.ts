import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, queueTable, appointmentsTable } from "@workspace/db";
import {
  AddToQueueBody,
  RemoveFromQueueParams,
  StartQueueEntryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatEntry(e: typeof queueTable.$inferSelect) {
  return {
    ...e,
    servicePrice: parseFloat(e.servicePrice),
    createdAt: e.createdAt.toISOString(),
  };
}

router.get("/queue", async (_req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(queueTable)
    .where(sql`${queueTable.status} != 'completed'`)
    .orderBy(queueTable.position);
  res.json(entries.map(formatEntry));
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
      .set({ status: "in_progress" })
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
