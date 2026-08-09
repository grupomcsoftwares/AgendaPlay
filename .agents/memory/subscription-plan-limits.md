---
name: Subscription plan limits
description: Durable rule for enforcing barber-count limits and upgrading an existing Stripe subscription
---

The number of active barbers is controlled by the account's current subscription plan after the free trial. During the 30-day trial, barber creation is unlimited so the shop can evaluate the full product. After the trial, when a paid-plan limit is reached, the API must reject creation and the management UI should open the plan-selection flow.

**Why:** A client-side-only restriction can be bypassed by direct API calls, while starting a second checkout for an active customer can create duplicate subscriptions and conflicting limits.

**How to apply:** Derive the trial exception centrally with account status, enforce paid-plan limits server-side with a stable error code, show only plans that are valid in the authorized Stripe catalog, and change the existing Stripe subscription item when an active subscriber selects a larger plan.