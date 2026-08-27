import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const formerAccountPhonesTable = pgTable(
  "former_account_phones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneHash: text("phone_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastDeletedAt: timestamp("last_deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneHashUnique: unique("former_account_phones_hash_unique").on(table.phoneHash),
  }),
);

export type FormerAccountPhone = typeof formerAccountPhonesTable.$inferSelect;