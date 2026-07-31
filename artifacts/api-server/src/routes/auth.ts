import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { SessionData } from "express-session";
import { getUncachableStripeClient } from "../stripeClient.js";

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

const TRIAL_DAYS = 7;

function normalizeCpf(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
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

function getAccountStatus(user: { trialStartedAt: Date; stripeSubscriptionId: string | null; stripeCurrentPeriodEnd: Date | null; subscriptionExpiresAt?: Date | null; maxBarbers?: number | null }) {
  const trialStarted = new Date(user.trialStartedAt);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceTrial = Math.floor((now.getTime() - trialStarted.getTime()) / msPerDay);
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceTrial);
  const trialExpired = trialDaysLeft === 0;

  // Stripe period end takes priority; fall back to manually-set expiry date
  const periodEnd = user.stripeCurrentPeriodEnd
    ? new Date(user.stripeCurrentPeriodEnd)
    : user.subscriptionExpiresAt
      ? new Date(user.subscriptionExpiresAt)
      : null;

  const daysUntilPeriodEnd = periodEnd
    ? Math.max(0, Math.floor((periodEnd.getTime() - now.getTime()) / msPerDay))
    : null;

  const hasActiveSubscription = !!user.stripeSubscriptionId || !!user.subscriptionExpiresAt;

  return {
    trialDaysLeft,
    trialExpired,
    hasActiveSubscription,
    canAccess: !trialExpired || hasActiveSubscription,
    maxBarbers: user.maxBarbers ?? null,
    subscriptionDueDate: periodEnd?.toISOString() ?? null,
    subscriptionDaysLeft: daysUntilPeriodEnd,
  };
}

router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const { email, cpf, password, barbershopName, ownerName } = req.body as {
    email?: string;
    cpf?: string;
    password?: string;
    barbershopName?: string;
    ownerName?: string;
  };

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedCpf = normalizeCpf(cpf);

  if (!normalizedEmail || !normalizedCpf || !password || !barbershopName || !ownerName) {
    res.status(400).json({ error: "Todos os campos são obrigatórios." });
    return;
  }

  if (!isValidCpf(normalizedCpf)) {
    res.status(400).json({ error: "Informe um CPF válido." });
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

  const existingCpf = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.cpf, normalizedCpf))
    .limit(1);
  if (existingCpf.length > 0) {
    res.status(409).json({ error: "Este CPF já está cadastrado em uma conta." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email: normalizedEmail,
    cpf: normalizedCpf,
    passwordHash,
    barbershopName,
    ownerName,
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

  const [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }

  req.session.userId = user.id;
  const status = getAccountStatus(user);

  const payload = {
    id: user.id,
    email: user.email,
    barbershopName: user.barbershopName,
    ownerName: user.ownerName,
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
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end
          ? new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000)
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

  const status = getAccountStatus(user);

  res.json({
    id: user.id,
    email: user.email,
    barbershopName: user.barbershopName,
    ownerName: user.ownerName,
    slug: user.slug,
    trialStartedAt: user.trialStartedAt,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    ...status,
  });
});

export { getAccountStatus };
export default router;
