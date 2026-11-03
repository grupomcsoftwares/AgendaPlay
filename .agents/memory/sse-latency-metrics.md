---
name: SSE latency metrics
description: Deployment latency alert behavior for long-lived server-sent event streams.
---

Deployment request-latency metrics may count the full lifetime of an SSE response, so an intentionally open stream can appear as a very slow API request.

**Why:** A queue event stream remained open for about five minutes and correlated with a multi-minute p95 latency alert, while ordinary API requests stayed fast.

**How to apply:** For latency-sensitive autoscaled services, use short SSE connections with automatic reconnects and refresh client state after reconnect so events missed during the gap do not leave stale UI.
