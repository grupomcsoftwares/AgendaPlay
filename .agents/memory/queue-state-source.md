---
name: Queue state and display ordering
description: Queue reads stay side-effect-free, and live barber cards follow active start time.
---

The queue read endpoint must be side-effect-free. It may return persisted `waiting`, `in_progress`, and non-completed entries, but opening or refreshing the TV must never start the next client or reset `startedAt`. Appointment status transitions performed by time-based maintenance must update or remove the linked queue row in the same transaction.

**Why:** The TV polls the same queue endpoint as the barber panel. An automatic advance during a read made a service appear to start when the TV was opened after the barber had already finished it, and time-based appointment completion could otherwise leave a stale “Iniciar Agora” queue row.

**How to apply:** Keep starting and completing queue entries behind explicit server mutations. If automatic expiration is needed, separate it from selecting/starting the next waiting entry, synchronize appointment/queue rows transactionally, and never advance the queue as part of a GET.

For the live TV barber grid, show barbers currently serving first, ordered by the time their service started (earliest first). Follow with idle barbers ordered by their nearest future booked appointment; those with no future appointment come last.

**Why:** The owner wants simultaneous active services to be easy to scan in chronological order, while barbers who are free or have later appointments should not displace active work.

**How to apply:** Order barber cards using each active queue entry's `startedAt`; only after active barbers, use each idle barber's nearest future `scheduledAt`, with unbooked barbers last.