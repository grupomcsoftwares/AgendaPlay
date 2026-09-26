import { createHmac } from "node:crypto";

export const SESSION_COOKIE_NAME = "connect.sid";

/**
 * Native clients receive an explicit Cookie header value rather than a
 * browser Set-Cookie header. Keeping this value name/value-only makes it
 * host-only by construction and prevents accidental Domain attributes.
 */
export function getNativeSessionCookie(
  sessionId: string,
  secret: string | undefined,
): string | null {
  if (!secret) return null;
  const signature = createHmac("sha256", secret)
    .update(sessionId)
    .digest("base64")
    .replace(/=+$/, "");
  return `${SESSION_COOKIE_NAME}=s:${sessionId}.${signature}`;
}
