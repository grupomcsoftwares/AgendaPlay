---
name: Reschedule booking window
description: Maximum advance-booking rules also apply when a client changes an appointment.
---

Public rescheduling must use the shop's configured `maxBookingDays` for the selectable date list, counting today as day one. If the appointment's current date falls outside the current window, move the picker to today and clear any previously selected time. The server must continue validating the submitted date independently.

**Why:** The reschedule picker previously used a fixed 14-day list, allowing clients to see dates beyond the shop's configured booking horizon.

**How to apply:** When changing public rescheduling dates or settings, keep the client date list aligned with the server's inclusive window semantics and retain server-side validation.
