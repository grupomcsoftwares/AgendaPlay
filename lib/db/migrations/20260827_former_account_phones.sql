BEGIN;

ALTER TABLE "users"
  ALTER COLUMN "document_type" SET DEFAULT 'phone';

CREATE TABLE IF NOT EXISTS "former_account_phones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "phone_hash" text NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_deleted_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "former_account_phones_hash_unique"
  ON "former_account_phones" ("phone_hash");

COMMIT;