---
name: Appointment and queue service sync
description: Consistency rule for service details duplicated between appointments and live queue entries.
---

When a barber changes the service on an appointment, update the linked non-completed queue entry's service name, price, and duration in the same transaction, then broadcast a queue refresh.

**Why:** The live queue stores a snapshot of service fields rather than reading all service details from the appointment on every response. Without an explicit synchronization, the appointment panel can show a shorter duration while the live queue and its progress timer continue using the old duration.

**How to apply:** Keep appointment and queue updates atomic in the appointment mutation path. Preserve `startedAt`; changing a service duration should recalculate the active timer's end based on the original start time and the new duration.