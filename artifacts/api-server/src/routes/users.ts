import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  appointmentsTable,
  clientsTable,
  servicesTable,
  barberServicesTable,
  barbersTable,
  settingsTable,
  comboDiscountsTable,
  loyaltyPointsTable,
  subscriptionPlansTable,
  clientSubscriptionsTable,
  queueTable,
  serviceDayPricingTable,
  pushSubscriptionsTable,
  slugRedirectsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";
import { requireActiveAccount } from "../middleware/accountActive.js";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

router.patch("/users/slug", requireAuth, requireActiveAccount, async (req, res): Promise<void> => {
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

  // All availability checks and writes happen inside one serialised transaction.
  // We lock the user row (SELECT FOR UPDATE) at the start so that two concurrent
  // renames on the same account cannot both read the same current slug and race
  // to record it in history — every intermediate slug is captured.
  //
  // Cross-user conflicts (two users racing for the same target slug) are caught
  // by the uniqueness checks inside the transaction; the UNIQUE constraints on
  // users.slug and slug_redirects.old_slug serve as the final safety net.
  class SlugError extends Error {
    constructor(public readonly statusCode: number, message: string) {
      super(message);
    }
  }

  try {
    const updated = await db.transaction(async (tx) => {
      // Lock this user's row for the duration of the transaction.
      const [current] = await tx
        .select({ slug: usersTable.slug })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update")
        .limit(1);

      if (!current) throw new SlugError(404, "Usuário não encontrado.");

      // Nothing to do if the slug is unchanged.
      if (current.slug === slug) return { slug };

      // Reject if the slug is already the active URL of another user.
      const [existingUser] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.slug, slug))
        .limit(1);

      if (existingUser && existingUser.id !== userId) {
        throw new SlugError(409, "Este endereço já está em uso. Escolha outro.");
      }

      // Reject if the slug is reserved in another user's redirect history.
      // Historical slugs belong to the shop that published them; only that shop
      // may reclaim them.
      const [redirectEntry] = await tx
        .select({ userId: slugRedirectsTable.userId })
        .from(slugRedirectsTable)
        .where(eq(slugRedirectsTable.oldSlug, slug))
        .limit(1);

      if (redirectEntry && redirectEntry.userId !== userId) {
        throw new SlugError(409, "Este endereço já está em uso. Escolha outro.");
      }

      // Perform the rename.
      const [upd] = await tx
        .update(usersTable)
        .set({ slug, previousSlug: current.slug ?? null })
        .where(eq(usersTable.id, userId))
        .returning({ slug: usersTable.slug });

      if (!upd) throw new SlugError(404, "Usuário não encontrado.");

      // If the user is reclaiming one of their own old slugs, remove it from
      // the redirect table (it is the active slug again, not a historical one).
      if (redirectEntry?.userId === userId) {
        await tx
          .delete(slugRedirectsTable)
          .where(eq(slugRedirectsTable.oldSlug, slug));
      }

      // Record the outgoing slug so all previously published links keep working.
      if (current.slug) {
        await tx
          .insert(slugRedirectsTable)
          .values({ userId, oldSlug: current.slug })
          .onConflictDoNothing();
      }

      return upd;
    });

    res.json({ slug: updated.slug });
  } catch (err: unknown) {
    if (err instanceof SlugError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

router.delete("/users/account", requireAuth, async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || !password) {
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

  if (user.email.trim().toLowerCase() !== normalizedEmail) {
    res.status(401).json({ error: "Email ou senha incorretos." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Email ou senha incorretos." });
    return;
  }

  await db.transaction(async (tx) => {
    // These tables do not all have database-level cascades, so remove every
    // account-owned record explicitly before deleting the account itself.
    await tx.delete(queueTable).where(eq(queueTable.userId, userId));
    await tx.delete(clientSubscriptionsTable).where(eq(clientSubscriptionsTable.userId, userId));
    await tx.delete(loyaltyPointsTable).where(eq(loyaltyPointsTable.userId, userId));
    const accountAppointments = await tx
      .select({ cancelToken: appointmentsTable.cancelToken })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.userId, userId));
    const accountBarbers = await tx
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, userId));
    const accountServices = await tx
      .select({ id: servicesTable.id })
      .from(servicesTable)
      .where(eq(servicesTable.userId, userId));
    const cancelTokens = accountAppointments
      .map((appointment) => appointment.cancelToken)
      .filter((token): token is string => Boolean(token));
    const barberIds = accountBarbers.map((barber) => barber.id);
    const serviceIds = accountServices.map((service) => service.id);
    if (cancelTokens.length > 0) {
      await tx.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.cancelToken, cancelTokens));
    }
    await tx.delete(appointmentsTable).where(eq(appointmentsTable.userId, userId));
    await tx.delete(clientsTable).where(eq(clientsTable.userId, userId));
    await tx.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.userId, userId));
    await tx.delete(comboDiscountsTable).where(eq(comboDiscountsTable.userId, userId));
    await tx.delete(serviceDayPricingTable).where(eq(serviceDayPricingTable.userId, userId));
    if (barberIds.length > 0) {
      await tx.delete(barberServicesTable).where(inArray(barberServicesTable.barberId, barberIds));
    }
    if (serviceIds.length > 0) {
      await tx.delete(barberServicesTable).where(inArray(barberServicesTable.serviceId, serviceIds));
    }
    await tx.delete(servicesTable).where(eq(servicesTable.userId, userId));
    await tx.delete(barbersTable).where(eq(barbersTable.userId, userId));
    await tx.delete(slugRedirectsTable).where(eq(slugRedirectsTable.userId, userId));
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
