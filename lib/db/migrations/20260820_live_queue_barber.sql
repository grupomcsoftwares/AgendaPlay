ALTER TABLE "queue" ADD COLUMN IF NOT EXISTS "barber_id" integer;

UPDATE "queue" q
SET "barber_id" = a."barber_id"
FROM "appointments" a
WHERE q."appointment_id" = a."id"
  AND q."barber_id" IS NULL
  AND a."barber_id" IS NOT NULL;