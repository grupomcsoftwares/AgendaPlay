import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { HealthCheckResponse } from "@workspace/api-zod";

export const APP_VERSION = "1.0.12";

// Keep the EAS artifact as the server-side source, but expose a same-origin
// download endpoint to Android/Fire TV browsers. EAS first redirects through
// expo.dev and then to a temporary signed CDN URL, which Silk Browser can fail
// to follow as an APK download.
export const APK_SOURCE_URL: string | null =
  "https://expo.dev/artifacts/eas/ly5ZNWjOM5BFjkCR0Sl4vti4pg65KXQUxsPtBNy4rvs.apk";
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

  try {
    const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
    const upstream = await fetch(APK_SOURCE_URL, {
      redirect: "follow",
      headers: range ? { Range: range } : undefined,
    });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: "Não foi possível obter a atualização." });
      return;
    }

    res.status(upstream.status === 206 ? 206 : 200);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", 'attachment; filename="agenda-play.apk"');
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Accept-Ranges", "bytes");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);

    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch (error) {
    console.error("APK download proxy failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    if (!res.headersSent) {
      res.status(502).json({ error: "Não foi possível obter a atualização." });
    } else {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
});

export default router;
