import { Router, type IRouter, type Request } from "express";
import { eq, inArray, asc, and, sql } from "drizzle-orm";
import { db, barbersTable, barberServicesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";
import {
  ListBarbersQueryParams,
  CreateBarberBody,
  GetBarberParams,
  UpdateBarberParams,
  UpdateBarberBody,
  DeleteBarberParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type BarberRow = typeof barbersTable.$inferSelect;

function resolveShop(req: Request): string | null {
  if (req.session?.userId) return req.session.userId;
  const shopId = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
  return shopId || null;
}

async function serviceIdsFor(barberIds: number[]) {
  if (barberIds.length === 0) return new Map<number, number[]>();
  const links = await db
    .select()
    .from(barberServicesTable)
    .where(inArray(barberServicesTable.barberId, barberIds));
  const map = new Map<number, number[]>();
  for (const l of links) {
    const arr = map.get(l.barberId) ?? [];
    arr.push(l.serviceId);
    map.set(l.barberId, arr);
  }
  return map;
}

export async function isBarberAllowedForService(
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  barberId: number,
  serviceId: number | null,
): Promise<{ ok: boolean; reason?: string; barberName?: string }> {
  const [b] = await tx.select().from(barbersTable).where(eq(barbersTable.id, barberId));
  if (!b) return { ok: false, reason: "não encontrado" };
  if (!b.active) return { ok: false, reason: "inativo" };
  if (serviceId === null) return { ok: true, barberName: b.name };
  const links = await tx
    .select()
    .from(barberServicesTable)
    .where(and(eq(barberServicesTable.barberId, barberId), eq(barberServicesTable.serviceId, serviceId)));
  if (links.length === 0) {
    const allLinks = await tx
      .select()
      .from(barberServicesTable)
      .where(eq(barberServicesTable.barberId, barberId));
    if (allLinks.length > 0) return { ok: false, reason: "não realiza este serviço" };
  }
  return { ok: true, barberName: b.name };
}

function formatBarber(b: BarberRow, serviceIds: number[]) {
  return {
    ...b,
    commissionRate: b.commissionRate != null ? parseFloat(b.commissionRate) : null,
    createdAt: b.createdAt.toISOString(),
    serviceIds,
  };
}

async function formatMany(rows: BarberRow[]) {
  const map = await serviceIdsFor(rows.map((r) => r.id));
  return rows.map((b) => formatBarber(b, map.get(b.id) ?? []));
}

router.get("/barbers", async (req, res): Promise<void> => {
  const shopId = resolveShop(req);
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
    return;
  }

  const query = ListBarbersQueryParams.safeParse(req.query);
  const activeOnly = query.success ? query.data.activeOnly : undefined;
  const serviceFilter = query.success ? query.data.serviceId : undefined;

  const conds = [eq(barbersTable.userId, shopId)] as ReturnType<typeof eq>[];
  if (activeOnly) conds.push(eq(barbersTable.active, true));

  let rows = await db.select().from(barbersTable).where(and(...conds)).orderBy(asc(barbersTable.sortOrder), asc(barbersTable.id));

  if (serviceFilter !== undefined) {
    const links = await db
      .select()
      .from(barberServicesTable)
      .where(eq(barberServicesTable.serviceId, serviceFilter));
    const linkedBarberIds = new Set(links.map((l) => l.barberId));
    const allLinks = await db.select().from(barberServicesTable);
    const barbersWithAnyLink = new Set(allLinks.map((l) => l.barberId));
    rows = rows.filter((b) => linkedBarberIds.has(b.id) || !barbersWithAnyLink.has(b.id));
  }

  res.json(await formatMany(rows));
});

router.post("/barbers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBarberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [currentUser] = await db.select({ maxBarbers: usersTable.maxBarbers })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (currentUser?.maxBarbers != null) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(barbersTable)
      .where(and(eq(barbersTable.userId, userId), eq(barbersTable.active, true)));
    const activeCount = countResult?.count ?? 0;
    if (activeCount >= currentUser.maxBarbers) {
      res.status(403).json({
        error: `Seu plano permite até ${currentUser.maxBarbers} profissional(is). Faça upgrade para adicionar mais.`,
        code: "BARBER_LIMIT_REACHED",
        maxBarbers: currentUser.maxBarbers,
      });
      return;
    }
  }

  const { serviceIds, commissionRate, ...rest } = parsed.data;
  const created = await db.transaction(async (tx) => {
    const [b] = await tx.insert(barbersTable).values({
      ...rest,
      userId,
      ...(commissionRate != null ? { commissionRate: String(commissionRate) } : {}),
    }).returning();
    if (serviceIds && serviceIds.length > 0) {
      await tx.insert(barberServicesTable).values(
        serviceIds.map((sid) => ({ barberId: b.id, serviceId: sid })),
      );
    }
    return b;
  });
  res.status(201).json(formatBarber(created, serviceIds ?? []));
});

router.get("/barbers/:id", async (req, res): Promise<void> => {
  const params = GetBarberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const shopId = resolveShop(req);
  const conds = shopId
    ? and(eq(barbersTable.id, params.data.id), eq(barbersTable.userId, shopId))
    : eq(barbersTable.id, params.data.id);
  const [b] = await db.select().from(barbersTable).where(conds);
  if (!b) {
    res.status(404).json({ error: "Barber not found" });
    return;
  }
  const [enriched] = await formatMany([b]);
  res.json(enriched);
});

router.patch("/barbers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateBarberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBarberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const { serviceIds, commissionRate, ...rest } = parsed.data;
  const updateFields = {
    ...rest,
    ...(commissionRate !== undefined ? { commissionRate: commissionRate != null ? String(commissionRate) : null } : {}),
  };
  const updated = await db.transaction(async (tx) => {
    const whereCond = and(eq(barbersTable.id, params.data.id), eq(barbersTable.userId, userId));
    const [b] = Object.keys(updateFields).length
      ? await tx.update(barbersTable).set(updateFields).where(whereCond).returning()
      : await tx.select().from(barbersTable).where(whereCond);
    if (!b) return null;
    if (serviceIds !== undefined) {
      await tx.delete(barberServicesTable).where(eq(barberServicesTable.barberId, b.id));
      if (serviceIds.length > 0) {
        await tx.insert(barberServicesTable).values(
          serviceIds.map((sid) => ({ barberId: b.id, serviceId: sid })),
        );
      }
    }
    return b;
  });
  if (!updated) {
    res.status(404).json({ error: "Barber not found" });
    return;
  }
  const [enriched] = await formatMany([updated]);
  res.json(enriched);
});

router.delete("/barbers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteBarberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  await db.transaction(async (tx) => {
    await tx.delete(barberServicesTable).where(eq(barberServicesTable.barberId, params.data.id));
    await tx.delete(barbersTable).where(and(eq(barbersTable.id, params.data.id), eq(barbersTable.userId, userId)));
  });
  res.sendStatus(204);
});

export default router;
