import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const nativePushSubscriptionsTable = pgTable(
  "native_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    expoPushToken: text("expo_push_token").notNull(),
    platform: text("platform").notNull().default("android"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userTokenUnique: unique("native_push_user_token_unique").on(table.userId, table.expoPushToken),
  }),
);

export type NativePushSubscription = typeof nativePushSubscriptionsTable.$inferSelect;