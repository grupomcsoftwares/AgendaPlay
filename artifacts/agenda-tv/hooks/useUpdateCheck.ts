import { useState, useEffect, useCallback } from "react";

const API_BASE = "https://mcagenda.replit.app/api";
const SKIPPED_VERSION_KEY = "@agendaplay/skipped_version";

export type UpdateInfo = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  dismiss: () => void;
};

export const APP_VERSION = "1.0.13";

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

  return {
    hasUpdate,
    currentVersion: APP_VERSION,
    latestVersion,
    dismiss,
  };
}
