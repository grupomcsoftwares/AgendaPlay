---
name: Phone trial history
description: How account deletion and free-trial eligibility are tied to phone.
---

The owner phone is the canonical identity for new barbershop registration. It is stored as digits on the account, and a keyed hash is retained when the account is definitively deleted. A later registration with that phone is marked as returning and receives no new 30-day trial.

**Why:** Email and CPF/CNPJ can change between registrations, while the phone is the product's chosen stable identifier.

**How to apply:** Keep the history hash one-way, save it in the same account-deletion path used by automatic expiry cleanup, and never require or expose the old document fields for new registration.