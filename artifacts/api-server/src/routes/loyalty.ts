import { Router, type IRouter, type Request } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, settingsTable, loyaltyPointsTable, clientsTable, type LoyaltyConfig } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

function resolveShop(req: Request): string | null {
  if (req.session?.userId) return req.session.userId;
  const shopId = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
  return shopId || null;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

router.get("/loyalty/clients", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  // Buscar clientes da loja para lookup de nome
  const clients = await db
    .select({ phone: clientsTable.phone, name: clientsTable.name })
    .from(clientsTable)
    .where(eq(clientsTable.userId, userId));

  const clientNameMap = new Map(clients.map((c) => [c.phone, c.name]));

  const rows = await db
    .select({ clientPhone: loyaltyPointsTable.clientPhone, points: loyaltyPointsTable.points })
    .from(loyaltyPointsTable)
    .where(eq(loyaltyPointsTable.userId, userId))
    .orderBy(desc(loyaltyPointsTable.points));

  const result = rows.map((r) => ({
    clientPhone: r.clientPhone,
    clientName: clientNameMap.get(r.clientPhone) ?? r.clientPhone,
    points: r.points,
  }));

  res.json(result);
});

router.get("/loyalty/balance", async (req, res): Promise<void> => {
  const shopId = resolveShop(req);
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
    return;
  }
  const rawPhone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
  if (!rawPhone) {
    res.status(400).json({ error: "phone obrigatório" });
    return;
  }
  const phone = normalizePhone(rawPhone);

  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.userId, shopId)).limit(1);
  const loyaltyConfig = (settings?.loyaltyConfig ?? null) as LoyaltyConfig | null;

  if (!loyaltyConfig?.enabled) {
    res.json({ enabled: false, points: 0, pointsPerReal: 0, pointsPerRedemptionUnit: 0, discountPerUnit: 1 });
    return;
  }

  const [row] = await db
    .select()
    .from(loyaltyPointsTable)
    .where(and(eq(loyaltyPointsTable.userId, shopId), eq(loyaltyPointsTable.clientPhone, phone)))
    .limit(1);

  res.json({
    enabled: true,
    points: row?.points ?? 0,
    pointsPerReal: loyaltyConfig.pointsPerReal,
    pointsPerRedemptionUnit: loyaltyConfig.pointsPerRedemptionUnit,
    discountPerUnit: 1,
  });
});

export default router;
