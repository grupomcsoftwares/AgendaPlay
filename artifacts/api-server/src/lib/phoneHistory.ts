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

export async function isAccountPhoneTrialEligible(
  value: unknown,
  hasFormerPhoneHash: (phoneHash: string) => Promise<boolean>,
): Promise<boolean> {
  const phone = normalizeAccountPhone(value);
  if (!phone) {
    throw new Error("A valid phone is required to check trial eligibility");
  }

  return !(await hasFormerPhoneHash(getAccountPhoneHash(phone)));
}

export async function rememberFormerAccountPhone(
  value: unknown,
  savePhoneHash: (phoneHash: string) => Promise<void>,
): Promise<void> {
  const phone = normalizeAccountPhone(value);
  if (!phone) return;

  await savePhoneHash(getAccountPhoneHash(phone));
}
