import { Router, type IRouter, type Request } from "express";
import { eq, and, desc, gt, lt, sql } from "drizzle-orm";
import { db, settingsTable, loyaltyPointsTable, clientsTable, type LoyaltyConfig } from "@workspace/db";
import { requireActiveAuth } from "../middleware/accountActive.js";

const router: IRouter = Router();

function resolveShop(req: Request): string | null {
  if (req.session?.userId) return req.session.userId;
  const shopId = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
  return shopId || null;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

router.get("/loyalty/clients", requireActiveAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [settings] = await db
    .select({ loyaltyConfig: settingsTable.loyaltyConfig })
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId))
    .limit(1);
  const loyaltyConfig = (settings?.loyaltyConfig ?? null) as LoyaltyConfig | null;
  const expirationDays = loyaltyConfig?.expirationDays ?? 0;

  if (expirationDays > 0) {
    await db
      .update(loyaltyPointsTable)
      .set({ points: 0, updatedAt: new Date() })
      .where(and(
        eq(loyaltyPointsTable.userId, userId),
        gt(loyaltyPointsTable.points, 0),
        lt(loyaltyPointsTable.updatedAt, sql`NOW() - (${expirationDays} * INTERVAL '1 day')`),
      ));
  }

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
    res.json({
      enabled: false,
      points: 0,
      pointsPerReal: 0,
      pointsPerRedemptionUnit: 0,
      expirationDays: 0,
      expirationWarningDays: 7,
      daysUntilExpiration: null,
      discountPerUnit: 1,
    });
    return;
  }

  const expirationDays = loyaltyConfig.expirationDays ?? 0;
  const expirationWarningDays = loyaltyConfig.expirationWarningDays ?? 7;
  if (expirationDays > 0) {
    await db
      .update(loyaltyPointsTable)
      .set({ points: 0, updatedAt: new Date() })
      .where(and(
        eq(loyaltyPointsTable.userId, shopId),
        eq(loyaltyPointsTable.clientPhone, phone),
        gt(loyaltyPointsTable.points, 0),
        lt(loyaltyPointsTable.updatedAt, sql`NOW() - (${expirationDays} * INTERVAL '1 day')`),
      ));
  }

  const [row] = await db
    .select()
    .from(loyaltyPointsTable)
    .where(and(eq(loyaltyPointsTable.userId, shopId), eq(loyaltyPointsTable.clientPhone, phone)))
    .limit(1);

  const daysUntilExpiration = row && row.points > 0 && expirationDays > 0
    ? Math.max(0, Math.ceil(
        (new Date(row.updatedAt).getTime() + expirationDays * 24 * 60 * 60 * 1000 - Date.now()) /
          (24 * 60 * 60 * 1000),
      ))
    : null;

  res.json({
    enabled: true,
    points: row?.points ?? 0,
    pointsPerReal: loyaltyConfig.pointsPerReal,
    pointsPerRedemptionUnit: loyaltyConfig.pointsPerRedemptionUnit,
    expirationDays,
    expirationWarningDays,
    daysUntilExpiration,
    discountPerUnit: 1,
  });
});

export default router;
