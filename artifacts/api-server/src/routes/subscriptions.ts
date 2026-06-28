import { Router, type IRouter, type Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, subscriptionPlansTable, clientSubscriptionsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

function resolveShop(req: Request): string | null {
  if (req.session?.userId) return req.session.userId;
  const shopId = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
  return shopId || null;
}

function parseId(params: unknown): number | null {
  if (!params || typeof params !== "object") return null;
  const p = params as Record<string, unknown>;
  const id = parseInt(String(p.id ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function formatPlan(p: typeof subscriptionPlansTable.$inferSelect) {
  return { ...p, price: parseFloat(p.price), createdAt: p.createdAt.toISOString() };
}

function formatSubscription(s: typeof clientSubscriptionsTable.$inferSelect) {
  return { ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

// ── Subscription Plans ────────────────────────────────────────────────────

router.get("/subscription-plans", async (req, res): Promise<void> => {
  const shopId = resolveShop(req);
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
    return;
  }
  const rows = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.userId, shopId))
    .orderBy(subscriptionPlansTable.createdAt);
  res.json(rows.map(formatPlan));
});

router.post("/subscription-plans", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name é obrigatório" });
    return;
  }
  const price = typeof body.price === "number" ? body.price : parseFloat(String(body.price ?? "0"));
  if (Number.isNaN(price) || price < 0) {
    res.status(400).json({ error: "price inválido" });
    return;
  }
  const [created] = await db.insert(subscriptionPlansTable).values({
    userId,
    name,
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    price: String(price),
    maxAppointmentsPerMonth: typeof body.maxAppointmentsPerMonth === "number" && body.maxAppointmentsPerMonth > 0
      ? body.maxAppointmentsPerMonth : null,
    active: body.active !== false,
  }).returning();
  res.status(201).json(formatPlan(created));
});

router.patch("/subscription-plans/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const userId = req.session.userId!;
  const body = req.body as Record<string, unknown>;
  const patch: Partial<typeof subscriptionPlansTable.$inferInsert> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null) patch.description = body.description as string | null;
  if (typeof body.price !== "undefined") {
    const p = typeof body.price === "number" ? body.price : parseFloat(String(body.price));
    if (!Number.isNaN(p) && p >= 0) patch.price = String(p);
  }
  if (typeof body.maxAppointmentsPerMonth === "number") {
    patch.maxAppointmentsPerMonth = body.maxAppointmentsPerMonth > 0 ? body.maxAppointmentsPerMonth : null;
  } else if (body.maxAppointmentsPerMonth === null) {
    patch.maxAppointmentsPerMonth = null;
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  const [updated] = await db
    .update(subscriptionPlansTable)
    .set(patch)
    .where(and(eq(subscriptionPlansTable.id, id), eq(subscriptionPlansTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Plano não encontrado" });
    return;
  }
  res.json(formatPlan(updated));
});

router.delete("/subscription-plans/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const userId = req.session.userId!;
  const [deleted] = await db
    .delete(subscriptionPlansTable)
    .where(and(eq(subscriptionPlansTable.id, id), eq(subscriptionPlansTable.userId, userId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Plano não encontrado" });
    return;
  }
  res.status(204).send();
});

// ── Client Subscriptions ──────────────────────────────────────────────────

router.get("/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const rows = await db
    .select()
    .from(clientSubscriptionsTable)
    .where(eq(clientSubscriptionsTable.userId, userId))
    .orderBy(clientSubscriptionsTable.createdAt);
  res.json(rows.map(formatSubscription));
});

router.post("/subscriptions", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const shopId = req.session?.userId ?? (typeof body.shopId === "string" ? body.shopId.trim() : "");
  if (!shopId) {
    res.status(400).json({ error: "shopId obrigatório" });
    return;
  }
  const planId = typeof body.planId === "number" ? body.planId : parseInt(String(body.planId ?? ""), 10);
  if (!Number.isFinite(planId) || planId <= 0) {
    res.status(400).json({ error: "planId inválido" });
    return;
  }
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const clientPhone = typeof body.clientPhone === "string" ? normalizePhone(body.clientPhone) : "";
  const clientEmail = typeof body.clientEmail === "string" ? body.clientEmail.trim() : "";
  if (!clientName || !clientPhone || !clientEmail) {
    res.status(400).json({ error: "clientName, clientPhone e clientEmail são obrigatórios" });
    return;
  }

  // Verify plan belongs to shop and is active
  const [plan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(and(eq(subscriptionPlansTable.id, planId), eq(subscriptionPlansTable.userId, shopId)))
    .limit(1);
  if (!plan) {
    res.status(404).json({ error: "Plano não encontrado" });
    return;
  }
  if (!plan.active) {
    res.status(400).json({ error: "Este plano não está disponível no momento" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const [created] = await db.insert(clientSubscriptionsTable).values({
    userId: shopId,
    planId,
    clientName,
    clientPhone,
    clientEmail,
    startDate: today,
    status: "pending",
  }).returning();
  res.status(201).json(formatSubscription(created));
});

router.patch("/subscriptions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const userId = req.session.userId!;
  const body = req.body as Record<string, unknown>;
  const status = body.status as string | undefined;
  if (!status || !["pending", "active", "cancelled"].includes(status)) {
    res.status(400).json({ error: "status deve ser pending, active ou cancelled" });
    return;
  }
  const [updated] = await db
    .update(clientSubscriptionsTable)
    .set({ status: status as "pending" | "active" | "cancelled" })
    .where(and(eq(clientSubscriptionsTable.id, id), eq(clientSubscriptionsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Assinatura não encontrada" });
    return;
  }
  res.json(formatSubscription(updated));
});

router.get("/subscriptions/check", async (req, res): Promise<void> => {
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
  const [sub] = await db
    .select()
    .from(clientSubscriptionsTable)
    .where(and(
      eq(clientSubscriptionsTable.userId, shopId),
      eq(clientSubscriptionsTable.clientPhone, phone),
      eq(clientSubscriptionsTable.status, "active"),
    ))
    .limit(1);
  if (!sub) {
    res.json({ active: false, planName: null });
    return;
  }
  const [plan] = await db
    .select({ name: subscriptionPlansTable.name, maxAppointmentsPerMonth: subscriptionPlansTable.maxAppointmentsPerMonth })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, sub.planId))
    .limit(1);
  res.json({ active: true, planName: plan?.name ?? null, subscriptionId: sub.id, maxAppointmentsPerMonth: plan?.maxAppointmentsPerMonth ?? null });
});

// Returns how many plan-covered appointments the client has used this month
router.get("/subscriptions/usage", async (req, res): Promise<void> => {
  const shopId = resolveShop(req);
  if (!shopId) { res.status(400).json({ error: "shopId obrigatório" }); return; }
  const rawPhone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
  if (!rawPhone) { res.status(400).json({ error: "phone obrigatório" }); return; }
  const phone = normalizePhone(rawPhone);

  const [sub] = await db
    .select()
    .from(clientSubscriptionsTable)
    .where(and(
      eq(clientSubscriptionsTable.userId, shopId),
      eq(clientSubscriptionsTable.clientPhone, phone),
      eq(clientSubscriptionsTable.status, "active"),
    ))
    .limit(1);
  if (!sub) { res.json({ active: false, used: 0, limit: 0, remaining: 0 }); return; }

  const [plan] = await db
    .select({ maxAppointmentsPerMonth: subscriptionPlansTable.maxAppointmentsPerMonth })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, sub.planId))
    .limit(1);

  const limit = plan?.maxAppointmentsPerMonth ?? 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const { sql, count } = await import("drizzle-orm");
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`appointments`)
    .where(sql`
      user_id = ${shopId}
      AND client_name = ${sub.clientName}
      AND covered_by_plan = true
      AND status != 'cancelled'
      AND scheduled_at >= ${monthStart.toISOString()}::timestamptz
      AND scheduled_at < ${monthEnd.toISOString()}::timestamptz
    `);
  const used = result?.count ?? 0;
  res.json({ active: true, used, limit, remaining: Math.max(0, limit - used) });
});

export default router;
