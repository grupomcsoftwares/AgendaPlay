---
name: Native WebView session handoff
description: Native login needs an explicit signed session cookie handoff because React Native fetch may not expose Set-Cookie.
---

The native login request identifies itself with `X-AgendaPlay-Native: 1`; only that response includes the signed session cookie used by the embedded WebView. Keep the cookie out of normal web login responses.

**Why:** React Native fetch does not reliably expose `Set-Cookie`, while exposing a session cookie to every browser login response unnecessarily broadens the session-token surface.

**How to apply:** When changing native authentication or WebView loading, preserve the explicit native header, store only the cookie name/value pair, inject it only for the exact application hostname, and allow only HTTPS navigation on the official host.

Subscription access and session presence are separate states on TV. Only show “Assinatura expirada” after a successful authenticated status response says `canAccess: false`; a missing, invalid, or stale WebView session must show a reconnect state instead.

**Why:** An active account can still have a stale native cookie or cached `/auth/me` response. Treating that as billing failure misleads the operator and makes a valid subscription look blocked.

**How to apply:** Request native and web account status with cache bypass, keep native blocked UI behind auth revalidation, and provide a way to refresh or reconnect without changing server-side access enforcement.