import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, comboDiscountsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

function parseComboInput(body: unknown): { name: string; serviceIds: number[]; discountPercent: number; discountType: "percent" | "value" } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.serviceIds) || b.serviceIds.length < 2) return null;
  const serviceIds = b.serviceIds.filter((x) => typeof x === "number" && Number.isInteger(x)) as number[];
  if (serviceIds.length < 2) return null;
  const discountPercent = typeof b.discountPercent === "number" ? b.discountPercent : parseFloat(String(b.discountPercent ?? "0"));
  if (Number.isNaN(discountPercent) || discountPercent < 0) return null;
  const discountType = b.discountType === "value" ? "value" : "percent";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  return { name, serviceIds, discountPercent, discountType };
}

function parseId(params: unknown): number | null {
  if (!params || typeof params !== "object") return null;
  const p = params as Record<string, unknown>;
  const id = parseInt(String(p.id ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function formatCombo(c: typeof comboDiscountsTable.$inferSelect) {
  return {
    ...c,
    discountPercent: parseFloat(c.discountPercent),
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/combo-discounts", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const rows = await db
    .select()
    .from(comboDiscountsTable)
    .where(eq(comboDiscountsTable.userId, userId));
  res.json(rows.map(formatCombo));
});

router.post("/combo-discounts", requireAuth, async (req, res): Promise<void> => {
  const input = parseComboInput(req.body);
  if (!input) {
    res.status(400).json({ error: "name, serviceIds (mínimo 2) e discountPercent são obrigatórios" });
    return;
  }
  const userId = req.session.userId!;
  const [created] = await db.insert(comboDiscountsTable).values({
    userId,
    name: input.name,
    serviceIds: input.serviceIds,
    discountPercent: String(input.discountPercent),
    discountType: input.discountType,
  }).returning();
  res.status(201).json(formatCombo(created));
});

router.patch("/combo-discounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const input = parseComboInput(req.body);
  if (!input) {
    res.status(400).json({ error: "name, serviceIds (mínimo 2) e discountPercent são obrigatórios" });
    return;
  }
  const userId = req.session.userId!;
  const [updated] = await db
    .update(comboDiscountsTable)
    .set({
      name: input.name,
      serviceIds: input.serviceIds,
      discountPercent: String(input.discountPercent),
      discountType: input.discountType,
    })
    .where(and(eq(comboDiscountsTable.id, id), eq(comboDiscountsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Combo não encontrado" });
    return;
  }
  res.json(formatCombo(updated));
});

router.delete("/combo-discounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const userId = req.session.userId!;
  const [deleted] = await db
    .delete(comboDiscountsTable)
    .where(and(eq(comboDiscountsTable.id, id), eq(comboDiscountsTable.userId, userId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Combo não encontrado" });
    return;
  }
  res.status(204).send();
});

export default router;
