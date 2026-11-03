---
name: pnpm audit override compatibility
description: Keep vulnerability fixes within the parent dependency's supported major version.
---

When applying broad pnpm audit overrides, do not trust open-ended `>=fixedVersion` targets to preserve compatibility: they can resolve a new major version or API that the framework or plugin does not support. Keep security-fixed versions and adapt consumers when necessary instead of downgrading to a vulnerable release. For Metro's `image-size` dependency, pass file bytes because patched `image-size` no longer accepts a path string.

**Why:** An automated override selected Babel 8 for an Expo project that expects Babel 7, another crossed brace-expansion major versions, and the patched `image-size` API broke Metro bundling when it received a file path string.

**How to apply:** Review generated `pnpm-workspace.yaml` overrides for major-version and API changes, scope child overrides to their parent when needed, and keep secure dependency versions. Run typecheck and production builds after install; patch the consumer if a secure API change is incompatible.
