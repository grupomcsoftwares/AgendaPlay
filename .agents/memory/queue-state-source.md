---
name: Queue state source
description: The live queue must reflect persisted state without starting appointments during reads.
---

The queue read endpoint must be side-effect-free. It may return persisted `waiting`, `in_progress`, and non-completed entries, but opening or refreshing the TV must never start the next client or reset `startedAt`.

**Why:** The TV polls the same queue endpoint as the barber panel. An automatic advance during a read made a service appear to start when the TV was opened after the barber had already finished it.

**How to apply:** Keep starting and completing queue entries behind explicit server mutations. If automatic expiration is needed, separate it from selecting/starting the next waiting entry and never advance the queue as part of a GET.