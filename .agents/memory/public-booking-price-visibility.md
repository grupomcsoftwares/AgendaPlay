---
name: Public booking price visibility
description: Scope of the public booking price display preference.
---

The public booking price preference controls only the price shown on the initial service-selection cards. Service durations remain visible there, while prices, discounts, totals, and points-payment amounts in later booking steps remain visible.

**Why:** The barber wants to hide prices while the client is choosing services without hiding the financial information needed to review and confirm the booking.

**How to apply:** Keep the preference check localized to the initial service-card price element. Do not reuse it to hide prices in booking summaries, payment/confirmation steps, or loyalty dialogs.