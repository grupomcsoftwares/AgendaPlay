---
name: Subscription access enforcement
description: Durable rule for enforcing expired account billing across public booking and the live queue
---

An expired account must be denied by the server for both new public bookings and live queue access. A stored subscription ID alone is not proof of active access; a future billing period end is required after the trial ends.

**Why:** Public URLs, TV WebViews, and cached mobile sessions can bypass a visual-only lock. Webhooks and cached account data can also leave an old subscription ID behind after its period has ended.

**How to apply:** Keep the access decision centralized, enforce it before public shop data/appointment creation and queue endpoints, and have clients revalidate periodically so an already-open TV screen also becomes unavailable.

Every database projection passed to `getAccountStatus` or `accountCanAccess` must include `trialEligible`, even when the trial start date is recent.

**Why:** The billing field is optional for backward compatibility, so an omitted database field is interpreted as a valid first trial. That can accidentally restore access for a returning account that explicitly has no trial eligibility.

**How to apply:** Reuse a complete billing-field projection whenever a route makes an access decision outside the shared middleware; test a recent `trialStartedAt` with `trialEligible=false` alongside normal trial and active-subscription cases.

The shared Expo app must keep the expired-subscription payment action on phone screens but show only the expiration notice on TV screens.

**Why:** A TV is a display endpoint, not the place where the shop owner should complete billing; exposing checkout controls there creates the wrong interaction path.

**How to apply:** Gate the blocked-state actions with the platform's TV check in both the home screen and already-open queue viewer; leave the web app's subscription route unchanged.

TV queue WebViews can arrive at the web app as `view=mobile` without a native TV flag, especially on Android TV APKs that report as generic Android devices.

**Why:** Relying only on `Platform.isTV` allowed an expired TV session to follow the web `ProtectedRoute` redirect into the subscription plans screen.

**How to apply:** Mark native TV WebViews explicitly, preserve the marker through redirects, and treat a large Android/`view=mobile` display as TV for the expired-subscription route; keep normal phone-sized mobile views eligible for payment.

TV remote actions need an explicit focus index for controls outside the main mode cards, such as logout.

**Why:** A visible `Pressable` can work by touch but remain unreachable through the custom TV D-pad handler when that handler only indexes the cards.

**How to apply:** Include secondary controls in the remote navigation range, update focus state on native focus events, and route select actions to the control's own handler.

On TV, successful authentication should open the live queue directly; the queue viewer owns the TV logout control in the upper-left position previously used for back.

**Why:** The TV is a dedicated display endpoint, so an intermediate mode-selection screen adds an unnecessary remote-control step.

**How to apply:** Redirect TV login and cached-session recovery straight to the queue viewer, while preserving the native management menu for phone/tablet users.