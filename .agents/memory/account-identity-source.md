---
name: Account identity source
description: Source of truth for the barbershop owner's identity fields.
---

The full owner name, owner phone, and barbershop name are collected during account registration and are the account's identity. Settings should display these values automatically and not allow the general-information form to overwrite them; booking link and logo remain configurable there.

**Why:** These values describe the account created during onboarding and should not drift from the identity shown across the panel.

**How to apply:** Read identity fields from the user account when returning settings, keep them out of mutable settings updates, and require a Brazilian phone with DDD for new registrations.