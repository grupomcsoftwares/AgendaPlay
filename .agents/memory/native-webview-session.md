---
name: Native WebView session handoff
description: Native login needs an explicit signed session cookie handoff because React Native fetch may not expose Set-Cookie.
---

The native login request identifies itself with `X-AgendaPlay-Native: 1`; only that response includes the signed session cookie used by the embedded WebView. Keep the cookie out of normal web login responses.

**Why:** React Native fetch does not reliably expose `Set-Cookie`, while exposing a session cookie to every browser login response unnecessarily broadens the session-token surface.

**How to apply:** When changing native authentication or WebView loading, preserve the explicit native header, store only the cookie name/value pair, and inject it for the exact application hostname.