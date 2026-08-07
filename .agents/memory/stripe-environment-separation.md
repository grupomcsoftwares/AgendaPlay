---
name: Stripe environment separation
description: Durable rule for keeping Stripe development and production credentials and catalogs isolated
---

Production Stripe must resolve credentials from the environment-aware Replit connection before considering shared project secrets; otherwise a development `sk_test_` secret can silently override the live account.

**Why:** Development and production Stripe connections can both be healthy at the same time, while a shared secret remains present and points to test mode. The symptom is a healthy app with an empty or test-only production catalog.

**How to apply:** Keep test credentials for development, live credentials/connection for production, and after every production publish verify the public plans endpoint returns the expected live catalog and that webhook deliveries succeed.