import { pgTable, serial, text, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const comboDiscountsTable = pgTable("combo_discounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull().default(""),
  serviceIds: jsonb("service_ids").$type<number[]>().notNull().$default(() => []),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  discountType: text("discount_type").$type<"percent" | "value">().notNull().default("percent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertComboDiscountSchema = createInsertSchema(comboDiscountsTable).omit({ id: true, createdAt: true, userId: true });
export type InsertComboDiscount = z.infer<typeof insertComboDiscountSchema>;
export type ComboDiscount = typeof comboDiscountsTable.$inferSelect;
