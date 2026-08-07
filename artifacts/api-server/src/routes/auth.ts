import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { SessionData } from "express-session";
import type Stripe from "stripe";
import { getUncachableStripeClient } from "../stripeClient.js";
import { getAccountStatus } from "./accountStatus.js";

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
  stripeCustomerId: usersTable.stripeCustomerId,
  stripeSubscriptionId: usersTable.stripeSubscriptionId,
  stripePriceId: usersTable.stripePriceId,
  stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
  subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
  maxBarbers: usersTable.maxBarbers,
  createdAt: usersTable.createdAt,
};

function normalizeCpf(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function normalizeDocumentType(value: unknown): "cpf" | "cnpj" | null {
  if (value === "cpf" || value === "cnpj") return value;
  return null;
}

function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function reconcileActiveSubscription(user: {
  id: string;
  email: string;
  stripeCustomerId: string | null;
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
    if (!subscription || !matchedCustomerId) return;

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

function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  let firstSum = 0;
  for (let index = 0; index < 9; index += 1) {
    firstSum += Number(cpf[index]) * (10 - index);
  }
  const firstCheck = (firstSum * 10) % 11;
  if ((firstCheck === 10 ? 0 : firstCheck) !== Number(cpf[9])) return false;

  let secondSum = 0;
  for (let index = 0; index < 10; index += 1) {
    secondSum += Number(cpf[index]) * (11 - index);
  }
  const secondCheck = (secondSum * 10) % 11;
  return (secondCheck === 10 ? 0 : secondCheck) === Number(cpf[10]);
}

function isValidCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calculateDigit = (value: string, weights: number[]) => {
    const sum = value.split("").reduce((total, digit, index) => total + Number(digit) * weights[index]!, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (firstDigit !== Number(cnpj[12])) return false;

  const secondDigit = calculateDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return secondDigit === Number(cnpj[13]);
}

router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const { email, documentType: rawDocumentType, documentNumber, cpf, password, barbershopName, ownerName, phone } = req.body as {
    email?: string;
    documentType?: string;
    documentNumber?: string;
    cpf?: string;
    password?: string;
    barbershopName?: string;
    ownerName?: string;
    phone?: string;
  };

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  // `cpf` remains accepted for one compatibility window for older clients.
  const documentType = rawDocumentType === undefined ? "cpf" : normalizeDocumentType(rawDocumentType);
  const normalizedDocument = normalizeCpf(documentNumber ?? cpf);
  const normalizedPhone = normalizePhone(phone);
  const phoneDigits = normalizedPhone.replace(/\D/g, "");

  if (!normalizedEmail || !documentType || !normalizedDocument || !password || !barbershopName?.trim() || !ownerName?.trim() || !normalizedPhone) {
    res.status(400).json({ error: "Todos os campos são obrigatórios." });
    return;
  }

  if (!/^\d{10,11}$/.test(phoneDigits)) {
    res.status(400).json({ error: "Informe um telefone válido com DDD." });
    return;
  }

  const validDocument = documentType === "cpf"
    ? isValidCpf(normalizedDocument)
    : isValidCnpj(normalizedDocument);
  if (!validDocument) {
    res.status(400).json({ error: `Informe um ${documentType.toUpperCase()} válido.` });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(trim(${usersTable.email})) = ${normalizedEmail}`);
  if (existing.length > 0) {
    res.status(409).json({ error: "E-mail já cadastrado." });
    return;
  }

  const existingDocument = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(documentType === "cpf" ? usersTable.cpf : usersTable.cnpj, normalizedDocument))
    .limit(1);
  if (existingDocument.length > 0) {
    res.status(409).json({ error: `Este ${documentType.toUpperCase()} já está cadastrado em uma conta.` });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email: normalizedEmail,
    documentType,
    cpf: documentType === "cpf" ? normalizedDocument : null,
    cnpj: documentType === "cnpj" ? normalizedDocument : null,
    passwordHash,
    barbershopName: barbershopName.trim(),
    ownerName: ownerName.trim(),
    phone: normalizedPhone,
    // New accounts start without a public name-based link. The owner can
    // choose a custom slug later from Settings.
    slug: null,
  }).returning();

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

  let [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
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
    ...status,
  };

  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "session.save failed on login");
      res.status(500).json({ error: "Erro ao salvar sessão." });
      return;
    }
    res.json(payload);
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
    ...status,
  });
});

export { getAccountStatus };
export default router;
