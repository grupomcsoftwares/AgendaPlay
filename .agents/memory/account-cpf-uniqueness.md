---
name: Account CPF uniqueness
description: Business rule for using CPF to prevent duplicate barbershop accounts.
---

New barbershop accounts no longer require CPF or CNPJ. The normalized owner phone is the primary registration identifier, and a phone already used by an active account cannot create another account.

**Why:** Phone is now the stable identifier that survives account deletion and prevents a different email or document from restarting the free trial.

**How to apply:** Normalize Brazilian phone digits at registration, check active accounts by normalized phone, and record a protected phone hash during definitive deletion so future registrations are returning customers.