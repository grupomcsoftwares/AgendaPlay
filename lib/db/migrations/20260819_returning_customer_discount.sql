BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "trial_eligible" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "has_ever_paid" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "first_paid_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "first_month_discount_checkout_session_id" text,
  ADD COLUMN IF NOT EXISTS "first_month_discount_checkout_price_id" text,
  ADD COLUMN IF NOT EXISTS "first_month_discount_redeemed_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "former_account_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_type" text NOT NULL,
  "document_hash" text NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_deleted_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "former_account_documents_hash_unique"
  ON "former_account_documents" ("document_hash");

UPDATE "users"
SET
  "has_ever_paid" = true,
  "first_paid_at" = COALESCE("first_paid_at", "created_at")
WHERE "has_ever_paid" = false
  AND (
    "stripe_subscription_id" IS NOT NULL
    OR "stripe_current_period_end" IS NOT NULL
    OR "subscription_expires_at" IS NOT NULL
  );

COMMIT;