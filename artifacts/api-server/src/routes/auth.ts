import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { formerAccountPhonesTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { SessionData } from "express-session";
import type Stripe from "stripe";
import { createHmac } from "node:crypto";
import { getUncachableStripeClient } from "../stripeClient.js";
import { getAccountStatus } from "./accountStatus.js";
import { isSystemAdminEmail } from "../lib/systemAdmin.js";
import { getStripePaymentFailureStatus } from "../lib/stripeSubscriptionStatus.js";
import { getAccountPhoneHash, normalizeAccountPhone } from "../lib/phoneHistory.js";
import { cleanupExpiredAccountByEmail } from "../services/subscriptionCleanup.js";

const SESSION_COOKIE_NAME = "connect.sid";

function getNativeSessionCookie(sessionId: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const signature = createHmac("sha256", secret)
    .update(sessionId)
    .digest("base64")
    .replace(/=+$/, "");
  return `${SESSION_COOKIE_NAME}=s:${sessionId}.${signature}`;
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const router: IRouter = Router();

// Explicit column list that excludes `previousSlug` so queries work even when
// the production database has not yet had that column added via a Publish migration.
const userCols = {
  id: usersTable.id,
  email: usersTable.email,
  passwordHash: usersTable.passwordHash,
  barbershopName: usersTable.barbershopName,
  ownerName: usersTable.ownerName,
  phone: usersTable.phone,
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
  subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
  maxBarbers: usersTable.maxBarbers,
  createdAt: usersTable.createdAt,
};

function normalizePhone(value: unknown): string {
  return normalizeAccountPhone(value);
}

async function reconcileActiveSubscription(user: {
  id: string;
  email: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentFailing: boolean;
  hasEverPaid: boolean;
}): Promise<void> {
  try {
    const stripe = await getUncachableStripeClient();
    const customerIds = new Set<string>();
    if (user.stripeCustomerId) customerIds.add(user.stripeCustomerId);

    // A checkout can create a second Stripe customer when the original
    // customer belongs to another Stripe environment. Search by the account
    // email as a safe recovery path before treating the payment as missing.
    const matchingCustomers = await stripe.customers.list({
      email: user.email,
      limit: 20,
    });
    for (const customer of matchingCustomers.data) {
      customerIds.add(customer.id);
    }

    let matchedCustomerId: string | null = null;
    let subscription: Stripe.Subscription | undefined;
    for (const customerId of customerIds) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 20,
        });
        const activeSubscription = subscriptions.data.find(
          (item) => item.status === "active" || item.status === "trialing",
        );
        if (activeSubscription) {
          matchedCustomerId = customerId;
          subscription = activeSubscription;
          break;
        }
      } catch {
        // Ignore stale customer IDs and continue with email-matched customers.
      }
    }
    if (!subscription || !matchedCustomerId) {
      const pastDue = await getStripePaymentFailureStatus(stripe, user);
      if (pastDue !== null && pastDue !== user.stripePaymentFailing) {
        await db
          .update(usersTable)
          .set({ stripePaymentFailing: pastDue })
          .where(eq(usersTable.id, user.id));
      }
      return;
    }

    const priceItem = subscription.items.data[0];
    const stripePriceId = priceItem?.price?.id ?? null;
    const productId =
      typeof priceItem?.price?.product === "string"
        ? priceItem.price.product
        : priceItem?.price?.product?.id ?? null;
    let maxBarbers: number | null = null;

    if (productId) {
      try {
        const product = await stripe.products.retrieve(productId);
        const parsed = Number.parseInt(product.metadata?.maxBarbers ?? "", 10);
        maxBarbers = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      } catch {
        // The subscription itself is enough to grant access; plan metadata is optional.
      }
    }

    const currentPeriodEndValue =
      (subscription as unknown as { current_period_end?: number }).current_period_end ??
      subscription.items.data[0]?.current_period_end;
    const currentPeriodEnd = currentPeriodEndValue
      ? new Date(currentPeriodEndValue * 1000)
      : null;
    await db
      .update(usersTable)
      .set({
        stripeCustomerId: matchedCustomerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId,
        maxBarbers,
        stripeCurrentPeriodEnd: currentPeriodEnd,
        stripePaymentFailing: false,
      })
      .where(eq(usersTable.id, user.id));

  } catch (error) {
    console.error("Stripe subscription reconciliation failed during login", {
      userId: user.id,
      message: error instanceof Error ? error.message : "unknown error",
    });
    return;
  }
}

router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const { email, password, barbershopName, ownerName, phone } = req.body as {
    email?: string;
    password?: string;
    barbershopName?: string;
    ownerName?: string;
    phone?: string;
  };

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedEmail || !password || !barbershopName?.trim() || !ownerName?.trim() || !normalizedPhone) {
    res.status(400).json({ error: "Todos os campos são obrigatórios." });
    return;
  }

  if (!/^\d{10,11}$/.test(normalizedPhone)) {
    res.status(400).json({ error: "Informe um telefone válido com DDD." });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
    return;
  }

  await cleanupExpiredAccountByEmail(normalizedEmail);

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(trim(${usersTable.email})) = ${normalizedEmail}`);
  if (existing.length > 0) {
    res.status(409).json({ error: "E-mail já cadastrado." });
    return;
  }

  let existingPhone = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(sql`regexp_replace(coalesce(${usersTable.phone}, ''), '[^0-9]', '', 'g') = ${normalizedPhone}`)
    .limit(1);
  if (existingPhone.length > 0) {
    await cleanupExpiredAccountByEmail(existingPhone[0]!.email);
    existingPhone = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(sql`regexp_replace(coalesce(${usersTable.phone}, ''), '[^0-9]', '', 'g') = ${normalizedPhone}`)
      .limit(1);
    if (existingPhone.length > 0) {
      res.status(409).json({ error: "Este telefone já está cadastrado em uma conta." });
      return;
    }
  }

  const phoneHash = getAccountPhoneHash(normalizedPhone);
  const [formerPhone] = await db
    .select({ id: formerAccountPhonesTable.id })
    .from(formerAccountPhonesTable)
    .where(eq(formerAccountPhonesTable.phoneHash, phoneHash))
    .limit(1);
  const trialEligible = !formerPhone;

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email: normalizedEmail,
    documentType: "phone",
    passwordHash,
    barbershopName: barbershopName.trim(),
    ownerName: ownerName.trim(),
    phone: normalizedPhone,
    trialEligible,
    // New accounts start without a public name-based link. The owner can
    // choose a custom slug later from Settings.
    slug: null,
  }).returning();

  const status = getAccountStatus(user);

  const payload = {
    id: user.id,
    email: user.email,
    barbershopName: user.barbershopName,
    ownerName: user.ownerName,
    phone: user.phone,
    slug: user.slug,
    trialStartedAt: user.trialStartedAt,
    isSystemAdmin: isSystemAdminEmail(user.email),
    ...status,
  };

  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "session.save failed on register");
      res.status(500).json({ error: "Erro ao salvar sessão." });
      return;
    }
    res.status(201).json(payload);
  });
});

router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  await cleanupExpiredAccountByEmail(normalizedEmail);

  let [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (!user) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }

  await reconcileActiveSubscription(user);
  if (user.stripeCustomerId) {
    const [reconciledUser] = await db
      .select(userCols)
      .from(usersTable)
      .where(eq(usersTable.id, user.id));
    if (reconciledUser) user = reconciledUser;
  }

  req.session.userId = user.id;
  const status = getAccountStatus(user);

  const payload = {
    id: user.id,
    email: user.email,
    barbershopName: user.barbershopName,
    ownerName: user.ownerName,
    phone: user.phone,
    slug: user.slug,
    trialStartedAt: user.trialStartedAt,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripePaymentFailing: user.stripePaymentFailing,
    pastDue: user.stripePaymentFailing,
    isSystemAdmin: isSystemAdminEmail(user.email),
    ...status,
  };

  req.session.regenerate((regenerateErr) => {
    if (regenerateErr) {
      req.log.error({ err: regenerateErr }, "session.regenerate failed on login");
      res.status(500).json({ error: "Erro ao salvar sessão." });
      return;
    }
    req.session.userId = user.id;
    req.session.save((saveErr) => {
      if (saveErr) {
        req.log.error({ err: saveErr }, "session.save failed on login");
        res.status(500).json({ error: "Erro ao salvar sessão." });
        return;
      }
      const nativeSessionCookie =
        req.get("x-agendaplay-native") === "1"
          ? getNativeSessionCookie(req.sessionID)
          : null;
      res.json({
        ...payload,
        ...(nativeSessionCookie ? { sessionCookie: nativeSessionCookie } : {}),
      });
    });
  });
});

router.post("/auth/logout", (req: Request, res: Response): void => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req: Request, res: Response): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  let [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  if (await cleanupExpiredAccountByEmail(user.email)) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Conta removida após o período de inatividade." });
    return;
  }

  // If the user has a Stripe subscription but no period-end date stored, try to
  // fetch it from Stripe now so subscriptionDaysLeft is always populated.
  if (user.stripeSubscriptionId && !user.stripeCurrentPeriodEnd && user.stripeCustomerId) {
    try {
      const stripe = await getUncachableStripeClient();
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 5,
      });
      if (subscriptions.data.length > 0) {
        const sub = subscriptions.data[0]!;
        const periodEndValue =
          (sub as unknown as { current_period_end?: number }).current_period_end ??
          sub.items.data[0]?.current_period_end;
        const periodEnd = periodEndValue
          ? new Date(periodEndValue * 1000)
          : null;
        if (periodEnd) {
          await db.update(usersTable)
            .set({ stripeCurrentPeriodEnd: periodEnd })
            .where(eq(usersTable.id, user.id));
          // Re-read the updated row so status reflects the new date
          const [updated] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, user.id));
          if (updated) user = updated;
        }
      }
    } catch {
      // Stripe unavailable — proceed with current data
    }
  }

  let status = getAccountStatus(user);
  if (!status.hasActiveSubscription && status.trialExpired) {
    await reconcileActiveSubscription(user);
    const [reconciledUser] = await db
      .select(userCols)
      .from(usersTable)
      .where(eq(usersTable.id, user.id));
    if (reconciledUser) {
      user = reconciledUser;
      status = getAccountStatus(user);
    }
  }

  res.json({
    id: user.id,
    email: user.email,
    barbershopName: user.barbershopName,
    ownerName: user.ownerName,
    phone: user.phone,
    slug: user.slug,
    trialStartedAt: user.trialStartedAt,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripePaymentFailing: user.stripePaymentFailing,
    pastDue: user.stripePaymentFailing,
    isSystemAdmin: isSystemAdminEmail(user.email),
    ...status,
  });
});

export { getAccountStatus };
export default router;
