---
name: Subscription access enforcement
description: Durable rule for enforcing expired account billing across public booking and the live queue
---

An expired account must be denied by the server for both new public bookings and live queue access. A stored subscription ID alone is not proof of active access; a future billing period end is required after the trial ends.

**Why:** Public URLs, TV WebViews, and cached mobile sessions can bypass a visual-only lock. Webhooks and cached account data can also leave an old subscription ID behind after its period has ended.

**How to apply:** Keep the access decision centralized, enforce it before public shop data/appointment creation and queue endpoints, and have clients revalidate periodically so an already-open TV screen also becomes unavailable.