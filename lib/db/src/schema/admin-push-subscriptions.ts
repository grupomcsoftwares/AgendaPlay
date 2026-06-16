import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const adminPushSubscriptionsTable = pgTable("admin_push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminPushSubscription = typeof adminPushSubscriptionsTable.$inferSelect;
