import { pgTable, serial, integer, numeric, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceDayPricingTable = pgTable("service_day_pricing", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull(),
  userId: text("user_id").notNull().default(""),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const insertServiceDayPricingSchema = createInsertSchema(serviceDayPricingTable)
  .omit({ id: true, userId: true });

export type InsertServiceDayPricing = z.infer<typeof insertServiceDayPricingSchema>;
export type ServiceDayPricing = typeof serviceDayPricingTable.$inferSelect;

export const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo", short: "Dom" },
  { value: 1, label: "Segunda", short: "Seg" },
  { value: 2, label: "Terça", short: "Ter" },
  { value: 3, label: "Quarta", short: "Qua" },
  { value: 4, label: "Quinta", short: "Qui" },
  { value: 5, label: "Sexta", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
] as const;
