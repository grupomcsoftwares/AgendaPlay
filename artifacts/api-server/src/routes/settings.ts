import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

function resolveShop(req: Request): string | null {
  if (req.session?.userId) return req.session.userId;
  const shopId = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
  return shopId || null;
}

async function getOrCreateSettings(userId: string) {
  const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(settingsTable).values({
    userId,
    barbershopName: "Minha Barbearia",
    ownerName: "Proprietário",
  }).returning();
  return created;
}

router.get("/settings", async (req, res): Promise<void> => {
  const shopId = resolveShop(req);
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
    return;
  }
  const settings = await getOrCreateSettings(shopId);
  res.json(settings);
});

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ error: parsed.error.message, body: req.body }, "settings validation failed");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  req.log.info({ pixKey: parsed.data.pixKey, paymentEnableNow: parsed.data.paymentEnableNow }, "PATCH settings parsed");
  const userId = req.session.userId!;
  await getOrCreateSettings(userId);
  const updateData = {
    ...parsed.data,
    serviceExclusions: parsed.data.serviceExclusions?.map((item) => ({
      ...item,
      services: [item.services[0], item.services[1]] as [number, number],
    })),
  };
  const [updated] = await db
    .update(settingsTable)
    .set(updateData)
    .where(eq(settingsTable.userId, userId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Settings not found" });
    return;
  }
  res.json(updated);
});

export default router;
