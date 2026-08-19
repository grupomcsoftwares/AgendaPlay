import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { getUncachableStripeClient } from "../stripeClient.js";
import { getAccountStatus } from "./accountStatus.js";
import { getStripePaymentFailureStatus } from "../lib/stripeSubscriptionStatus.js";
import {
  getAuthorizedStripePrice,
  isAuthorizedStripeCatalogEntry,
} from "../stripeCatalog.js";
import { withAccountLifecycleLock } from "../services/accountLifecycleLock.js";

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
  trialEligible: usersTable.trialEligible,
  hasEverPaid: usersTable.hasEverPaid,
  firstPaidAt: usersTable.firstPaidAt,
  firstMonthDiscountCheckoutSessionId: usersTable.firstMonthDiscountCheckoutSessionId,
  firstMonthDiscountCheckoutPriceId: usersTable.firstMonthDiscountCheckoutPriceId,
  firstMonthDiscountRedeemedAt: usersTable.firstMonthDiscountRedeemedAt,
  stripeCustomerId: usersTable.stripeCustomerId,
  stripeSubscriptionId: usersTable.stripeSubscriptionId,
  stripePriceId: usersTable.stripePriceId,
  stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
  stripePaymentFailing: usersTable.stripePaymentFailing,
  maxBarbers: usersTable.maxBarbers,
  createdAt: usersTable.createdAt,
};

const PUBLIC_APP_BASE = "https://agendaplay.net";
const FIRST_MONTH_PROMOTION_KEY = "agendaplay_first_month_50_v1";

class CheckoutRouteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

async function getFirstMonthDiscountCoupon(stripe: Stripe): Promise<Stripe.Coupon> {
  const coupons = await stripe.coupons.list({ limit: 100 });
  const existing = coupons.data.find((coupon) =>
    coupon.valid
    && coupon.duration === "once"
    && coupon.percent_off === 50
    && coupon.metadata?.promotion === FIRST_MONTH_PROMOTION_KEY
  );
  if (existing) return existing;

  return stripe.coupons.create(
    {
      duration: "once",
      percent_off: 50,
      name: "AgendaPlay — 50% no primeiro mês",
      metadata: { promotion: FIRST_MONTH_PROMOTION_KEY },
    },
    { idempotencyKey: FIRST_MONTH_PROMOTION_KEY },
  );
}

function requireAuth(req: Request, res: Response, next: () => void): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

router.post("/stripe/checkout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { priceId } = req.body as { priceId?: string };
    if (!priceId) {
      res.status(400).json({ error: "priceId é obrigatório." });
      return;
    }

    const response = await withAccountLifecycleLock(userId, async () => {
      let [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, userId));
      if (!user) {
        throw new CheckoutRouteError(404, "Usuário não encontrado.");
      }

      const stripe = await getUncachableStripeClient();
      const authorizedPrice = await getAuthorizedStripePrice(stripe, priceId);
      if (!authorizedPrice) {
        throw new CheckoutRouteError(400, "Plano de assinatura inválido ou indisponível.");
      }

      const status = getAccountStatus(user);
      if (status.hasActiveSubscription) {
        throw new CheckoutRouteError(
          409,
          "Esta conta já possui uma assinatura ativa.",
        );
      }
      const applyFirstMonthDiscount = status.firstMonthDiscountEligible;

      const createCustomer = async (): Promise<string> => {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId },
        });
        await db
          .update(usersTable)
          .set({ stripeCustomerId: customer.id })
          .where(eq(usersTable.id, userId));
        user = { ...user, stripeCustomerId: customer.id };
        return customer.id;
      };

      let customerId = user.stripeCustomerId ?? await createCustomer();
      const priorCheckoutSessionId = user.firstMonthDiscountCheckoutSessionId;

      if (priorCheckoutSessionId) {
        try {
          const existingSession = await stripe.checkout.sessions.retrieve(priorCheckoutSessionId);
          const sessionHasExpectedPromotion =
            (existingSession.metadata?.promotion === FIRST_MONTH_PROMOTION_KEY)
            === applyFirstMonthDiscount;
          if (
            existingSession.status === "open"
            && user.firstMonthDiscountCheckoutPriceId === authorizedPrice.id
            && sessionHasExpectedPromotion
            && existingSession.url
          ) {
            return {
              url: existingSession.url,
              firstMonthDiscountApplied: applyFirstMonthDiscount,
            };
          }
          if (existingSession.status === "complete") {
            throw new CheckoutRouteError(
              409,
              "Seu pagamento já foi concluído e está sendo confirmado.",
            );
          }
          if (existingSession.status === "open") {
            await stripe.checkout.sessions.expire(existingSession.id);
          }
        } catch (error) {
          if (error instanceof CheckoutRouteError) throw error;
          const stripeError = error as { code?: string };
          if (stripeError.code !== "resource_missing") throw error;
        }

        await db
          .update(usersTable)
          .set({
            firstMonthDiscountCheckoutSessionId: null,
            firstMonthDiscountCheckoutPriceId: null,
          })
          .where(eq(usersTable.id, userId));
      }

      const coupon = applyFirstMonthDiscount
        ? await getFirstMonthDiscountCoupon(stripe)
        : null;
      const promotionMetadata: Record<string, string> = applyFirstMonthDiscount
        ? { promotion: FIRST_MONTH_PROMOTION_KEY }
        : {};
      const createCheckoutSession = (selectedCustomerId: string) =>
        stripe.checkout.sessions.create(
          {
            customer: selectedCustomerId,
            client_reference_id: userId,
            metadata: { userId, ...promotionMetadata },
            subscription_data: {
              metadata: { userId, ...promotionMetadata },
            },
            payment_method_types: ["card"],
            line_items: [{ price: authorizedPrice.id, quantity: 1 }],
            mode: "subscription",
            ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
            success_url: `${PUBLIC_APP_BASE}/subscribe?subscribed=1&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${PUBLIC_APP_BASE}/subscribe?canceled=1`,
          },
          applyFirstMonthDiscount
            ? {
                idempotencyKey: [
                  FIRST_MONTH_PROMOTION_KEY,
                  authorizedPrice.livemode ? "live" : "test",
                  userId,
                  authorizedPrice.id,
                  priorCheckoutSessionId ?? "initial",
                ].join(":"),
              }
            : undefined,
        );

      let session: Stripe.Checkout.Session;
      try {
        session = await createCheckoutSession(customerId);
      } catch (err: unknown) {
        const stripeError = err as { code?: string; param?: string };
        const missingCustomer =
          stripeError.code === "resource_missing"
          && stripeError.param === "customer"
          && Boolean(user.stripeCustomerId);
        if (!missingCustomer) throw err;

        customerId = await createCustomer();
        session = await createCheckoutSession(customerId);
      }

      await db
        .update(usersTable)
        .set({
          firstMonthDiscountCheckoutSessionId: session.id,
          firstMonthDiscountCheckoutPriceId: authorizedPrice.id,
        })
        .where(eq(usersTable.id, userId));

      return {
        url: session.url,
        firstMonthDiscountApplied: applyFirstMonthDiscount,
      };
    });

    res.json(response);
  } catch (err: unknown) {
    if (err instanceof CheckoutRouteError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const stripeError = err as { message?: string; code?: string };
    console.error("Stripe checkout failed", {
      code: stripeError.code,
      message: stripeError.message,
    });
    res.status(400).json({ error: "Não foi possível iniciar o pagamento. Tente novamente." });
  }
});

router.get("/stripe/plans", async (_req: Request, res: Response): Promise<void> => {
  try {
    const stripe = await getUncachableStripeClient();

    // Fetch products + prices directly from Stripe API (no DB dependency)
    const products = await stripe.products.list({ active: true, limit: 100 });
    const prices = await stripe.prices.list({ active: true, limit: 100, type: "recurring" });

    // Build price lookup by product, keeping only the official AgendaPlay plans.
    const priceMap = new Map<string, Stripe.Price>();
    for (const pr of prices.data) {
      const productId = typeof pr.product === "string" ? pr.product : (pr.product as any)?.id;
      const product = productId ? products.data.find((item) => item.id === productId) : null;
      if (product && isAuthorizedStripeCatalogEntry(product, pr) && !priceMap.has(productId!)) {
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
        first_month_unit_amount:
          pr.unit_amount === null ? null : Math.round(pr.unit_amount * 0.5),
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
  const status = getAccountStatus(user);
  let pastDue = user.stripePaymentFailing;

  if (user.stripeCustomerId || user.stripeSubscriptionId) {
    try {
      const stripe = await getUncachableStripeClient();
      const livePastDue = await getStripePaymentFailureStatus(stripe, user);
      if (livePastDue !== null) {
        pastDue = livePastDue;
        if (livePastDue !== user.stripePaymentFailing) {
          await db
            .update(usersTable)
            .set({ stripePaymentFailing: livePastDue })
            .where(eq(usersTable.id, user.id));
        }
      }
    } catch (error) {
      req.log.warn(
        { err: error, userId },
        "Unable to refresh Stripe payment status; using webhook state",
      );
    }
  }

  res.json({
    hasActiveSubscription: status.hasActiveSubscription,
    subscriptionId: user.stripeSubscriptionId,
    stripePriceId: user.stripePriceId,
    maxBarbers: status.maxBarbers,
    trialDaysLeft: status.trialDaysLeft,
    trialExpired: status.trialExpired,
    canAccess: status.canAccess,
    subscriptionDueDate: status.subscriptionDueDate,
    subscriptionDaysLeft: status.subscriptionDaysLeft,
    pastDue,
    stripePaymentFailing: pastDue,
    trialEligible: status.trialEligible,
    returningCustomer: status.returningCustomer,
    firstMonthDiscountEligible: status.firstMonthDiscountEligible,
    deletionScheduledAt: status.deletionScheduledAt,
    deletionDaysLeft: status.deletionDaysLeft,
  });
});

router.post("/stripe/sync-subscription", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const stripe = await getUncachableStripeClient();
    const { sessionId } = (req.body ?? {}) as { sessionId?: string };
    let subscription: Stripe.Subscription | null = null;
    let checkoutSession: Stripe.Checkout.Session | null = null;
    let customerId: string | null = null;
    let checkoutUserId: string | null = null;

    // Prefer the checkout session returned by Stripe. This avoids selecting an
    // older subscription when the customer has more than one billing record.
    if (sessionId) {
      checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
      customerId =
        typeof checkoutSession.customer === "string"
          ? checkoutSession.customer
          : checkoutSession.customer?.id ?? null;
      checkoutUserId =
        checkoutSession.client_reference_id ??
        checkoutSession.metadata?.userId ??
        null;

      if (checkoutSession.status !== "complete" || !customerId) {
        res.json({ hasSubscription: false, pending: true });
        return;
      }
      const expandedSubscription = checkoutSession.subscription;
      if (expandedSubscription && typeof expandedSubscription !== "string") {
        subscription = expandedSubscription;
      } else if (typeof expandedSubscription === "string") {
        subscription = await stripe.subscriptions.retrieve(expandedSubscription);
      }
    }

    const authenticatedUserId = req.session.userId!;
    if (checkoutUserId && authenticatedUserId !== checkoutUserId) {
      res.status(403).json({ error: "Sessão de pagamento inválida." });
      return;
    }

    const user = (await db.select(userCols).from(usersTable).where(eq(usersTable.id, authenticatedUserId)))[0];

    if (!user || !user.stripeCustomerId) {
      res.status(401).json({ error: "Não foi possível validar a conta do pagamento." });
      return;
    }

    if (customerId && customerId !== user.stripeCustomerId) {
      res.status(403).json({ error: "Sessão de pagamento inválida." });
      return;
    }

    // The webhook and Stripe's customer index can lag the browser redirect.
    // Fall back to the newest active/trialing subscription when the session
    // is not available yet.
    if (!subscription) {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "all",
        limit: 20,
      });
      subscription =
        subscriptions.data.find((item) => item.status === "active" || item.status === "trialing") ??
        null;
    }

    if (subscription) {
      const sub = subscription;
      const priceItem = sub.items?.data?.[0];
      const stripePriceId = priceItem?.price?.id ?? null;
      const authorizedPrice = stripePriceId
        ? await getAuthorizedStripePrice(stripe, stripePriceId)
        : null;
      if (!authorizedPrice) {
        res.json({ hasSubscription: false });
        return;
      }
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

      const periodEndValue =
        (sub as any).current_period_end ??
        sub.items?.data?.[0]?.current_period_end;
      const periodEnd = periodEndValue
        ? new Date(periodEndValue * 1000)
        : null;

      const isActive = sub.status === "active" || sub.status === "trialing";
      if (isActive) {
        await db.update(usersTable)
          .set({
            stripeSubscriptionId: sub.id,
            stripePriceId,
            maxBarbers,
            stripeCurrentPeriodEnd: periodEnd,
            ...(checkoutSession?.payment_status === "paid"
              ? {
                  hasEverPaid: true,
                  firstPaidAt: sql`coalesce(${usersTable.firstPaidAt}, now())`,
                }
              : {}),
            ...(checkoutSession?.metadata?.promotion === FIRST_MONTH_PROMOTION_KEY
              ? {
                  firstMonthDiscountRedeemedAt:
                    sql`coalesce(${usersTable.firstMonthDiscountRedeemedAt}, now())`,
                }
              : {}),
          })
          .where(eq(usersTable.id, user.id));
      }
      res.json({
        hasSubscription: isActive,
        subscriptionId: isActive ? sub.id : null,
        stripePriceId: isActive ? stripePriceId : null,
        maxBarbers: isActive ? maxBarbers : null,
        subscriptionDueDate: isActive ? periodEnd?.toISOString() ?? null : null,
      });
    } else {
      res.json({ hasSubscription: false });
    }
  } catch {
    res.json({ hasSubscription: false });
  }
});

router.post("/stripe/customer-portal", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }
    if (!user.stripeCustomerId) {
      res.status(400).json({ error: "Nenhuma assinatura encontrada para este usuário." });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${PUBLIC_APP_BASE}/settings?portal_return=1`,
    });

    res.json({ url: session.url });
  } catch (err: unknown) {
    const stripeError = err as { message?: string; code?: string };
    console.error("Stripe customer portal failed", {
      code: stripeError.code,
      message: stripeError.message,
    });
    res.status(400).json({ error: "Não foi possível abrir o portal de assinatura. Tente novamente." });
  }
});

router.post("/stripe/change-plan", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    const { priceId } = (req.body ?? {}) as { priceId?: string };
    if (!priceId) {
      res.status(400).json({ error: "priceId é obrigatório." });
      return;
    }

    if (!user.stripeCustomerId || !user.stripeSubscriptionId) {
      res.status(400).json({ error: "Nenhuma assinatura ativa encontrada para trocar de plano." });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const authorizedPrice = await getAuthorizedStripePrice(stripe, priceId);
    if (!authorizedPrice) {
      res.status(400).json({ error: "Plano de assinatura inválido ou indisponível." });
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const subscriptionCustomerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (subscriptionCustomerId !== user.stripeCustomerId) {
      res.status(403).json({ error: "A assinatura não pertence a esta conta." });
      return;
    }

    const subscriptionItem = subscription.items.data[0];
    if (!subscriptionItem) {
      res.status(400).json({ error: "A assinatura não possui um plano para atualizar." });
      return;
    }

    if (subscriptionItem.price.id === authorizedPrice.id) {
      res.json({
        changed: false,
        stripePriceId: authorizedPrice.id,
        maxBarbers: user.maxBarbers,
      });
      return;
    }

    const updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: subscriptionItem.id, price: authorizedPrice.id }],
      proration_behavior: "create_prorations",
    });

    const productId =
      typeof authorizedPrice.product === "string"
        ? authorizedPrice.product
        : authorizedPrice.product?.id;
    let maxBarbers: number | null = null;
    if (productId) {
      const product = await stripe.products.retrieve(productId);
      const parsed = parseInt(product.metadata?.maxBarbers ?? "", 10);
      maxBarbers = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    const periodEndValue =
      (updatedSubscription as any).current_period_end ??
      updatedSubscription.items?.data?.[0]?.current_period_end;
    const periodEnd = periodEndValue ? new Date(periodEndValue * 1000) : null;

    await db.update(usersTable)
      .set({
        stripeSubscriptionId: updatedSubscription.id,
        stripePriceId: authorizedPrice.id,
        maxBarbers,
        stripeCurrentPeriodEnd: periodEnd,
      })
      .where(eq(usersTable.id, userId));

    res.json({
      changed: true,
      stripePriceId: authorizedPrice.id,
      maxBarbers,
      subscriptionDueDate: periodEnd?.toISOString() ?? null,
    });
  } catch (err: unknown) {
    const stripeError = err as { message?: string; code?: string };
    console.error("Stripe plan change failed", {
      code: stripeError.code,
      message: stripeError.message,
    });
    res.status(400).json({ error: "Não foi possível trocar de plano. Tente novamente." });
  }
});

export default router;
