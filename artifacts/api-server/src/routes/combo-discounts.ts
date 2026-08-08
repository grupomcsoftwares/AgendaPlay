import { Router, type IRouter, type Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, comboDiscountsTable } from "@workspace/db";
import { requireActiveAuth } from "../middleware/accountActive.js";

function resolveShop(req: Request): string | null {
  if (req.session?.userId) return req.session.userId;
  const shopId = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
  return shopId || null;
}

const router: IRouter = Router();

function parseComboInput(body: unknown): { name: string; serviceIds: number[]; discountPercent: number; discountType: "percent" | "value"; timeDiscountMinutes: number; enabled: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.serviceIds) || b.serviceIds.length < 2) return null;
  const serviceIds = b.serviceIds.filter((x) => typeof x === "number" && Number.isInteger(x)) as number[];
  if (serviceIds.length < 2) return null;
  const discountPercent = typeof b.discountPercent === "number" ? b.discountPercent : parseFloat(String(b.discountPercent ?? "0"));
  if (Number.isNaN(discountPercent) || discountPercent < 0) return null;
  const discountType = b.discountType === "value" ? "value" : "percent";
  const timeDiscountMinutes = typeof b.timeDiscountMinutes === "number" ? b.timeDiscountMinutes : parseInt(String(b.timeDiscountMinutes ?? "0"), 10);
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const enabled = b.enabled === false ? false : true;
  return { name, serviceIds, discountPercent, discountType, timeDiscountMinutes: Number.isNaN(timeDiscountMinutes) ? 0 : Math.max(0, timeDiscountMinutes), enabled };
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

router.get("/combo-discounts", async (req, res): Promise<void> => {
  // Supports public access via ?shopId= (for the public booking page)
  // and authenticated access for the admin panel.
  const shopId = resolveShop(req);
  if (!shopId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(comboDiscountsTable)
    .where(eq(comboDiscountsTable.userId, shopId));
  res.json(rows.map(formatCombo));
});

router.post("/combo-discounts", requireActiveAuth, async (req, res): Promise<void> => {
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
    timeDiscountMinutes: input.timeDiscountMinutes,
    enabled: input.enabled,
  }).returning();
  res.status(201).json(formatCombo(created));
});

router.patch("/combo-discounts/:id", requireActiveAuth, async (req, res): Promise<void> => {
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
      timeDiscountMinutes: input.timeDiscountMinutes,
      enabled: input.enabled,
    })
    .where(and(eq(comboDiscountsTable.id, id), eq(comboDiscountsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Combo não encontrado" });
    return;
  }
  res.json(formatCombo(updated));
});

router.delete("/combo-discounts/:id", requireActiveAuth, async (req, res): Promise<void> => {
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
