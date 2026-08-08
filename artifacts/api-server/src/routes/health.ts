import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

export const APP_VERSION = "1.0.11";

// When a new APK is ready, update APP_VERSION above and set APK_URL to the
// direct EAS download link (from expo.dev → Builds → the build → "Download").
export const APK_URL: string | null =
  "https://expo.dev/artifacts/eas/BwFQSz8QiLTCK2IP_VtSod6jauQLbllYjAT84iu4Edo.apk";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/app-version", (_req, res) => {
  res.json({ version: APP_VERSION, apkUrl: APK_URL });
});

export default router;
