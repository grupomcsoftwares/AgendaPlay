import { pgTable, serial, text, integer, timestamp, jsonb, numeric, date } from "drizzle-orm/pg-core";

export const waitlistTable = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  serviceIds: jsonb("service_ids").$type<number[]>().notNull(),
  serviceName: text("service_name").notNull(),
  serviceDuration: integer("service_duration").notNull(),
  priorityDuration: integer("priority_duration").notNull(),
  servicePrice: numeric("service_price", { precision: 10, scale: 2 }).notNull(),
  barberId: integer("barber_id"),
  barberName: text("barber_name"),
  offeredBarberId: integer("offered_barber_id"),
  desiredDate: date("desired_date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("active"),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  offerToken: text("offer_token").notNull().unique(),
  offeredScheduledAt: timestamp("offered_scheduled_at", { withTimezone: true }),
  offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
  offerLastNotifiedAt: timestamp("offer_last_notified_at", { withTimezone: true }),
  offerSlotDuration: integer("offer_slot_duration"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WaitlistEntry = typeof waitlistTable.$inferSelect;