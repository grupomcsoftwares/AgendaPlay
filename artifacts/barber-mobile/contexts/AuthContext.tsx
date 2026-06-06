import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, getCredentials, saveCredentials, clearSession, type User } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const attemptAutoLogin = useCallback(async () => {
    try {
      const user = await api.me();
      setUser(user);
      return;
    } catch {
      // Session expired or not set — try stored credentials
    }

    const creds = await getCredentials();
    if (creds) {
      try {
        const user = await api.login(creds.email, creds.password);
        setUser(user);
      } catch {
        await clearSession();
      }
    }
  }, []);

  useEffect(() => {
    attemptAutoLogin().finally(() => setIsLoading(false));
  }, [attemptAutoLogin]);

  const login = useCallback(async (email: string, password: string) => {
    const user = await api.login(email, password);
    await saveCredentials(email, password);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore errors on logout
    }
    await clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
