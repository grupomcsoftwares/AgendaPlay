import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

export const APP_VERSION = "1.0.4";

// When a new APK is ready, update APP_VERSION above and set APK_URL to the
// direct EAS download link (from expo.dev → Builds → the build → "Download").
export const APK_URL: string | null =
  "https://expo.dev/artifacts/eas/8udp2w-WelRr-BnqK1ZVneNR5N3EwWYnOA1J9AhQK84.apk";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/app-version", (_req, res) => {
  res.json({ version: APP_VERSION, apkUrl: APK_URL });
});

export default router;
