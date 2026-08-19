---
name: Development schema push conflicts
description: Safe handling of Drizzle push when development schema drift triggers a non-interactive confirmation
---

When a development-only additive table is blocked by Drizzle's interactive named-schema conflict prompt, do not use a broad force push automatically. Apply only the intended `CREATE TABLE IF NOT EXISTS` and index change through the development database workflow, then keep the source schema aligned for future deployments.

**Why:** The project database can contain older schema drift unrelated to the current feature, and a forced push may alter or remove objects outside the requested scope.

**How to apply:** First run the normal schema push. If it fails only because the environment has no TTY, inspect the intended diff and use an isolated additive SQL change rather than accepting unrelated destructive operations.