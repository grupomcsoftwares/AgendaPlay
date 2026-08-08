const FALLBACK_BASE = "https://agendaplay.net";

export const PROD_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN || "agendaplay.net"}`;
export const PROD_HOSTNAME = new URL(PROD_BASE).hostname;

const ALLOWED_HOSTNAMES = new Set([
  PROD_HOSTNAME,
  "agendaplay.net",
  "www.agendaplay.net",
]);

/**
 * Only allow HTTPS URLs that belong to AgendaPlay, and normalize aliases to
 * the configured app host before the WebView receives them.
 */
export function normalizeAppUrl(rawUrl?: string | null): string | null {
  const base = new URL(PROD_BASE || FALLBACK_BASE);
  if (!rawUrl) return base.toString();

  let candidate: URL;
  try {
    candidate = new URL(rawUrl);
  } catch {
    return null;
  }

  if (candidate.protocol !== "https:" || !ALLOWED_HOSTNAMES.has(candidate.hostname)) {
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