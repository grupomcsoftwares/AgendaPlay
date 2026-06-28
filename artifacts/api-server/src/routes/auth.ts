import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { SessionData } from "express-session";

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "barbearia";
}

async function uniqueSlug(db_: typeof db, base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const [existing] = await db_.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.slug, slug)).limit(1);
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
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
  slug: usersTable.slug,
  trialStartedAt: usersTable.trialStartedAt,
  stripeCustomerId: usersTable.stripeCustomerId,
  stripeSubscriptionId: usersTable.stripeSubscriptionId,
  stripePriceId: usersTable.stripePriceId,
  stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
  maxBarbers: usersTable.maxBarbers,
  createdAt: usersTable.createdAt,
};

const TRIAL_DAYS = 7;

function getAccountStatus(user: { trialStartedAt: Date; stripeSubscriptionId: string | null; stripeCurrentPeriodEnd: Date | null; maxBarbers?: number | null }) {
  const trialStarted = new Date(user.trialStartedAt);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceTrial = Math.floor((now.getTime() - trialStarted.getTime()) / msPerDay);
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceTrial);
  const trialExpired = trialDaysLeft === 0;

  const periodEnd = user.stripeCurrentPeriodEnd ? new Date(user.stripeCurrentPeriodEnd) : null;
  const daysUntilPeriodEnd = periodEnd
    ? Math.max(0, Math.floor((periodEnd.getTime() - now.getTime()) / msPerDay))
    : null;

  return {
    trialDaysLeft,
    trialExpired,
    hasActiveSubscription: !!user.stripeSubscriptionId,
    canAccess: !trialExpired || !!user.stripeSubscriptionId,
    maxBarbers: user.maxBarbers ?? null,
    subscriptionDueDate: periodEnd?.toISOString() ?? null,
    subscriptionDaysLeft: daysUntilPeriodEnd,
  };
}

router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const { email, password, barbershopName, ownerName } = req.body as {
    email?: string;
    password?: string;
    barbershopName?: string;
    ownerName?: string;
  };

  if (!email || !password || !barbershopName || !ownerName) {
    res.status(400).json({ error: "Todos os campos são obrigatórios." });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) {
    res.status(409).json({ error: "E-mail já cadastrado." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const baseSlug = generateSlug(barbershopName);
  const slug = await uniqueSlug(db, baseSlug);
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    passwordHash,
    barbershopName,
    ownerName,
    slug,
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

  const [user] = await db.select(userCols).from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Não autenticado." });
    return;
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
