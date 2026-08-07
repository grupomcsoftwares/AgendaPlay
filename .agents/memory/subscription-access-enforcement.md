---
name: Subscription access enforcement
description: Durable rule for enforcing expired account billing across public booking and the live queue
---

An expired account must be denied by the server for both new public bookings and live queue access. A stored subscription ID alone is not proof of active access; a future billing period end is required after the trial ends.

**Why:** Public URLs, TV WebViews, and cached mobile sessions can bypass a visual-only lock. Webhooks and cached account data can also leave an old subscription ID behind after its period has ended.

**How to apply:** Keep the access decision centralized, enforce it before public shop data/appointment creation and queue endpoints, and have clients revalidate periodically so an already-open TV screen also becomes unavailable.

The shared Expo app must keep the expired-subscription payment action on phone screens but show only the expiration notice on TV screens.

**Why:** A TV is a display endpoint, not the place where the shop owner should complete billing; exposing checkout controls there creates the wrong interaction path.

**How to apply:** Gate the blocked-state actions with the platform's TV check in both the home screen and already-open queue viewer; leave the web app's subscription route unchanged.

TV queue WebViews can arrive at the web app as `view=mobile` without a native TV flag, especially on Android TV APKs that report as generic Android devices.

**Why:** Relying only on `Platform.isTV` allowed an expired TV session to follow the web `ProtectedRoute` redirect into the subscription plans screen.

**How to apply:** Mark native TV WebViews explicitly, preserve the marker through redirects, and treat a large Android/`view=mobile` display as TV for the expired-subscription route; keep normal phone-sized mobile views eligible for payment.