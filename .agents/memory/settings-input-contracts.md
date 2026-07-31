---
name: Editable settings input contracts
description: Editable settings must be declared in the request schema as well as the response schema.
---

When a settings field can be changed by the UI, declare it in the OpenAPI request schema and regenerate the validation/client types. A field present only in the response schema may be silently stripped by Zod before the database update, producing a successful response without persistence.

**Why:** The booking link toggle was returned by the settings endpoint but missing from the update body contract, so `false` was discarded while the PATCH still returned 200.

**How to apply:** For every editable settings control, verify the field exists in `SettingsUpdate`, in generated request validation, and in the generated client type before testing persistence.