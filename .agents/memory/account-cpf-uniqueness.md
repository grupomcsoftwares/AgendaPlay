---
name: Account CPF uniqueness
description: Business rule for using CPF to prevent duplicate barbershop accounts.
---

Each newly registered barbershop account must provide one valid Brazilian CPF. Store only its digits and enforce uniqueness so a different email cannot create another account with the same CPF.

**Why:** Email-only registration allowed repeated trial accounts using different email addresses.

**How to apply:** Keep CPF unique at the database level, do not expose it in login/session payloads, and delete it with the user row during definitive account deletion so the person can register again afterward.