---
name: Booking day pricing and combos
description: Rule for combining weekly service prices with combo discounts in booking totals.
---

The booking total and combo discount base must use each selected service's effective price for the chosen date. A weekly promotional price is part of the service price before applying the combo discount.

**Why:** A service can have a lower price on one weekday while the combo discount remains active. Using the base price makes the booking summary and stored appointment total too high on promotional days.

**How to apply:** Resolve each selected service's day-specific price first, sum those effective prices, then calculate the combo discount and downstream loyalty or subscription amounts. Keep the base price only as a visual reference when a promotion is active.