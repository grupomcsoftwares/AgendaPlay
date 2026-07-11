import { useState, useEffect, useCallback } from "react";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN || "agendaplay.net"}/api`;

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

  const hasUpdate = latestVersion !== APP_VERSION && latestVersion !== skipped;

  return {
    hasUpdate,
    currentVersion: APP_VERSION,
    latestVersion,
    apkUrl: hasUpdate ? serverApkUrl : null,
    dismiss,
  };
}
