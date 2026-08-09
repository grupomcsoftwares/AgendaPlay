---
name: New booking from appointment link
description: Reliable navigation from the client appointment page to another booking.
---

The “Agendar” action for another person must navigate in the current tab using the app router, not `window.open`, because popup/new-tab behavior is unreliable on mobile browsers and WebViews. If an older appointment URL lacks `shopId`, use the appointment response's owner identifier as the shop fallback and keep that field represented in the API contract.

**Why:** The previous new-booking action appeared to do nothing on mobile, and legacy appointment links did not carry enough URL context to build the booking route.

**How to apply:** Preserve the `novo`, first-name, and last-name query parameters, navigate to `/booking`, and derive the shop from the URL first or the token-loaded appointment second.