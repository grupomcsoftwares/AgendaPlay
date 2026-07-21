import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { getUncachableStripeClient } from "../stripeClient.js";

const router: IRouter = Router();

// Explicit column list that excludes `previousSlug` so queries work even when
// the production database has not yet had that column added via a Publish migration.
const userCols = {
  id: usersTable.id,
  email: usersTable.email,
  passwordHash: usersTable.passwordHash,
  barbershopName: usersTable.barbershopName,
  ownerName: usersTable.ownerName,
  slug: usersTable.slug,
  trialStartedAt: usersTable.trialStartedAt,
  stripeCustomerId: usersTable.stripeCustomerId,
  stripeSubscriptionId: usersTable.stripeSubscriptionId,
  stripePriceId: usersTable.stripePriceId,
  stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
  maxBarbers: usersTable.maxBarbers,
  createdAt: usersTable.createdAt,
};

function requireAuth(req: Request, res: Response, next: () => void): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

router.post("/stripe/checkout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  const { priceId } = req.body as { priceId?: string };
  if (!priceId) {
    res.status(400).json({ error: "priceId é obrigatório." });
    return;
  }

  const stripe = await getUncachableStripeClient();

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });
    await db.update(usersTable).set({ stripeCustomerId: customer.id }).where(eq(usersTable.id, userId));
    customerId = customer.id;
  }

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  const baseUrl = domain ? `https://${domain}` : `${req.protocol}://${req.get("host")}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${baseUrl}/subscribe?subscribed=1`,
    cancel_url: `${baseUrl}/subscribe?canceled=1`,
  });

  res.json({ url: session.url });
});

router.get("/stripe/plans", async (_req: Request, res: Response): Promise<void> => {
  try {
    const stripe = await getUncachableStripeClient();

    // Fetch products + prices directly from Stripe API (no DB dependency)
    const products = await stripe.products.list({ active: true, limit: 100 });
    const prices = await stripe.prices.list({ active: true, limit: 100, type: "recurring" });

    // Build price lookup by product
    const priceMap = new Map<string, Stripe.Price>();
    for (const pr of prices.data) {
      const productId = typeof pr.product === "string" ? pr.product : (pr.product as any)?.id;
      if (productId && !priceMap.has(productId)) {
        priceMap.set(productId, pr);
      }
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const p of products.data) {
      const pr = priceMap.get(p.id);
      if (!pr) continue;
      const rawMax = p.metadata?.maxBarbers;
      const maxBarbers = rawMax !== undefined ? (parseInt(rawMax, 10) || null) : null;
      rows.push({
        product_id: p.id,
        product_name: p.name,
        product_description: p.description,
        product_metadata: p.metadata,
        price_id: pr.id,
        unit_amount: pr.unit_amount,
        currency: pr.currency,
        recurring: pr.recurring,
        maxBarbers,
      });
    }

    // Sort by price ascending
    rows.sort((a, b) => (a.unit_amount as number) - (b.unit_amount as number));

    // Deduplicate: keep only one plan per unit_amount (first one in order)
    const seenAmounts = new Set<number>();
    const deduped = rows.filter((r) => {
      const amount = r.unit_amount as number;
      if (seenAmounts.has(amount)) return false;
      seenAmounts.add(amount);
      return true;
    });

    res.json({ data: deduped });
  } catch (err) {
    res.json({ data: [] });
  }
});

router.get("/stripe/subscription-status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  const TRIAL_DAYS = 7;
  const trialStarted = new Date(user.trialStartedAt);
  const daysSinceTrial = Math.floor((Date.now() - trialStarted.getTime()) / (1000 * 60 * 60 * 24));
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceTrial);
  const periodEnd = user.stripeCurrentPeriodEnd ? new Date(user.stripeCurrentPeriodEnd) : null;
  const subscriptionDaysLeft = periodEnd
    ? Math.max(0, Math.floor((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  res.json({
    hasActiveSubscription: !!user.stripeSubscriptionId,
    subscriptionId: user.stripeSubscriptionId,
    stripePriceId: user.stripePriceId,
    maxBarbers: user.maxBarbers,
    trialDaysLeft,
    trialExpired: trialDaysLeft === 0,
    canAccess: trialDaysLeft > 0 || !!user.stripeSubscriptionId,
    subscriptionDueDate: periodEnd?.toISOString() ?? null,
    subscriptionDaysLeft,
  });
});

router.post("/stripe/sync-subscription", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.stripeCustomerId) {
    res.json({ hasSubscription: false });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    // Check active and trialing; also fall back to "all" to find past_due etc.
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      limit: 5,
    });

    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      const priceItem = sub.items?.data?.[0];
      const stripePriceId = priceItem?.price?.id ?? null;
      const productId = typeof priceItem?.price?.product === "string" ? priceItem.price.product : null;

      let maxBarbers: number | null = null;
      if (productId) {
        try {
          const product = await stripe.products.retrieve(productId);
          const raw = product.metadata?.maxBarbers;
          if (raw !== undefined && raw !== null) {
            const parsed = parseInt(raw, 10);
            maxBarbers = (!Number.isNaN(parsed) && parsed > 0) ? parsed : null;
          }
        } catch { /* ignore */ }
      }

      const periodEnd = (sub as any).current_period_end
        ? new Date((sub as any).current_period_end * 1000)
        : null;

      await db.update(usersTable)
        .set({ stripeSubscriptionId: sub.id, stripePriceId, maxBarbers, stripeCurrentPeriodEnd: periodEnd })
        .where(eq(usersTable.id, userId));
      res.json({ hasSubscription: true, subscriptionId: sub.id, stripePriceId, maxBarbers, subscriptionDueDate: periodEnd?.toISOString() ?? null });
    } else {
      res.json({ hasSubscription: false });
    }
  } catch {
    res.json({ hasSubscription: false });
  }
});

export default router;
