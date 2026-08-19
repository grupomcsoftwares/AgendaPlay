import { createHmac } from "node:crypto";

export type AccountDocumentType = "cpf" | "cnpj";

export function normalizeAccountDocument(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export function getAccountDocumentHash(
  documentType: AccountDocumentType,
  normalizedDocument: string,
): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required to protect account document history");
  }

  return createHmac("sha256", secret)
    .update(`agendaplay:former-account:${documentType}:${normalizedDocument}`)
    .digest("hex");
}