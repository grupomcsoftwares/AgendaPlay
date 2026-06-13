import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
    const result = await db.execute(sql`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY pr.unit_amount ASC
    `);
    const rows = (result.rows as Array<Record<string, unknown>>).map((r) => {
      const meta = r.product_metadata as Record<string, string> | null;
      const rawMax = meta?.maxBarbers;
      const maxBarbers = rawMax !== undefined ? (parseInt(rawMax, 10) || null) : null;
      return { ...r, maxBarbers };
    });
    res.json({ data: rows });
  } catch {
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
  res.json({
    hasActiveSubscription: !!user.stripeSubscriptionId,
    subscriptionId: user.stripeSubscriptionId,
    stripePriceId: user.stripePriceId,
    maxBarbers: user.maxBarbers,
    trialDaysLeft,
    trialExpired: trialDaysLeft === 0,
    canAccess: trialDaysLeft > 0 || !!user.stripeSubscriptionId,
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
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: "active",
      limit: 1,
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

      await db.update(usersTable).set({ stripeSubscriptionId: sub.id, stripePriceId, maxBarbers }).where(eq(usersTable.id, userId));
      res.json({ hasSubscription: true, subscriptionId: sub.id, stripePriceId, maxBarbers });
    } else {
      res.json({ hasSubscription: false });
    }
  } catch {
    res.json({ hasSubscription: false });
  }
});

export default router;
