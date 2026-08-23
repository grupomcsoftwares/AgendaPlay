-- Backfill the subscriber phone captured on plan-covered appointments.
-- Keep the tenant condition in the join so a reused client id cannot cross
-- account boundaries.
UPDATE "appointments" AS a
SET "subscriber_phone" = c."phone"
FROM "clients" AS c
WHERE c."id" = a."client_id"
  AND c."user_id" = a."user_id"
  AND a."covered_by_plan" = true
  AND a."client_id" IS NOT NULL
  AND a."subscriber_phone" IS NULL;