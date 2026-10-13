export type TvAccessUser = { canAccess: boolean } | null;

export type TvBlockedState = "session-disconnected" | "subscription-expired";

export function getTvBlockedState({
  isTv,
  requiresSession,
  loading,
  user,
  accountStatusValidated,
}: {
  isTv: boolean;
  requiresSession: boolean;
  loading: boolean;
  user: TvAccessUser;
  accountStatusValidated: boolean;
}): TvBlockedState | null {
  if (!isTv || !requiresSession || loading) return null;
  if (!user) return "session-disconnected";
  if (accountStatusValidated && !user.canAccess) return "subscription-expired";
  return null;
}

export function tvPageRequiresSession(url: string | null): boolean {
  if (!url) return false;
  try {
    return /^\/(queue|dashboard)(\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
