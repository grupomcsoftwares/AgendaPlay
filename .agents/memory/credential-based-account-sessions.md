---
name: Credential-based account sessions
description: The account identity and session-creation contract for email/password signup and login.
---

Email/password login must find the account by normalized email and verify the password before assigning a session user ID. Registration must insert the account first, then regenerate the session, set its user ID, and save it before returning authenticated success. Never use the incoming session's user ID to identify the account during login.

**Why:** On 2026-09-26, an authentication change replaced the registration insert and email lookup with a lookup by the current session ID. Production login attempts then returned 401 after logout, while unauthenticated registration could not create accounts.

**How to apply:** Treat incoming session state as untrusted identity; prove identity from credentials or account creation, attach the session only afterward, and preserve the native-only signed session-cookie handoff.