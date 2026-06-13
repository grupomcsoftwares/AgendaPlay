import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  appointmentsTable,
  clientsTable,
  servicesTable,
  barbersTable,
  settingsTable,
  comboDiscountsTable,
  loyaltyPointsTable,
  subscriptionPlansTable,
  clientSubscriptionsTable,
  queueTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

router.patch("/users/slug", requireAuth, async (req, res): Promise<void> => {
  const { slug } = req.body as { slug?: string };

  if (!slug || typeof slug !== "string") {
    res.status(400).json({ error: "Slug inválido." });
    return;
  }

  if (!SLUG_RE.test(slug)) {
    res.status(400).json({
      error: "O endereço só pode conter letras minúsculas, números e hífens, e não pode começar ou terminar com hífen.",
    });
    return;
  }

  const userId = req.session.userId!;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.slug, slug))
    .limit(1);

  if (existing && existing.id !== userId) {
    res.status(409).json({ error: "Este endereço já está em uso. Escolha outro." });
    return;
  }

  const [current] = await db
    .select({ slug: usersTable.slug })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const [updated] = await db
    .update(usersTable)
    .set({ slug, previousSlug: current?.slug ?? null })
    .where(eq(usersTable.id, userId))
    .returning({ slug: usersTable.slug });

  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  res.json({ slug: updated.slug });
});

router.delete("/users/account", requireAuth, async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email e senha são obrigatórios." });
    return;
  }

  const userId = req.session.userId!;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  if (user.email.toLowerCase() !== email.toLowerCase()) {
    res.status(401).json({ error: "Email ou senha incorretos." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Email ou senha incorretos." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(queueTable).where(eq(queueTable.userId, userId));
    await tx.delete(clientSubscriptionsTable).where(eq(clientSubscriptionsTable.userId, userId));
    await tx.delete(loyaltyPointsTable).where(eq(loyaltyPointsTable.userId, userId));
    await tx.delete(appointmentsTable).where(eq(appointmentsTable.userId, userId));
    await tx.delete(clientsTable).where(eq(clientsTable.userId, userId));
    await tx.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.userId, userId));
    await tx.delete(comboDiscountsTable).where(eq(comboDiscountsTable.userId, userId));
    await tx.delete(servicesTable).where(eq(servicesTable.userId, userId));
    await tx.delete(barbersTable).where(eq(barbersTable.userId, userId));
    await tx.delete(settingsTable).where(eq(settingsTable.userId, userId));
    await tx.delete(usersTable).where(eq(usersTable.id, userId));
  });

  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  res.clearCookie("connect.sid");
  res.status(204).send();
});

export default router;
