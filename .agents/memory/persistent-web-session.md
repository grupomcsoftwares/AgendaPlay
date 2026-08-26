---
name: Persistent web session
description: Browser login persistence policy for the barber dashboard.
---

The web dashboard uses a persistent HttpOnly PostgreSQL-backed session cookie with a one-year rolling lifetime. Activity renews the expiry; logout, account cleanup, or an invalid user destroys the session.

**Why:** Barbers need to close and reopen the browser without logging in repeatedly, while an unlimited session would leave abandoned devices authenticated indefinitely.

**How to apply:** Preserve `credentials: "include"` on auth requests and do not move the session token to localStorage. If the lifetime changes, keep server-side invalidation and native WebView cookie handoff intact.