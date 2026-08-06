---
name: Loyalty point expiry
description: Product rule for expiring the aggregate client loyalty balance.
---

The loyalty balance uses inactivity-based expiry: when configured for 30, 60, or 90 days, a positive aggregate balance expires after that many days without a balance movement. `0` disables expiry. Existing configurations without the field must behave as `0`.

**Why:** The current loyalty model stores one aggregate balance per client phone, not per-point lots or earning events, so individual point-level expiry cannot be calculated without a schema redesign.

**How to apply:** Enforce expiry before balance display, client balance listings, and point redemption. Keep the configuration embedded in the existing settings loyalty object unless the product later requires per-earning-date expiration.