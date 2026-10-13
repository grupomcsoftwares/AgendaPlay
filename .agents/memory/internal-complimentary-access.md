---
name: Internal complimentary access
description: Durable boundary for complimentary access granted to the developer's internal AgendaPlay account
---

The developer's internal account receives complimentary access through the app's server-side subscription decision. This entitlement must not be treated as a Stripe cancellation or billing adjustment; existing Stripe subscriptions remain visible and unchanged.

**Why:** The account is for personal development/system administration use, while the requested exemption was explicitly limited to access inside the app.

**How to apply:** Keep the account exemption narrow and server-enforced. Preserve real Stripe subscription status in billing views and do not cancel, refund, or modify Stripe entities unless the user separately requests it.
