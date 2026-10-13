---
name: pnpm audit override compatibility
description: Keep vulnerability fixes within the parent dependency's supported major version.
---

When applying broad pnpm audit overrides, do not trust open-ended `>=fixedVersion` targets to preserve compatibility: they can resolve a new major version that the framework or plugin does not support. Prefer the nearest fixed release within the supported range, and check framework compatibility plus peer warnings after install.

**Why:** An automated override selected Babel 8 for an Expo project that expects Babel 7, and another override crossed brace-expansion major versions.

**How to apply:** Review generated `pnpm-workspace.yaml` overrides for major-version jumps, scope child overrides to their parent when needed, then run typecheck and restart affected workflows after installation.
