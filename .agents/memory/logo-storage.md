---
name: Barbershop logo storage
description: Why the shop logo is a resized data URL in the DB instead of object storage
---

The barbershop logo is stored as a client-side-resized PNG **data URL** in `settings.logoUrl` (nullable text), not in object storage.

**Why:** It is a single, small, owner-set branding asset. Resizing to max 256px in the browser keeps it tiny (~tens of KB), so a data URL in the settings row avoids the full object-storage setup (new lib, Uppy, presigned URLs, public ACL serving) for a one-image need. Settings is already fetched by the booking page, so no extra request.

**How to apply:** Keep this approach while it is one small logo. If branding assets grow (galleries, multiple images, large files) migrate to object storage + a URL field — the data-URL approach inflates the settings row/API payload and bypasses CDN/browser caching. The OpenAPI `logoUrl` has `maxLength: 3000000` as a guard; removal normalizes to `null` (not `""`).
