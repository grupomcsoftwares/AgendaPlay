---
name: Account lifecycle serialization
description: Safety rule for coordinating Stripe Checkout with manual and automatic account deletion.
---

Checkout creation and every account-deletion path must share one per-account lifecycle lock. Before deletion, inspect all Stripe Checkout Sessions and subscriptions for the customer; automatic cleanup must fail closed, while manual deletion must expire open sessions and cancel nonterminal subscriptions.

**Why:** A payment can complete between a stale local check and database deletion, leaving a customer charged after their local account data is gone.

**How to apply:** Any new billing entry point, account cleanup job, or deletion flow must participate in the same lifecycle serialization and revalidate Stripe under that lock.