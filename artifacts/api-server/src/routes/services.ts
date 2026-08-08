import { Router, type IRouter, type Request } from "express";
import { eq, inArray, and } from "drizzle-orm";
import { db, servicesTable, barberServicesTable, serviceDayPricingTable, barbersTable } from "@workspace/db";
import { requireActiveAuth } from "../middleware/accountActive.js";
import {
  CreateServiceBody,
  GetServiceParams,
  UpdateServiceParams,
  UpdateServiceBody,
  DeleteServiceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type ServiceRow = typeof servicesTable.$inferSelect;

function resolveShop(req: Request): string | null {
  if (req.session?.userId) return req.session.userId;
  const shopId = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
  return shopId || null;
}

async function withBarberIds(rows: ServiceRow[]) {
  if (rows.length === 0) return [];
  const links = await db
    .select({ serviceId: barberServicesTable.serviceId, barberId: barberServicesTable.barberId })
    .from(barberServicesTable)
    .innerJoin(barbersTable, eq(barberServicesTable.barberId, barbersTable.id))
    .where(and(
      inArray(barberServicesTable.serviceId, rows.map((s) => s.id)),
      eq(barbersTable.userId, rows[0]!.userId),
    ));
  const byService = new Map<number, number[]>();
  for (const l of links) {
    const arr = byService.get(l.serviceId) ?? [];
    arr.push(l.barberId);
    byService.set(l.serviceId, arr);
  }
  return rows.map((s) => ({
    ...s,
    price: parseFloat(s.price),
    barberIds: byService.get(s.id) ?? [],
  }));
}

async function hasOnlyOwnedBarbers(
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  barberIds: number[],
): Promise<boolean> {
  const uniqueIds = [...new Set(barberIds)];
  if (uniqueIds.length !== barberIds.length) return false;
  if (uniqueIds.length === 0) return true;
  const owned = await tx
    .select({ id: barbersTable.id })
    .from(barbersTable)
    .where(and(eq(barbersTable.userId, userId), inArray(barbersTable.id, uniqueIds)));
  return owned.length === uniqueIds.length;
}

async function withDayPricing(rows: ServiceRow[]) {
  if (rows.length === 0) return [];
  const pricing = await db
    .select()
    .from(serviceDayPricingTable)
    .where(inArray(serviceDayPricingTable.serviceId, rows.map((s) => s.id)));
  const byService = new Map<number, Array<{ dayOfWeek: number; price: number }>>();
  for (const p of pricing) {
    const arr = byService.get(p.serviceId) ?? [];
    arr.push({ dayOfWeek: p.dayOfWeek, price: parseFloat(p.price) });
    byService.set(p.serviceId, arr);
  }
  return rows.map((s) => ({
    ...s,
    price: parseFloat(s.price),
    dayPricing: byService.get(s.id) ?? [],
  }));
}

export async function resolveServicePrice(serviceId: number, userId: string, date: Date): Promise<number | null> {
  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.userId, userId)));
  if (!service) return null;

  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ...
  const [dayPrice] = await db
    .select()
    .from(serviceDayPricingTable)
    .where(and(
      eq(serviceDayPricingTable.serviceId, serviceId),
      eq(serviceDayPricingTable.dayOfWeek, dayOfWeek),
    ))
    .limit(1);

  if (dayPrice) return parseFloat(dayPrice.price);
  return parseFloat(service.price);
}

router.get("/services", async (req, res): Promise<void> => {
  const shopId = resolveShop(req);
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
    return;
  }
  const services = await db.select().from(servicesTable)
    .where(eq(servicesTable.userId, shopId))
    .orderBy(servicesTable.sortOrder);
  const withBarbers = await withBarberIds(services);
  res.json(await withDayPricing(withBarbers as unknown as ServiceRow[]));
});

router.post("/services", requireActiveAuth, async (req, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const { barberIds, dayPricing, ...rest } = parsed.data;
  if (barberIds && !(await hasOnlyOwnedBarbers(db, userId, barberIds))) {
    res.status(400).json({ error: "Um ou mais profissionais não pertencem a esta barbearia." });
    return;
  }
  const service = await db.transaction(async (tx) => {
    const maxOrder = await tx.select({ max: servicesTable.sortOrder })
      .from(servicesTable)
      .where(eq(servicesTable.userId, userId))
      .orderBy(servicesTable.sortOrder)
      .limit(1);
    const nextSort = (maxOrder[0]?.max ?? 0) + 1;
    const [s] = await tx.insert(servicesTable).values({
      ...rest,
      userId,
      price: String(rest.price),
      sortOrder: rest.sortOrder ?? nextSort,
    }).returning();
    if (barberIds && barberIds.length > 0) {
      await tx.insert(barberServicesTable).values(
        barberIds.map((bid) => ({ barberId: bid, serviceId: s.id })),
      );
    }
    if (dayPricing && dayPricing.length > 0) {
      await tx.insert(serviceDayPricingTable).values(
        dayPricing.map((dp) => ({
          serviceId: s.id,
          userId,
          dayOfWeek: dp.dayOfWeek,
          price: String(dp.price),
        })),
      );
    }
    return s;
  });
  const withBarbers = await withBarberIds([service]);
  const [enriched] = await withDayPricing(withBarbers as unknown as ServiceRow[]);
  res.status(201).json(enriched);
});

router.get("/services/:id", async (req, res): Promise<void> => {
  const params = GetServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const shopId = resolveShop(req);
  const conds = shopId
    ? and(eq(servicesTable.id, params.data.id), eq(servicesTable.userId, shopId))
    : eq(servicesTable.id, params.data.id);
  const [service] = await db.select().from(servicesTable).where(conds);
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const withBarbers = await withBarberIds([service]);
  const [enriched] = await withDayPricing(withBarbers as unknown as ServiceRow[]);
  res.json(enriched);
});

router.patch("/services/reorder", requireActiveAuth, async (req, res): Promise<void> => {
  const items = req.body as Array<{ id: number; sortOrder: number }>;
  if (!Array.isArray(items) || items.some((i) => typeof i.id !== "number" || typeof i.sortOrder !== "number")) {
    res.status(400).json({ error: "Invalid reorder payload" });
    return;
  }
  const userId = req.session.userId!;
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(servicesTable)
        .set({ sortOrder: item.sortOrder })
        .where(and(eq(servicesTable.id, item.id), eq(servicesTable.userId, userId)));
    }
  });
  const services = await db.select().from(servicesTable)
    .where(eq(servicesTable.userId, userId))
    .orderBy(servicesTable.sortOrder);
  res.json(await withBarberIds(services));
});

router.patch("/services/:id", requireActiveAuth, async (req, res): Promise<void> => {
  const params = UpdateServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const { barberIds, dayPricing, ...rest } = parsed.data;
  if (barberIds && !(await hasOnlyOwnedBarbers(db, userId, barberIds))) {
    res.status(400).json({ error: "Um ou mais profissionais não pertencem a esta barbearia." });
    return;
  }
  const updateData: Record<string, unknown> = { ...rest };
  if (rest.price !== undefined) {
    updateData.price = String(rest.price);
  }
  const whereCond = and(eq(servicesTable.id, params.data.id), eq(servicesTable.userId, userId));
  const service = await db.transaction(async (tx) => {
    const [s] = Object.keys(updateData).length
      ? await tx.update(servicesTable).set(updateData).where(whereCond).returning()
      : await tx.select().from(servicesTable).where(whereCond);
    if (!s) return null;
    if (barberIds !== undefined) {
      await tx.delete(barberServicesTable).where(eq(barberServicesTable.serviceId, s.id));
      if (barberIds.length > 0) {
        await tx.insert(barberServicesTable).values(
          barberIds.map((bid) => ({ barberId: bid, serviceId: s.id })),
        );
      }
    }
    if (dayPricing !== undefined) {
      await tx.delete(serviceDayPricingTable).where(eq(serviceDayPricingTable.serviceId, s.id));
      if (dayPricing.length > 0) {
        await tx.insert(serviceDayPricingTable).values(
          dayPricing.map((dp) => ({
            serviceId: s.id,
            userId,
            dayOfWeek: dp.dayOfWeek,
            price: String(dp.price),
          })),
        );
      }
    }
    return s;
  });
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const withBarbers = await withBarberIds([service]);
  const [enriched] = await withDayPricing(withBarbers as unknown as ServiceRow[]);
  res.json(enriched);
});

router.delete("/services/:id", requireActiveAuth, async (req, res): Promise<void> => {
  const params = DeleteServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const service = await db.transaction(async (tx) => {
    await tx.delete(barberServicesTable).where(eq(barberServicesTable.serviceId, params.data.id));
    await tx.delete(serviceDayPricingTable).where(eq(serviceDayPricingTable.serviceId, params.data.id));
    const [s] = await tx.delete(servicesTable)
      .where(and(eq(servicesTable.id, params.data.id), eq(servicesTable.userId, userId)))
      .returning();
    return s;
  });
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
