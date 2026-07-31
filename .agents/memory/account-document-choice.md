---
name: Account document choice
description: Rules for the CPF/CNPJ choice during barbershop account registration.
---

New accounts choose one document type: CPF for the responsible person or CNPJ for the company. The selected number is normalized to digits, validated with its Brazilian check digits, and unique within its document column. Existing CPF accounts remain valid through the legacy CPF column.

**Why:** Individual barbers and registered companies need different identifiers, while both must prevent duplicate trial accounts.

**How to apply:** Keep `document_type` as `cpf` or `cnpj`, store only the matching document column, reject duplicates regardless of email, and release the document when the account is definitively deleted.