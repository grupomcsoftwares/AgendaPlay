import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type DaySchedule = {
  closed: boolean;
  open: string;
  close: string;
  lunchStart: string;
  lunchEnd: string;
};

export type WeeklySchedule = {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
};

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  barbershopName: text("barbershop_name").notNull().default("Minha Barbearia"),
  ownerName: text("owner_name").notNull().default("Proprietário"),
  phone: text("phone"),
  address: text("address"),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  weeklySchedule: jsonb("weekly_schedule").$type<WeeklySchedule>(),
  bookingPageMessage: text("booking_page_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
