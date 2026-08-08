---
name: Completed appointment availability
description: Availability and conflict behavior after an appointment is finished early.
---

An appointment marked completed by the queue must stop blocking availability immediately, even if its original scheduled duration has not elapsed. Pending, confirmed, and in-progress appointments continue to block their scheduled interval.

**Why:** A barber can finish a service before its planned end time, and the remaining minutes should become usable by another client instead of staying reserved until the original end.

**How to apply:** Keep the blocking rule consistent across public availability, booking conflict validation, rescheduling validation, and next-available/busyness calculations. Use persisted appointment status as the source of truth.