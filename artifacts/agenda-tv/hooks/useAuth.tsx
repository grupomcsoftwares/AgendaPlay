import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN || "mcagenda.replit.app"}/api`;
const USER_KEY = "@agendaplay/user";
const COOKIE_KEY = "@agendaplay/session_cookie";

export type AuthUser = {
  id: string;
  email: string;
  barbershopName: string;
  ownerName: string;
  slug?: string | null;
  trialStartedAt: string;
  trialDaysLeft: number;
  trialExpired: boolean;
  hasActiveSubscription: boolean;
  canAccess: boolean;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getSessionCookie: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(USER_KEY).then((raw) => {
      if (raw) {
        try {
          setUser(JSON.parse(raw));
        } catch {}
      }
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "E-mail ou senha incorretos.");
    }
    // Capture Set-Cookie header for WebView session sync
    const cookieHeader = res.headers.get("set-cookie");
    if (cookieHeader) {
      await AsyncStorage.setItem(COOKIE_KEY, cookieHeader);
    }
    const data = await res.json();
    setUser(data);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data));
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST" }).catch(() => {});
    setUser(null);
    await AsyncStorage.removeItem(USER_KEY);
    await AsyncStorage.removeItem(COOKIE_KEY);
  }, []);

  const getSessionCookie = useCallback(async () => {
    return AsyncStorage.getItem(COOKIE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getSessionCookie }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
