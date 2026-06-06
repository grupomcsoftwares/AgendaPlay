import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, settingsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/b/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug ?? "").trim().toLowerCase();
  if (!slug) {
    res.status(400).json({ error: "Slug obrigatório" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, barbershopName: usersTable.barbershopName, slug: usersTable.slug })
    .from(usersTable)
    .where(eq(usersTable.slug, slug))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Barbearia não encontrada" });
    return;
  }

  const [settings] = await db
    .select({ logoUrl: settingsTable.logoUrl })
    .from(settingsTable)
    .where(eq(settingsTable.userId, user.id))
    .limit(1);

  res.json({
    shopId: user.id,
    barbershopName: user.barbershopName,
    slug: user.slug,
    logoUrl: settings?.logoUrl ?? null,
  });
});

export default router;
