import { Router, type IRouter, type Request } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { db, subscriptionPlansTable, clientSubscriptionsTable, appointmentsTable, clientsTable, usersTable } from "@workspace/db";
import { requireActiveAuth } from "../middleware/accountActive.js";
import { accountCanAccess } from "./accountStatus.js";

const router: IRouter = Router();
const TZ = "America/Sao_Paulo";

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

function saoPauloBoundary(year: number, month: number, day: number): Date {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(candidate);
  const localWallTime = Date.UTC(
    Number(parts.find((part) => part.type === "year")?.value),
    Number(parts.find((part) => part.type === "month")?.value) - 1,
    Number(parts.find((part) => part.type === "day")?.value),
    Number(parts.find((part) => part.type === "hour")?.value),
    Number(parts.find((part) => part.type === "minute")?.value),
    Number(parts.find((part) => part.type === "second")?.value),
  );
  return new Date(candidate.getTime() - (localWallTime - candidate.getTime()));
}

function formatPlan(p: typeof subscriptionPlansTable.$inferSelect) {
  return { ...p, price: parseFloat(p.price), createdAt: p.createdAt.toISOString() };
}

function formatSubscription(s: typeof clientSubscriptionsTable.$inferSelect) {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    expiresAt: s.expiresAt?.toISOString() ?? null,
    renewedAt: s.renewedAt?.toISOString() ?? null,
  };
}

/** Mark all expired-but-still-active subscriptions as expired, for a given userId. */
async function autoExpireSubscriptions(userId: string): Promise<void> {
  const now = new Date();
  await db
    .update(clientSubscriptionsTable)
    .set({ status: "expired" })
    .where(and(
      eq(clientSubscriptionsTable.userId, userId),
      eq(clientSubscriptionsTable.status, "active"),
      sql`${clientSubscriptionsTable.expiresAt} IS NOT NULL AND ${clientSubscriptionsTable.expiresAt} < ${now}`,
    ));
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

router.post("/subscription-plans", requireActiveAuth, async (req, res): Promise<void> => {
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
    credits: typeof body.credits === "number" && body.credits > 0 ? body.credits : null,
    maxAppointmentsPerMonth: typeof body.maxAppointmentsPerMonth === "number" && body.maxAppointmentsPerMonth > 0
      ? body.maxAppointmentsPerMonth : null,
    active: body.active !== false,
  }).returning();
  res.status(201).json(formatPlan(created));
});

router.patch("/subscription-plans/:id", requireActiveAuth, async (req, res): Promise<void> => {
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
  if (typeof body.credits === "number") {
    patch.credits = body.credits > 0 ? body.credits : null;
  } else if (body.credits === null) {
    patch.credits = null;
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

router.delete("/subscription-plans/:id", requireActiveAuth, async (req, res): Promise<void> => {
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

router.get("/subscriptions", requireActiveAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  await autoExpireSubscriptions(userId);
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
  const [account] = await db
    .select({
      trialStartedAt: usersTable.trialStartedAt,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      maxBarbers: usersTable.maxBarbers,
    })
    .from(usersTable)
    .where(eq(usersTable.id, shopId))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Barbearia não encontrada" });
    return;
  }
  if (!accountCanAccess(account)) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "As assinaturas desta barbearia estão temporariamente indisponíveis.",
    });
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
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:${planId}:${clientPhone}`}))`);
    const [pending] = await tx
      .select()
      .from(clientSubscriptionsTable)
      .where(and(
        eq(clientSubscriptionsTable.userId, shopId),
        eq(clientSubscriptionsTable.planId, planId),
        eq(clientSubscriptionsTable.clientPhone, clientPhone),
        eq(clientSubscriptionsTable.status, "pending"),
      ))
      .orderBy(clientSubscriptionsTable.createdAt)
      .limit(1);
    if (pending) return pending;
    const [inserted] = await tx.insert(clientSubscriptionsTable).values({
      userId: shopId,
      planId,
      clientName,
      clientPhone,
      clientEmail,
      startDate: today,
      status: "pending",
    }).returning();
    return inserted;
  });
  res.status(201).json(formatSubscription(created));
});

router.patch("/subscriptions/:id", requireActiveAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const userId = req.session.userId!;
  const body = req.body as Record<string, unknown>;
  const status = body.status as string | undefined;
  if (!status || !["pending", "active", "cancelled", "expired"].includes(status)) {
    res.status(400).json({ error: "status deve ser pending, active, cancelled ou expired" });
    return;
  }

  // When activating, load plan credits and set expiration
  let patch: Partial<typeof clientSubscriptionsTable.$inferInsert> = { status: status as "pending" | "active" | "cancelled" | "expired" };
  if (status === "active") {
    const [sub] = await db.select().from(clientSubscriptionsTable).where(and(eq(clientSubscriptionsTable.id, id), eq(clientSubscriptionsTable.userId, userId))).limit(1);
    if (sub) {
      const [plan] = await db.select({ credits: subscriptionPlansTable.credits }).from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, sub.planId)).limit(1);
      const planCredits = plan?.credits ?? 0;
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      patch = {
        ...patch,
        creditsRemaining: planCredits,
        creditsTotal: planCredits,
        expiresAt: expires,
      };
    }
  }

  const [updated] = await db
    .update(clientSubscriptionsTable)
    .set(patch)
    .where(and(eq(clientSubscriptionsTable.id, id), eq(clientSubscriptionsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Assinatura não encontrada" });
    return;
  }
  res.json(formatSubscription(updated));
});

// Manual renewal of an expired subscription — resets credits and adds 30 days
router.post("/subscriptions/:id/renew", requireActiveAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params);
  if (!id) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const userId = req.session.userId!;

  const [sub] = await db
    .select()
    .from(clientSubscriptionsTable)
    .where(and(eq(clientSubscriptionsTable.id, id), eq(clientSubscriptionsTable.userId, userId)))
    .limit(1);
  if (!sub) {
    res.status(404).json({ error: "Assinatura não encontrada" });
    return;
  }
  if (!["expired", "active"].includes(sub.status)) {
    res.status(400).json({ error: "Apenas assinaturas ativas ou expiradas podem ser renovadas" });
    return;
  }

  const [plan] = await db
    .select({ credits: subscriptionPlansTable.credits })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, sub.planId))
    .limit(1);
  const planCredits = plan?.credits ?? 0;

  const now = new Date();
  const newExpiry = new Date(now);
  newExpiry.setDate(newExpiry.getDate() + 30);

  const [updated] = await db
    .update(clientSubscriptionsTable)
    .set({
      status: "active",
      creditsRemaining: planCredits,
      creditsTotal: planCredits,
      expiresAt: newExpiry,
      renewedAt: now,
    })
    .where(and(eq(clientSubscriptionsTable.id, id), eq(clientSubscriptionsTable.userId, userId)))
    .returning();

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
  // Auto-expire any subscriptions whose period has ended before checking
  await autoExpireSubscriptions(shopId);
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
    .select({ name: subscriptionPlansTable.name, credits: subscriptionPlansTable.credits, maxAppointmentsPerMonth: subscriptionPlansTable.maxAppointmentsPerMonth })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, sub.planId))
    .limit(1);
  res.json({
    active: true,
    planName: plan?.name ?? null,
    subscriptionId: sub.id,
    creditsRemaining: sub.creditsRemaining ?? 0,
    creditsTotal: sub.creditsTotal ?? 0,
    expiresAt: sub.expiresAt?.toISOString() ?? null,
    maxAppointmentsPerMonth: plan?.maxAppointmentsPerMonth ?? null,
  });
});

// Returns current subscription credit usage
router.get("/subscriptions/usage", async (req, res): Promise<void> => {
  const shopId = resolveShop(req);
  if (!shopId) { res.status(400).json({ error: "shopId obrigatório" }); return; }
  const rawPhone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
  if (!rawPhone) { res.status(400).json({ error: "phone obrigatório" }); return; }
  const phone = normalizePhone(rawPhone);

  // Auto-expire any subscriptions whose period has ended before checking
  await autoExpireSubscriptions(shopId);

  const [sub] = await db
    .select()
    .from(clientSubscriptionsTable)
    .where(and(
      eq(clientSubscriptionsTable.userId, shopId),
      eq(clientSubscriptionsTable.clientPhone, phone),
      eq(clientSubscriptionsTable.status, "active"),
    ))
    .limit(1);
  if (!sub) { res.json({ active: false, creditsRemaining: 0, creditsTotal: 0, expiresAt: null }); return; }

  const usedAppointments = await db
    .select({
      creditsUsed: appointmentsTable.creditsUsed,
      clientPhone: clientsTable.phone,
      notes: appointmentsTable.notes,
    })
    .from(appointmentsTable)
    .leftJoin(
      clientsTable,
      and(
        eq(clientsTable.id, appointmentsTable.clientId),
        eq(clientsTable.userId, shopId),
      ),
    )
    .where(and(
      eq(appointmentsTable.userId, shopId),
      eq(appointmentsTable.coveredByPlan, true),
      gte(appointmentsTable.createdAt, sub.createdAt),
    ));
  const totalUsed = usedAppointments.reduce((sum, appointment) => {
    const phoneFromNotes = appointment.notes?.match(/Tel:\s*([^.]+)/)?.[1] ?? "";
    const appointmentPhone = normalizePhone(appointment.clientPhone || phoneFromNotes);
    return appointmentPhone === phone ? sum + (appointment.creditsUsed ?? 0) : sum;
  }, 0);
  res.json({
    active: true,
    creditsRemaining: sub.creditsRemaining ?? 0,
    creditsTotal: sub.creditsTotal ?? 0,
    expiresAt: sub.expiresAt?.toISOString() ?? null,
    creditsUsedThisPeriod: totalUsed,
  });
});

// Returns all subscribers (active + expired) with their monthly cut count
router.get("/subscriptions/monthly-usage", requireActiveAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  // Auto-expire any subscriptions whose period has ended
  await autoExpireSubscriptions(userId);

  // First day of the current calendar month in the application's timezone.
  const now = new Date();
  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const currentYear = Number(nowParts.find((part) => part.type === "year")?.value);
  const currentMonth = Number(nowParts.find((part) => part.type === "month")?.value);
  const monthStart = saoPauloBoundary(currentYear, currentMonth, 1);
  const monthEnd = saoPauloBoundary(currentYear, currentMonth + 1, 1);

  // All active + expired subscriptions joined with plan info
  const subs = await db
    .select({
      id: clientSubscriptionsTable.id,
      clientName: clientSubscriptionsTable.clientName,
      clientPhone: clientSubscriptionsTable.clientPhone,
      clientEmail: clientSubscriptionsTable.clientEmail,
      status: clientSubscriptionsTable.status,
      expiresAt: clientSubscriptionsTable.expiresAt,
      renewedAt: clientSubscriptionsTable.renewedAt,
      planId: clientSubscriptionsTable.planId,
      planName: subscriptionPlansTable.name,
      maxAppointmentsPerMonth: subscriptionPlansTable.maxAppointmentsPerMonth,
    })
    .from(clientSubscriptionsTable)
    .leftJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, clientSubscriptionsTable.planId))
    .where(and(
      eq(clientSubscriptionsTable.userId, userId),
      sql`${clientSubscriptionsTable.status} IN ('active', 'expired')`,
    ))
    .orderBy(clientSubscriptionsTable.createdAt);

  if (subs.length === 0) {
    res.json([]);
    return;
  }

  // Count this-month coveredByPlan appointments by phone. Older appointments
  // may not have clientId linked, so fall back to the phone stored in notes.
  const monthlyUsage = await db
    .select({
      clientPhone: clientsTable.phone,
      notes: appointmentsTable.notes,
    })
    .from(appointmentsTable)
    .leftJoin(
      clientsTable,
      and(
        eq(clientsTable.id, appointmentsTable.clientId),
        eq(clientsTable.userId, userId),
      ),
    )
    .where(and(
      eq(appointmentsTable.userId, userId),
      eq(appointmentsTable.coveredByPlan, true),
      sql`${appointmentsTable.status} != 'cancelled'`,
      gte(appointmentsTable.scheduledAt, monthStart),
      lt(appointmentsTable.scheduledAt, monthEnd),
    ))
    ;

  const usageByPhone = new Map<string, number>();
  for (const row of monthlyUsage) {
    const phoneFromNotes = row.notes?.match(/Tel:\s*([^.]+)/)?.[1] ?? "";
    const phone = normalizePhone(row.clientPhone || phoneFromNotes);
    if (phone) usageByPhone.set(phone, (usageByPhone.get(phone) ?? 0) + 1);
  }

  res.json(subs.map(s => ({
    id: s.id,
    clientName: s.clientName,
    clientPhone: s.clientPhone,
    clientEmail: s.clientEmail,
    status: s.status,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    renewedAt: s.renewedAt?.toISOString() ?? null,
    planId: s.planId,
    planName: s.planName ?? null,
    maxAppointmentsPerMonth: s.maxAppointmentsPerMonth ?? null,
    cutsUsedThisMonth: usageByPhone.get(normalizePhone(s.clientPhone)) ?? 0,
  })));
});

export default router;
