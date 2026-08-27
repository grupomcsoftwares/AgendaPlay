---
name: No-show loyalty rule
description: Product distinction between missed appointments and completed appointments.
---

An explicit barber action marks an in-progress appointment as `no_show` and zeros the client's aggregate loyalty balance. Completing an appointment must never alter that balance.

**Why:** A completed queue item can mean the client was served, so time-based or automatic completion cannot safely infer a no-show. The product requires an intentional barber decision.

**How to apply:** Keep `no_show` terminal and unavailable to public cancel/reschedule flows. Perform the appointment status change, queue removal, and points reset in one transaction, and keep normal completion independent.