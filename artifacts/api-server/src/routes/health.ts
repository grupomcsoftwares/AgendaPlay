import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

export const APP_VERSION = "1.0.25";

// Keep the app-facing download URL stable, but redirect the browser to EAS's
// CDN so the API process does not relay the large APK body.
export const APK_SOURCE_URL: string | null =
  "https://expo.dev/artifacts/eas/6ZQgo_PNBM89NMnGq1QghV_seEXcQSTkfgr2B2WFac0.apk";
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

  const artifactId = APK_SOURCE_URL.match(/\/artifacts\/eas\/([^/]+)\.apk$/)?.[1];
  if (!artifactId) {
    res.status(500).json({ error: "O link da atualização está inválido." });
    return;
  }

  try {
    // Resolve Expo's stable artifact URL server-side, then send the browser
    // directly to the signed APK CDN URL to avoid Silk's multi-hop redirect.
    const artifactResponse = await fetch(
      `https://api.expo.dev/v2/artifacts/eas/${artifactId}`,
      { method: "HEAD", redirect: "manual" },
    );
    const downloadUrl = artifactResponse.headers.get("location");
    if (!downloadUrl) {
      res.status(502).json({ error: "Não foi possível localizar o arquivo da atualização." });
      return;
    }

    const target = new URL(downloadUrl);
    if (
      target.protocol !== "https:" ||
      target.hostname !== "wf-artifacts.eascdn.net"
    ) {
      res.status(502).json({ error: "O destino da atualização não é confiável." });
      return;
    }

    res.redirect(302, target.toString());
  } catch {
    res.status(502).json({ error: "Não foi possível preparar o download." });
  }
});

export default router;
