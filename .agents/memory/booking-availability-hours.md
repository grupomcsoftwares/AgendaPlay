---
name: Booking availability by business hours
description: Public booking behavior when today has no available slots.
---

During the current business hours, the public booking page must keep today selected and prominently show the existing no-available-slots message when all of today's slots are occupied or past. If the link is opened before opening or at/after closing time, it may automatically select the next open day. Closed days also advance to the next open day.

**Why:** Clients opening the link during operating hours need to understand that today's capacity is full, while clients opening it after hours should be taken directly to the next bookable day.

**How to apply:** Base the initial date decision on the selected barber's schedule when one exists, otherwise the shop schedule, including `closed`, `open`, and `close`; do not auto-advance merely because today's slots are empty.