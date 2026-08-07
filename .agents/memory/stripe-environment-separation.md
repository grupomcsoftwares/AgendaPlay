---
name: Stripe environment separation
description: Durable rule for keeping Stripe development and production credentials and catalogs isolated
---

Production Stripe must resolve credentials from the environment-aware Replit connection before considering shared project secrets; otherwise a development `sk_test_` secret can silently override the live account.

**Why:** Development and production Stripe connections can both be healthy at the same time, while a shared secret remains present and points to test mode. The symptom is a healthy app with an empty or test-only production catalog.

**How to apply:** Keep test credentials for development, live credentials/connection for production, and after every production publish verify the public plans endpoint returns the expected live catalog and that webhook deliveries succeed.

Persisted Stripe customer IDs are scoped to the Stripe account and mode. If checkout receives `resource_missing` for the saved customer, create and persist a replacement customer before retrying once.

**Why:** Switching Stripe accounts or modes can leave valid-looking IDs in the application database that do not exist in the currently connected account.

**How to apply:** Treat a missing customer as recoverable during checkout, but do not expose the provider's raw error payload to the client.

Stripe can redirect back before the webhook arrives, and the browser may lose the app session cookie during that redirect.

**Why:** Relying only on `/auth/me` or a single webhook-triggered refresh makes a successful payment briefly look unpaid and sends the customer back to checkout.

**How to apply:** Put the checkout session ID and user reference in the Stripe session, confirm that completed session server-side, restore the matching app session when needed, and retry client refresh briefly before showing plans again.