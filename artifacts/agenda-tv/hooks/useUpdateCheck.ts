import { useState, useEffect, useCallback } from "react";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN || "agendaplay.net"}/api`;

export type UpdateInfo = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  apkUrl: string | null;
  dismiss: () => void;
};

export const APP_VERSION = "1.0.5";

/** Returns true only when `server` is a valid version strictly greater than `current`. */
function isNewerVersion(server: string, current: string): boolean {
  const parse = (v: string) => {
    const parts = v.trim().split(".");
    if (parts.length === 0 || parts.some((p) => !/^\d+$/.test(p))) return null;
    return parts.map(Number);
  };
  const s = parse(server);
  const c = parse(current);
  if (!s || !c) return false;
  const len = Math.max(s.length, c.length);
  for (let i = 0; i < len; i++) {
    const a = s[i] ?? 0;
    const b = c[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export function useUpdateCheck(): UpdateInfo {
  const [latestVersion, setLatestVersion] = useState<string>(APP_VERSION);
  const [serverApkUrl, setServerApkUrl] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`${API_BASE}/app-version`, { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.version) {
          setLatestVersion(data.version);
          setServerApkUrl(data.apkUrl ?? null);
        }
      } catch {
        // Silently ignore network errors
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(() => {
    setSkipped(latestVersion);
  }, [latestVersion]);

  const hasUpdate =
    isNewerVersion(latestVersion, APP_VERSION) && latestVersion !== skipped;

  return {
    hasUpdate,
    currentVersion: APP_VERSION,
    latestVersion,
    apkUrl: hasUpdate ? serverApkUrl : null,
    dismiss,
  };
}
