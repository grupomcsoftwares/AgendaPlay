import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

export const APP_VERSION = "1.0.0";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/app-version", (_req, res) => {
  res.json({ version: APP_VERSION });
});

export default router;
