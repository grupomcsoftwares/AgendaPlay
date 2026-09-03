import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { recordPresenceHeartbeat } from "@workspace/api-client-react";
import { useLocation } from "wouter";

export type AuthUser = {
  id: string;
  email: string;
  barbershopName: string;
  ownerName: string;
  phone?: string | null;
  slug?: string | null;
  trialStartedAt: string;
  trialEligible: boolean;
  returningCustomer: boolean;
  trialDaysLeft: number;
  trialExpired: boolean;
  hasActiveSubscription: boolean;
  canAccess: boolean;
  subscriptionDueDate?: string | null;
  subscriptionDaysLeft?: number | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePaymentFailing?: boolean;
  pastDue?: boolean;
  isSystemAdmin?: boolean;
  firstMonthDiscountEligible: boolean;
  deletionScheduledAt?: string | null;
  deletionDaysLeft?: number | null;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; barbershopName: string; ownerName: string; phone: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthState | null>(null);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ACCESS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function isPublicRoute(pathname: string): boolean {
  const path = pathname.split("?")[0];

  return (
    path === "/" ||
    path === "/login" ||
    path === "/register" ||
    path === "/subscribe" ||
    path === "/booking" ||
    path.startsWith("/b/") ||
    path.startsWith("/agendamento/") ||
    path.startsWith("/fila-espera/")
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const [location] = useLocation();

  const clearAccountCache = useCallback(() => {
    queryClient.clear();
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("barber_") || key.startsWith("notif_gate_"))) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Storage may be unavailable in private browsing; the query cache is still cleared.
    }
  }, [queryClient]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/me`, {
        credentials: "include",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (res.ok) {
        let data = await res.json();
        // Server-side sync is now handled in /auth/me itself; no client-side sync needed.
        setUser(data);
        return data as AuthUser;
      } else if (res.status === 401) {
        setUser(null);
      }
      // on network errors or other non-401 failures, keep current state
    } catch {
      // network error — keep current user state (don't force logout)
    }
    return null;
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!user || isPublicRoute(location)) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };

    const timer = window.setInterval(refreshWhenVisible, ACCESS_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [location, refresh, user?.id]);

  useEffect(() => {
    if (!user) return;

    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      void recordPresenceHeartbeat({ credentials: "include" }).catch(() => {
        // Presence is best-effort and will recover on the next heartbeat.
      });
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 20_000);
    document.addEventListener("visibilitychange", heartbeat);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string) => {
    // Never let data from the previous account remain visible while logging in.
    clearAccountCache();
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao fazer login.");
    }
    const data = await res.json();
    setUser(data);
  }, [clearAccountCache]);

  const register = useCallback(async (data: { email: string; password: string; barbershopName: string; ownerName: string; phone: string }) => {
    // A newly created account must start with an empty client cache.
    clearAccountCache();
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao criar conta.");
    }
    const user = await res.json();
    setUser(user);
    return user as AuthUser;
  }, [clearAccountCache]);

  const logout = useCallback(async () => {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    clearAccountCache();
    setUser(null);
  }, [clearAccountCache]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
