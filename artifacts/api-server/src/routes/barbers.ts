import { Router, type IRouter } from "express";
import { eq, inArray, asc, and, sql } from "drizzle-orm";
import { db, barbersTable, barberServicesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";

export async function isBarberAllowedForService(
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  barberId: number,
  serviceId: number | null,
): Promise<{ ok: true; barberName: string } | { ok: false; reason: string }> {
  const [b] = await tx.select().from(barbersTable).where(eq(barbersTable.id, barberId));
  if (!b) return { ok: false, reason: "barber not found" };
  if (!b.active) return { ok: false, reason: "barber inactive" };
  if (serviceId === null) return { ok: true, barberName: b.name };
  // A barber with no service links is treated as "all services" (legacy / convenience).
  const links = await tx.select().from(barberServicesTable).where(eq(barberServicesTable.barberId, barberId));
  if (links.length === 0) return { ok: true, barberName: b.name };
  if (!links.some((l) => l.serviceId === serviceId)) return { ok: false, reason: "barber does not perform this service" };
  return { ok: true, barberName: b.name };
}
import {
  CreateBarberBody,
  GetBarberParams,
  UpdateBarberParams,
  UpdateBarberBody,
  DeleteBarberParams,
  ListBarbersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type BarberRow = typeof barbersTable.$inferSelect;

async function serviceIdsFor(ids: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (ids.length === 0) return map;
  const links = await db
    .select()
    .from(barberServicesTable)
    .where(inArray(barberServicesTable.barberId, ids));
  for (const l of links) {
    const arr = map.get(l.barberId) ?? [];
    arr.push(l.serviceId);
    map.set(l.barberId, arr);
  }
  return map;
}

function formatBarber(b: BarberRow, serviceIds: number[]) {
  return {
    ...b,
    createdAt: b.createdAt.toISOString(),
    serviceIds,
  };
}

async function formatMany(rows: BarberRow[]) {
  const map = await serviceIdsFor(rows.map((r) => r.id));
  return rows.map((b) => formatBarber(b, map.get(b.id) ?? []));
}

router.get("/barbers", async (req, res): Promise<void> => {
  const query = ListBarbersQueryParams.safeParse(req.query);
  const activeOnly = query.success ? query.data.activeOnly : undefined;
  const serviceFilter = query.success ? query.data.serviceId : undefined;

  const conds = [] as ReturnType<typeof eq>[];
  if (activeOnly) conds.push(eq(barbersTable.active, true));

  let rows = conds.length
    ? await db.select().from(barbersTable).where(and(...conds)).orderBy(asc(barbersTable.sortOrder), asc(barbersTable.id))
    : await db.select().from(barbersTable).orderBy(asc(barbersTable.sortOrder), asc(barbersTable.id));

  if (serviceFilter !== undefined) {
    const links = await db
      .select()
      .from(barberServicesTable)
      .where(eq(barberServicesTable.serviceId, serviceFilter));
    const linkedBarberIds = new Set(links.map((l) => l.barberId));
    // A barber with NO entries at all is treated as "all services" (legacy).
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
      .where(eq(barbersTable.active, true));
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

  const { serviceIds, ...rest } = parsed.data;
  const created = await db.transaction(async (tx) => {
    const [b] = await tx.insert(barbersTable).values(rest).returning();
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
  const [b] = await db.select().from(barbersTable).where(eq(barbersTable.id, params.data.id));
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
  const { serviceIds, ...rest } = parsed.data;
  const updated = await db.transaction(async (tx) => {
    const [b] = Object.keys(rest).length
      ? await tx.update(barbersTable).set(rest).where(eq(barbersTable.id, params.data.id)).returning()
      : await tx.select().from(barbersTable).where(eq(barbersTable.id, params.data.id));
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
  await db.transaction(async (tx) => {
    await tx.delete(barberServicesTable).where(eq(barberServicesTable.barberId, params.data.id));
    await tx.delete(barbersTable).where(eq(barbersTable.id, params.data.id));
  });
  res.sendStatus(204);
});

export default router;
