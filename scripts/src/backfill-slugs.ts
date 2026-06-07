import { db, usersTable } from "@workspace/db";
import { isNull, eq } from "drizzle-orm";

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "barbearia"
  );
}

async function uniqueSlug(base: string, takenSlugs: Set<string>): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (takenSlugs.has(slug)) {
    attempt++;
    slug = `${base}-${attempt}`;
  }
  return slug;
}

async function backfillSlugs() {
  console.log("Fetching users with NULL slug...");

  const nullSlugUsers = await db
    .select({ id: usersTable.id, barbershopName: usersTable.barbershopName })
    .from(usersTable)
    .where(isNull(usersTable.slug));

  if (nullSlugUsers.length === 0) {
    console.log("No users with NULL slug found. Nothing to do.");
    return;
  }

  console.log(`Found ${nullSlugUsers.length} user(s) to backfill.`);

  const takenSlugs = new Set<string>(
    (
      await db
        .select({ slug: usersTable.slug })
        .from(usersTable)
    )
      .map((r) => r.slug)
      .filter((s): s is string => s !== null)
  );

  let updated = 0;
  for (const user of nullSlugUsers) {
    const base = generateSlug(user.barbershopName);
    const slug = await uniqueSlug(base, takenSlugs);
    takenSlugs.add(slug);

    await db
      .update(usersTable)
      .set({ slug })
      .where(eq(usersTable.id, user.id));

    console.log(`  ✓ ${user.id} | "${user.barbershopName}" → /b/${slug}`);
    updated++;
  }

  console.log(`\nDone. ${updated} slug(s) backfilled.`);
}

backfillSlugs().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
