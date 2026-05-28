import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, servicesTable, barberServicesTable } from "@workspace/db";
import {
  CreateServiceBody,
  GetServiceParams,
  UpdateServiceParams,
  UpdateServiceBody,
  DeleteServiceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type ServiceRow = typeof servicesTable.$inferSelect;

async function withBarberIds(rows: ServiceRow[]) {
  if (rows.length === 0) return [];
  const links = await db
    .select()
    .from(barberServicesTable)
    .where(inArray(barberServicesTable.serviceId, rows.map((s) => s.id)));
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

router.get("/services", async (_req, res): Promise<void> => {
  const services = await db.select().from(servicesTable).orderBy(servicesTable.name);
  res.json(await withBarberIds(services));
});

router.post("/services", async (req, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { barberIds, ...rest } = parsed.data;
  const service = await db.transaction(async (tx) => {
    const [s] = await tx.insert(servicesTable).values({
      ...rest,
      price: String(rest.price),
    }).returning();
    if (barberIds && barberIds.length > 0) {
      await tx.insert(barberServicesTable).values(
        barberIds.map((bid) => ({ barberId: bid, serviceId: s.id })),
      );
    }
    return s;
  });
  const [enriched] = await withBarberIds([service]);
  res.status(201).json(enriched);
});

router.get("/services/:id", async (req, res): Promise<void> => {
  const params = GetServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.id));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const [enriched] = await withBarberIds([service]);
  res.json(enriched);
});

router.patch("/services/:id", async (req, res): Promise<void> => {
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
  const { barberIds, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (rest.price !== undefined) {
    updateData.price = String(rest.price);
  }
  const service = await db.transaction(async (tx) => {
    const [s] = Object.keys(updateData).length
      ? await tx.update(servicesTable).set(updateData).where(eq(servicesTable.id, params.data.id)).returning()
      : await tx.select().from(servicesTable).where(eq(servicesTable.id, params.data.id));
    if (!s) return null;
    if (barberIds !== undefined) {
      await tx.delete(barberServicesTable).where(eq(barberServicesTable.serviceId, s.id));
      if (barberIds.length > 0) {
        await tx.insert(barberServicesTable).values(
          barberIds.map((bid) => ({ barberId: bid, serviceId: s.id })),
        );
      }
    }
    return s;
  });
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const [enriched] = await withBarberIds([service]);
  res.json(enriched);
});

router.delete("/services/:id", async (req, res): Promise<void> => {
  const params = DeleteServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const service = await db.transaction(async (tx) => {
    await tx.delete(barberServicesTable).where(eq(barberServicesTable.serviceId, params.data.id));
    const [s] = await tx.delete(servicesTable).where(eq(servicesTable.id, params.data.id)).returning();
    return s;
  });
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
