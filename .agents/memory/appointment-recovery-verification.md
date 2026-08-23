---
name: Appointment recovery verification
description: Security boundary for recovering public booking management links on a new device.
---

Recovering a client's active appointments requires both the phone used at booking and possession of an existing appointment's random cancel token. A phone number alone must never return appointment existence, details, or management tokens. Invalid verification responses stay generic.

**Why:** Phone numbers are easily known or guessed, while the existing randomly generated appointment token is a high-entropy proof that the client already received the booking link. Combining both supports recovery on another device without adding an unconfigured delivery provider.

**How to apply:** Keep recovery inputs in the request body, scope verification to the selected shop, and return management tokens only after both checks succeed. Recovered tokens re-enter the existing token-based chooser, cancellation, and rescheduling flow; do not reintroduce a phone-only lookup.