---
name: Barber notification sounds
description: Sound categories and delivery behavior for barber appointment alerts.
---

Barber alerts use three categories: new appointment, cancellation/reschedule, and Pix awaiting approval. The first two are one-shot alerts; the Pix category repeats every 60 seconds only while the appointment remains `pending_payment`.

**Why:** Different operational actions need different urgency, and a pending Pix request must remain visible until the barber makes an explicit decision.

**How to apply:** Keep the category in the push payload, map it to the browser audio asset and dedicated Android notification channel, and query only `pending_payment` appointments for each repeat. Approval or rejection stops repeats automatically because the status no longer matches.