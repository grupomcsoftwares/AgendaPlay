---
name: Public booking slug lifecycle
description: Durable behavior for public booking URLs when accounts are deleted and recreated.
---

New accounts must start without a name-derived public slug. A public booking address is an explicit owner choice, so deleting and recreating an account cannot silently restore the previous shop name in its URL.

**Why:** Automatic slug generation made a recreated account reuse the old shop name in its public link, making the deleted booking address appear to remain active.

**How to apply:** Keep the new-account slug null, show no public link until the owner chooses one, and only generate `/b/<slug>` URLs from an explicitly saved slug.