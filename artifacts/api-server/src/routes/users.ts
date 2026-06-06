import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { UpdateUserSlugBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

router.patch("/users/slug", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateUserSlugBody.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    res.status(400).json({ error: firstIssue?.message ?? parsed.error.message });
    return;
  }

  const { slug } = parsed.data;

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

  const [updated] = await db
    .update(usersTable)
    .set({ slug })
    .where(eq(usersTable.id, userId))
    .returning({ slug: usersTable.slug });

  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  res.json({ slug: updated.slug });
});

export default router;
