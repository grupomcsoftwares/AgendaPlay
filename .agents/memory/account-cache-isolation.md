---
name: Account-switch cache isolation
description: Durable rule for preventing one barbershop's cached data from appearing in another account.
---

The browser cache must be cleared whenever the authenticated account changes, including login, registration, logout, and account deletion. This applies to both the React Query cache and account-related localStorage keys.

**Why:** Settings, services, appointments, and other queries use stable keys, so a new account can briefly render the previous account's data before a fresh response arrives.

**How to apply:** Keep account transitions responsible for clearing cached queries and account-scoped localStorage before the next account's data is rendered. Also delete all server-side records owned by the account, including indirect records linked through appointment cancellation tokens.