import { pgTable, serial, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
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
  userId: text("user_id").notNull().default(""),
  barbershopName: text("barbershop_name").notNull().default("Minha Barbearia"),
  ownerName: text("owner_name").notNull().default("Proprietário"),
  logoUrl: text("logo_url"),
  phone: text("phone"),
  address: text("address"),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  weeklySchedule: jsonb("weekly_schedule").$type<WeeklySchedule>(),
  bookingPageMessage: text("booking_page_message"),
  paymentEnableNow: boolean("payment_enable_now").notNull().default(false),
  paymentEnableOnSite: boolean("payment_enable_on_site").notNull().default(true),
  pixKey: text("pix_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true, userId: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
