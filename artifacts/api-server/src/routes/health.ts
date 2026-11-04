import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

export const APP_VERSION = "1.0.23";

// Keep the app-facing download URL stable, but redirect the browser to EAS's
// CDN so the API process does not relay the large APK body.
export const APK_SOURCE_URL: string | null =
  "https://expo.dev/artifacts/eas/1eX9GL2MjmHDbe-WYqjGb1Hr9twlHxVqarGKlAHqo4c.apk";
export const APK_URL: string | null = "https://agendaplay.net/api/app-download.apk";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/app-version", (_req, res) => {
  res.json({ version: APP_VERSION, apkUrl: APK_URL });
});

router.get("/app-download.apk", async (req, res): Promise<void> => {
  if (!APK_SOURCE_URL) {
    res.status(404).json({ error: "Nenhuma atualização disponível." });
    return;
  }

  // Do not proxy the 88 MB APK through the API process: the long response was
  // ending as a premature-close 5xx. Let the browser download from Expo's CDN.
  res.redirect(302, APK_SOURCE_URL);
});

export default router;
