---
name: Account document choice
description: Rules for the CPF/CNPJ choice during barbershop account registration.
---

CPF/CNPJ are legacy account fields only. New barbershop registration does not ask for a document and uses the normalized owner phone as the account identity and trial-history key. Existing document columns and historical rows remain only for compatibility.

**Why:** The product now identifies the account by phone so deleting and recreating it cannot restart the free trial with a different document or email.

**How to apply:** Do not add CPF/CNPJ back to the registration form or trial decision. Store new account phone numbers in canonical digits, and keep old document data untouched for existing accounts.