import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const clientSubscriptionsTable = pgTable("client_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  planId: integer("plan_id").notNull(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  clientEmail: text("client_email").notNull(),
  startDate: text("start_date").notNull(),
  status: text("status").$type<"pending" | "active" | "cancelled" | "expired">().notNull().default("pending"),
  creditsRemaining: integer("credits_remaining"), // points left to spend
  creditsTotal: integer("credits_total"), // original allocation
  expiresAt: timestamp("expires_at", { withTimezone: true }), // when current period expires
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ClientSubscription = typeof clientSubscriptionsTable.$inferSelect;
