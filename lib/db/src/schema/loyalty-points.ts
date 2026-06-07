import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const loyaltyPointsTable = pgTable("loyalty_points", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  clientPhone: text("client_phone").notNull(),
  points: integer("points").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("loyalty_points_user_phone_unique").on(t.userId, t.clientPhone),
]);

export type LoyaltyPoints = typeof loyaltyPointsTable.$inferSelect;
