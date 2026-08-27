import { createHmac } from "node:crypto";

export function normalizeAccountPhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export function getAccountPhoneHash(phone: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required to protect account phone history");
  }

  return createHmac("sha256", secret)
    .update(`agendaplay:former-account-phone:${phone}`)
    .digest("hex");
}