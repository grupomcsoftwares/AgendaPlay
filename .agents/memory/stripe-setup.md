---
name: Stripe setup quirks
description: How Stripe integration and schema were wired up in this project
---

## Rule
`runMigrations` from `stripe-replit-sync` fails silently when bundled via esbuild (uses `__dirname` which breaks). Run migrations directly via Node before first start.

**Why:** The esbuild bundle resolves `__dirname` incorrectly, so the migration files path is wrong and no tables are created. Running via raw Node works.

**How to apply:** If `stripe.accounts` relation is missing after deploy, run:
```
node --input-type=module -e "import { runMigrations } from 'stripe-replit-sync/dist/index.js'; await runMigrations({ databaseUrl: process.env.DATABASE_URL });"
```

## Stripe key source
`STRIPE_SECRET_KEY` env secret is the primary source. The Replit connector proxy is a fallback. Code in `stripeClient.ts` checks env var first.

## Products created
4 plans in Stripe (BRL, monthly): R$24,90 / R$49,90 / R$74,90 / R$99,90.
`metadata.maxBarbers` = "1" / "2" / "3" / "0" (0 = unlimited).
