import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.SYSTEM_ADMIN_EMAILS ?? "")
      .split(/[,\n;]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSystemAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return configuredAdminEmails().has(email.trim().toLowerCase());
}

export async function requireSystemAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || !isSystemAdminEmail(user.email)) {
    res.status(403).json({ error: "Acesso restrito à administração do AgendaPlay." });
    return;
  }

  next();
}