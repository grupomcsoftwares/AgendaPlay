import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { recordPresenceHeartbeat } from "@workspace/api-client-react";
import { PROD_BASE } from "@/lib/webviewSecurity";

const API_BASE = `${PROD_BASE}/api`;
const USER_KEY = "@agendaplay/user";
const COOKIE_KEY = "@agendaplay/session_cookie";
const SESSION_COOKIE_NAME = "connect.sid";

function normalizeSessionCookie(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(/;\s*/)[0]?.trim();
  if (!first) return null;
  const separator = first.indexOf("=");
  if (separator <= 0) return null;
  const name = first.slice(0, separator);
  const value = first.slice(separator + 1);
  if (
    name !== SESSION_COOKIE_NAME ||
    !value ||
    value.length > 2048 ||
    /[\s;]/.test(value) ||
    !/^s(?::|%3a)/i.test(value)
  ) {
    return null;
  }
  return `${SESSION_COOKIE_NAME}=${value}`;
}

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
  isSystemAdmin?: boolean;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  getSessionCookie: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.multiGet([USER_KEY, COOKIE_KEY]).then(async ([userEntry, cookieEntry]) => {
      const raw = userEntry[1];
      const cookie = normalizeSessionCookie(cookieEntry[1]);
      if (raw && cookie && mounted) {
        try {
          setUser(JSON.parse(raw));
        } catch {}
      }

      // Revalidate the cached account before showing the home screen. This
      // prevents an expired subscription from keeping the TV queue open.
      if (cookie) {
        try {
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: {
              Cookie: cookie,
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (mounted) {
              setUser(data);
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(data));
            }
          } else if (res.status === 401 && mounted) {
            setUser(null);
            await AsyncStorage.multiRemove([USER_KEY, COOKIE_KEY]);
          }
        } catch {
          // Keep cached state when the server is temporarily unreachable.
        }
      } else if (mounted && (raw || cookieEntry[1])) {
        // Never restore a cached user without the matching session cookie.
        // Otherwise the native menu looks authenticated while the WebView
        // correctly receives the login page.
        await AsyncStorage.multiRemove([USER_KEY, COOKIE_KEY]);
      }
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AgendaPlay-Native": "1",
      },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "E-mail ou senha incorretos.");
    }
    // Capture Set-Cookie header for WebView session sync
    const responseData = await res.json();
    const cookieHeader =
      normalizeSessionCookie(responseData.sessionCookie) ??
      normalizeSessionCookie(res.headers.get("set-cookie"));
    if (!cookieHeader) {
      throw new Error("Não foi possível preparar a sessão do aplicativo. Tente fazer login novamente.");
    }

    await AsyncStorage.setItem(COOKIE_KEY, cookieHeader);

    // Confirm the server accepts the exact cookie that will be handed to the
    // WebView. A native login must never finish in a half-authenticated state.
    const sessionCheck = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Cookie: cookieHeader,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!sessionCheck.ok) {
      await AsyncStorage.multiRemove([USER_KEY, COOKIE_KEY]);
      throw new Error(
        sessionCheck.status === 401
          ? "A sessão não pôde ser sincronizada com o aplicativo. Tente novamente."
          : "Não foi possível validar a sessão do aplicativo. Tente novamente.",
      );
    }

    const { sessionCookie: _sessionCookie, ...data } = responseData;
    setUser(data);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data));
  }, []);

  const refresh = useCallback(async () => {
    const cookie = normalizeSessionCookie(await AsyncStorage.getItem(COOKIE_KEY));
    if (!cookie) return;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          Cookie: cookie,
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data));
      } else if (res.status === 401) {
        setUser(null);
        await AsyncStorage.multiRemove([USER_KEY, COOKIE_KEY]);
      }
    } catch {
      // Keep the current state during a temporary network interruption.
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh, user]);

  useEffect(() => {
    if (!user) return;

    let currentState = AppState.currentState;
    const heartbeat = async () => {
      if (currentState !== "active") return;
      const cookie = await AsyncStorage.getItem(COOKIE_KEY);
      if (!cookie) return;
      await recordPresenceHeartbeat({
        headers: { Cookie: cookie },
      }).catch(() => {
        // Presence is best-effort and will recover on the next heartbeat.
      });
    };

    void heartbeat();
    const timer = setInterval(() => {
      void heartbeat();
    }, 20_000);
    const subscription = AppState.addEventListener("change", (nextState) => {
      currentState = nextState;
      if (nextState === "active") void heartbeat();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [user?.id]);

  const logout = useCallback(async () => {
    const cookie = normalizeSessionCookie(await AsyncStorage.getItem(COOKIE_KEY));
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: cookie ? { Cookie: cookie } : undefined,
    }).catch(() => {});
    setUser(null);
    await AsyncStorage.removeItem(USER_KEY);
    await AsyncStorage.removeItem(COOKIE_KEY);
  }, []);

  const getSessionCookie = useCallback(async () => {
    const raw = await AsyncStorage.getItem(COOKIE_KEY);
    const cookie = normalizeSessionCookie(raw);
    if (!cookie && raw) await AsyncStorage.removeItem(COOKIE_KEY);
    return cookie;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, getSessionCookie }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
