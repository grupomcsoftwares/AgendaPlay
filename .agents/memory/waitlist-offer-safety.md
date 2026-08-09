---
name: Waitlist offer safety
description: Durable rules for public waitlist matching, push offers, and acceptance.
---

The waitlist is an opportunity to book, not a reservation. A cancellation may offer a compatible slot to one client, but the slot is only consumed when the client accepts and the normal appointment-creation validations succeed.

**Why:** Public clients can open the same secure link in multiple tabs, and availability can change between cancellation, notification delivery, and acceptance.

**How to apply:** Claim an offer with a conditional status update before creating the appointment; restore it if authoritative booking fails; re-check service/barber compatibility and real conflicts; expire or decline offers before moving to the next candidate.