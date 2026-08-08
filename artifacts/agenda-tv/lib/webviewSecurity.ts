const configuredDomain = process.env.EXPO_PUBLIC_DOMAIN || "";
const configuredHostname = (() => {
  try {
    return new URL(
      configuredDomain.includes("://") ? configuredDomain : `https://${configuredDomain}`,
    ).hostname.toLowerCase();
  } catch {
    return "";
  }
})();
const isPreviewHost =
  configuredHostname === "localhost" ||
  configuredHostname.endsWith(".replit.dev") ||
  configuredHostname.endsWith(".replit.app") ||
  configuredHostname.endsWith(".riker.replit.dev");

// Production builds cannot turn an arbitrary EXPO_PUBLIC_DOMAIN into a
// trusted origin. Preview builds may use their own Replit host for testing.
export const PROD_HOSTNAME = isPreviewHost ? configuredHostname : "agendaplay.net";
export const PROD_BASE = `https://${PROD_HOSTNAME}`;

const ALLOWED_HOSTNAMES = new Set([PROD_HOSTNAME]);

/**
 * Only allow HTTPS URLs that belong to AgendaPlay, and normalize aliases to
 * the configured app host before the WebView receives them.
 */
export function normalizeAppUrl(rawUrl?: string | null): string | null {
  const base = new URL(PROD_BASE);
  if (!rawUrl) return base.toString();

  let candidate: URL;
  try {
    candidate = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    candidate.protocol !== "https:" ||
    !ALLOWED_HOSTNAMES.has(candidate.hostname.toLowerCase()) ||
    (candidate.port !== "" && candidate.port !== "443") ||
    candidate.username !== "" ||
    candidate.password !== ""
  ) {
    return null;
  }

  base.pathname = candidate.pathname;
  base.search = candidate.search;
  base.hash = candidate.hash;
  return base.toString();
}

export function isAllowedAppUrl(rawUrl?: string | null): boolean {
  return normalizeAppUrl(rawUrl) !== null;
}