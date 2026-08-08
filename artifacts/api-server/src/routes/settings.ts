import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable, usersTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireActiveAuth } from "../middleware/accountActive.js";

const router: IRouter = Router();

type ReengagementConfigInput = {
  enabled?: boolean;
  inactiveDays?: number;
  message?: string;
} | null | undefined;

type NormalizedReengagementConfig = {
  enabled: boolean;
  inactiveDays: 15 | 30;
  message: string;
};

function normalizeLoyaltyConfig(config: typeof settingsTable.$inferSelect["loyaltyConfig"]) {
  if (!config) return config;
  return {
    ...config,
    expirationDays: config.expirationDays ?? 0,
    expirationWarningDays: config.expirationWarningDays ?? 7,
  };
}

function normalizeClientReengagementConfig(config: ReengagementConfigInput): NormalizedReengagementConfig {
  return {
    enabled: config?.enabled ?? false,
    inactiveDays: config?.inactiveDays === 15 ? 15 : 30,
    message:
      config?.message?.trim() ||
      "Olá {{nome}}, estamos sentindo sua falta! Já faz {{dias}} dias que você agendou um horário. Agende novamente com a {{barbearia}}.",
  };
}

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
    loyaltyConfig: normalizeLoyaltyConfig(settings.loyaltyConfig),
    clientReengagementConfig: normalizeClientReengagementConfig(settings.clientReengagementConfig),
    barbershopName: user?.barbershopName ?? settings.barbershopName,
    ownerName: user?.ownerName ?? settings.ownerName,
    phone: user?.phone ?? settings.phone,
  });
});

router.patch("/settings", requireActiveAuth, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ error: parsed.error.message, body: req.body }, "settings validation failed");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  req.log.info({ pixKey: parsed.data.pixKey, paymentEnableNow: parsed.data.paymentEnableNow, showServicePrices: parsed.data.showServicePrices }, "PATCH settings parsed");
  const userId = req.session.userId!;
  await getOrCreateSettings(userId);
  const { barbershopName: _barbershopName, ownerName: _ownerName, phone: _phone, ...mutableData } = parsed.data;
  const updateData = {
    ...mutableData,
    loyaltyConfig: parsed.data.loyaltyConfig
      ? {
          ...parsed.data.loyaltyConfig,
          expirationDays: parsed.data.loyaltyConfig.expirationDays ?? 0,
          expirationWarningDays: parsed.data.loyaltyConfig.expirationWarningDays ?? 7,
        }
      : parsed.data.loyaltyConfig,
    clientReengagementConfig: parsed.data.clientReengagementConfig
      ? normalizeClientReengagementConfig(parsed.data.clientReengagementConfig)
      : parsed.data.clientReengagementConfig,
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
  res.json({
    ...updated,
    loyaltyConfig: normalizeLoyaltyConfig(updated.loyaltyConfig),
    clientReengagementConfig: normalizeClientReengagementConfig(updated.clientReengagementConfig),
  });
});

export default router;
