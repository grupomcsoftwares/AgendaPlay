/**
 * Development proxy server for Expo in Replit.
 *
 * Binds PORT immediately (satisfying the workflow port check) then starts
 * Metro on PORT+1 and proxies all traffic through.
 *
 * Sets Expo tunnel env vars from raw Replit env vars so this script can be
 * launched directly (without going through the pnpm dev script).
 */

const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

// ── Env setup (may be missing when launched directly via node) ────────────────
if (!process.env.EXPO_PACKAGER_PROXY_URL && process.env.REPLIT_EXPO_DEV_DOMAIN) {
  process.env.EXPO_PACKAGER_PROXY_URL = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
}
if (!process.env.EXPO_PUBLIC_DOMAIN && process.env.REPLIT_DEV_DOMAIN) {
  process.env.EXPO_PUBLIC_DOMAIN = process.env.REPLIT_DEV_DOMAIN;
}
if (!process.env.EXPO_PUBLIC_REPL_ID && process.env.REPL_ID) {
  process.env.EXPO_PUBLIC_REPL_ID = process.env.REPL_ID;
}
if (!process.env.REACT_NATIVE_PACKAGER_HOSTNAME && process.env.REPLIT_DEV_DOMAIN) {
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = process.env.REPLIT_DEV_DOMAIN;
}

const PORT = parseInt(process.env.PORT || "3001", 10);
const METRO_PORT = PORT + 1;
const PROJECT_ROOT = path.resolve(__dirname, "..");

let metroReady = false;

// ── Proxy helpers ─────────────────────────────────────────────────────────────

function proxyHttp(req, res) {
  const options = {
    hostname: "localhost",
    port: METRO_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${METRO_PORT}` },
  };

  const proxy = http.request(options, (upstream) => {
    res.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(res, { end: true });
  });

  proxy.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Metro starting\u2026");
    }
  });

  req.pipe(proxy, { end: true });
}

function proxyUpgrade(req, clientSocket, head) {
  const upstream = net.connect(METRO_PORT, "localhost", () => {
    upstream.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n"
    );
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket, { end: true });
    clientSocket.pipe(upstream, { end: true });
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
}

// ── Placeholder handler (before Metro is ready) ───────────────────────────────

function placeholderHandler(_req, res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    "<!DOCTYPE html><html><body style='font-family:monospace;padding:2rem'>" +
      "<h2>\u2699\uFE0F  Metro Bundler starting\u2026</h2>" +
      "<p>The Expo web bundle will be ready in a few seconds. " +
      "Refresh this page once Metro has loaded.</p>" +
      "</body></html>"
  );
}

// ── Proxy server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (metroReady) {
    proxyHttp(req, res);
  } else {
    placeholderHandler(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (metroReady) proxyUpgrade(req, socket, head);
  else socket.destroy();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[proxy] Listening on port ${PORT} \u2192 forwarding to Metro on ${METRO_PORT}`
  );
  startMetro();
});

// ── Metro startup ─────────────────────────────────────────────────────────────

function startMetro() {
  const env = {
    ...process.env,
    PORT: String(METRO_PORT),
  };

  const metro = spawn(
    "pnpm",
    ["exec", "expo", "start", "--localhost", "--port", String(METRO_PORT), "--web"],
    {
      stdio: ["ignore", "inherit", "inherit"],
      cwd: PROJECT_ROOT,
      env,
      detached: false,
    }
  );

  metro.on("error", (err) => {
    console.error("[metro] Failed to start:", err.message);
    process.exit(1);
  });

  metro.on("exit", (code, signal) => {
    console.log(`[metro] Exited (code=${code} signal=${signal})`);
    process.exit(code ?? 1);
  });

  // Poll Metro until it responds
  const poll = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://localhost:${METRO_PORT}/`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status < 600) {
        if (!metroReady) {
          metroReady = true;
          console.log("[proxy] Metro ready \u2014 now forwarding all traffic");
        }
        clearInterval(poll);
      }
    } catch {
      // Metro not ready yet; keep polling
    }
  }, 2000);

  // Clean up on parent exit
  const cleanup = (signal) => {
    clearInterval(poll);
    metro.kill(signal || "SIGTERM");
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => cleanup("SIGTERM"));
  process.on("SIGINT", () => cleanup("SIGINT"));
}
