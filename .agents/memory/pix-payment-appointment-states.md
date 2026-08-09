---
name: Pix payment appointment states
description: Rules for public Pix bookings that await barber payment confirmation.
---

Public bookings paid via Pix use a separate pending-payment state. That state blocks the requested time slot, but must not create a live-queue entry, auto-start, send appointment reminders, or consume plan credits/loyalty points.

**Why:** The barber must verify the bank transfer before the appointment is operationally confirmed, and a rejected payment must release the slot without requiring balance reversals.

**How to apply:** Keep pending effects in separate appointment fields, apply them atomically only during the authenticated shop-owner approval transition, and make rejection/cancellation leave those pending effects unapplied. Notify the client through the saved appointment token and keep the public token page polling the status.