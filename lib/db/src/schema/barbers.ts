import { pgTable, serial, text, integer, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import type { WeeklySchedule } from "./settings";

export const barbersTable = pgTable("barbers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  bio: text("bio"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  weeklySchedule: jsonb("weekly_schedule").$type<WeeklySchedule>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const barberServicesTable = pgTable(
  "barber_services",
  {
    barberId: integer("barber_id").notNull(),
    serviceId: integer("service_id").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.barberId, t.serviceId] }),
  }),
);

export const insertBarberSchema = createInsertSchema(barbersTable).omit({ id: true, createdAt: true, userId: true });
export type InsertBarber = z.infer<typeof insertBarberSchema>;
export type Barber = typeof barbersTable.$inferSelect;
