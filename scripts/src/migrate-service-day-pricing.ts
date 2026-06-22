import { db } from "@workspace/db";
import { serviceDayPricingTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function run() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "service_day_pricing" (
      "id" serial PRIMARY KEY,
      "service_id" integer NOT NULL,
      "user_id" text NOT NULL DEFAULT '',
      "day_of_week" integer NOT NULL,
      "price" numeric(10, 2) NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "service_day_pricing_service_day_unique"
    ON "service_day_pricing" ("service_id", "day_of_week");
  `);
  console.log("Migration complete: service_day_pricing table created.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
