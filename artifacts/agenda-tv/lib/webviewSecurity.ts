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
const isDevelopmentBuild =
  typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV === "development";

// The Replit preview host is needed by the development workflow, but a
// production bundle always falls back to the public AgendaPlay domain.
export const PROD_HOSTNAME =
  isDevelopmentBuild && isPreviewHost ? configuredHostname : "agendaplay.net";
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
  // normalizeAppUrl intentionally supplies the app base when no URL is
  // provided. A missing URL is not a valid WebView navigation or message
  // source, however.
  return typeof rawUrl === "string" && rawUrl.length > 0 && normalizeAppUrl(rawUrl) !== null;
}

export function isAllowedApkUrl(rawUrl?: unknown): rawUrl is string {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 2048) return false;
  try {
    const candidate = new URL(rawUrl);
    return (
      candidate.protocol === "https:" &&
      ALLOWED_HOSTNAMES.has(candidate.hostname.toLowerCase()) &&
      (candidate.port === "" || candidate.port === "443") &&
      candidate.username === "" &&
      candidate.password === "" &&
      candidate.pathname === "/api/app-download.apk" &&
      candidate.search === "" &&
      candidate.hash === ""
    );
  } catch {
    return false;
  }
}

export function isTrustedWebViewMessageOrigin(
  messageUrl?: string | null,
  currentUrl?: string | null,
): boolean {
  if (!isAllowedAppUrl(messageUrl) || !isAllowedAppUrl(currentUrl)) return false;

  try {
    const messageOrigin = new URL(messageUrl!).origin;
    const currentOrigin = new URL(currentUrl!).origin;
    return messageOrigin === currentOrigin;
  } catch {
    return false;
  }
}

export type NativePushAction = "subscribe" | "unsubscribe" | "status";

export function parseNativePushMessage(
  rawData: string,
): { action: NativePushAction } | null {
  try {
    const parsed: unknown = JSON.parse(rawData);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const message = parsed as Record<string, unknown>;
    const keys = Object.keys(message);
    if (keys.length !== 2 || keys.some((key) => key !== "type" && key !== "action")) {
      return null;
    }
    if (message.type !== "AGENDAPLAY_NATIVE_PUSH") return null;

    const action = message.action;
    if (action !== "subscribe" && action !== "unsubscribe" && action !== "status") {
      return null;
    }
    return { action };
  } catch {
    return null;
  }
}

export function parseNativeWebError(rawData: string): string | null {
  try {
    const parsed: unknown = JSON.parse(rawData);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const message = parsed as Record<string, unknown>;
    const keys = Object.keys(message);
    if (
      message.type !== "AGENDAPLAY_WEB_ERROR" ||
      keys.some((key) => !["type", "message", "componentStack"].includes(key)) ||
      (message.componentStack !== undefined && typeof message.componentStack !== "string") ||
      (typeof message.componentStack === "string" && message.componentStack.length > 20_000) ||
      typeof message.message !== "string" ||
      message.message.length === 0 ||
      message.message.length > 500
    ) {
      return null;
    }
    return message.message;
  } catch {
    return null;
  }
}