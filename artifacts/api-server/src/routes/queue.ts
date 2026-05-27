import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, queueTable } from "@workspace/db";
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
  // Get next position
  const [maxResult] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${queueTable.position}), 0)` })
    .from(queueTable)
    .where(sql`${queueTable.status} != 'completed'`);
  const nextPosition = (maxResult?.maxPos ?? 0) + 1;

  const [entry] = await db.insert(queueTable).values({
    ...parsed.data,
    servicePrice: String(parsed.data.servicePrice),
    position: nextPosition,
    status: "waiting",
  }).returning();
  res.status(201).json(formatEntry(entry));
});

router.delete("/queue/:id", async (req, res): Promise<void> => {
  const params = RemoveFromQueueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db.delete(queueTable).where(eq(queueTable.id, params.data.id)).returning();
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
  // Mark all other in_progress entries as completed first
  await db
    .update(queueTable)
    .set({ status: "completed" })
    .where(sql`${queueTable.status} = 'in_progress'`);

  const [entry] = await db
    .update(queueTable)
    .set({ status: "in_progress" })
    .where(eq(queueTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Queue entry not found" });
    return;
  }
  res.json(formatEntry(entry));
});

export default router;
