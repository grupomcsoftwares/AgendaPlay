import { useState, useEffect, useCallback } from "react";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN || "agendaplay.net"}/api`;
const SKIPPED_VERSION_KEY = "@agendaplay/skipped_version";

export type UpdateInfo = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  apkUrl: string | null;
  dismiss: () => void;
};

export const APP_VERSION = "1.0.2";

export function useUpdateCheck(): UpdateInfo {
  const [latestVersion, setLatestVersion] = useState<string>(APP_VERSION);
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

  const hasUpdate = latestVersion !== APP_VERSION && latestVersion !== skipped;

  const apkUrl = hasUpdate
    ? `${API_BASE.replace("/api", "")}/downloads/agendaplay-${latestVersion}.apk`
    : null;

  return {
    hasUpdate,
    currentVersion: APP_VERSION,
    latestVersion,
    apkUrl,
    dismiss,
  };
}
