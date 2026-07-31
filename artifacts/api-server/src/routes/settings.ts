import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable, usersTable } from "@workspace/db";
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
  const [user] = await db
    .select({
      barbershopName: usersTable.barbershopName,
      ownerName: usersTable.ownerName,
      phone: usersTable.phone,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const [created] = await db.insert(settingsTable).values({
    userId,
    barbershopName: user?.barbershopName ?? "Minha Barbearia",
    ownerName: user?.ownerName ?? "Proprietário",
    phone: user?.phone ?? null,
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
  const [user] = await db
    .select({
      barbershopName: usersTable.barbershopName,
      ownerName: usersTable.ownerName,
      phone: usersTable.phone,
    })
    .from(usersTable)
    .where(eq(usersTable.id, shopId))
    .limit(1);
  res.json({
    ...settings,
    barbershopName: user?.barbershopName ?? settings.barbershopName,
    ownerName: user?.ownerName ?? settings.ownerName,
    phone: user?.phone ?? settings.phone,
  });
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
  const { barbershopName: _barbershopName, ownerName: _ownerName, phone: _phone, ...mutableData } = parsed.data;
  const updateData = {
    ...mutableData,
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
