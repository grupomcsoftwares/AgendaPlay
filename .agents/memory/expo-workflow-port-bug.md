---
name: Expo workflow port detection bug
description: Port detection (DIDNT_OPEN_A_PORT) is broken for kind=mobile artifact workflows and for configureWorkflow with waitForPort in this Replit environment. Workaround documented here.
---

## The Rule

For Expo (kind=mobile) artifacts in this Replit environment:
- The river service NEVER detects a bound port, regardless of port number (3000, 3001, 3002, 23260, etc.) or process type (Node.js http, direct Metro, pnpm script).
- `restart_workflow` always returns `DIDNT_OPEN_A_PORT` after 120 seconds.
- `configureWorkflow` with `waitForPort` also fails for the same reason.

**Workaround:** Create a non-artifact manual workflow via `configureWorkflow` WITHOUT the `waitForPort` parameter. The workflow then only checks process liveness, not port status.

```javascript
await configureWorkflow({
  name: "BarberApp Mobile Dev",
  command: "cd /home/runner/workspace/artifacts/barber-mobile && node scripts/dev-server.js",
  outputType: "webview",
  autoStart: true
  // NO waitForPort - this is the key!
});
```

The artifact workflow (artifacts/barber-mobile: expo) will remain FAILED — that is expected and harmless.

**Why:** Something in the Replit river service's port monitoring cannot detect ports opened by processes in the mobile workflow's container/namespace. The root cause is a platform bug. This does not affect api/web artifact workflows.

**How to apply:** Any time you restart the Expo dev server or the "BarberApp Mobile Dev" workflow fails, recreate it with configureWorkflow WITHOUT waitForPort. Do NOT use restart_workflow on the artifact workflow — it will always fail. Use `restartWorkflow({ workflowName: "BarberApp Mobile Dev" })` for the manual workflow instead.

## Dev server architecture

`artifacts/barber-mobile/scripts/dev-server.js`:
- Reads PORT from env (default 3001)
- Sets Expo env vars (EXPO_PACKAGER_PROXY_URL, etc.) from raw Replit env vars at startup
- Binds proxy on PORT immediately
- Spawns Metro on PORT+1
- Polls Metro until ready, then forwards all traffic

The Expo app is accessible at the Expo dev domain (`$REPLIT_EXPO_DEV_DOMAIN`) for native Expo Go testing, and at `/mobile/` via the shared proxy for web preview.
