import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type AuthUser = {
  id: string;
  email: string;
  barbershopName: string;
  ownerName: string;
  phone?: string | null;
  slug?: string | null;
  trialStartedAt: string;
  trialDaysLeft: number;
  trialExpired: boolean;
  hasActiveSubscription: boolean;
  canAccess: boolean;
  subscriptionDueDate?: string | null;
  subscriptionDaysLeft?: number | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; documentType: "cpf" | "cnpj"; documentNumber: string; password: string; barbershopName: string; ownerName: string; phone: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

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
      const res = await fetch(`${BASE}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        let data = await res.json();
        // Server-side sync is now handled in /auth/me itself; no client-side sync needed.
        setUser(data);
      } else if (res.status === 401) {
        setUser(null);
      }
      // on network errors or other non-401 failures, keep current state
    } catch {
      // network error — keep current user state (don't force logout)
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

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

  const register = useCallback(async (data: { email: string; documentType: "cpf" | "cnpj"; documentNumber: string; password: string; barbershopName: string; ownerName: string; phone: string }) => {
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
