import { pgTable, serial, text, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  clientId: integer("client_id"),
  clientName: text("client_name").notNull(),
  serviceId: integer("service_id"),
  serviceName: text("service_name").notNull(),
  barberId: integer("barber_id"),
  barberName: text("barber_name"),
  servicePrice: numeric("service_price", { precision: 10, scale: 2 }).notNull(),
  serviceDuration: integer("service_duration").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method").notNull().default("on_site"),
  coveredByPlan: boolean("covered_by_plan").notNull().default(false),
  creditsUsed: integer("credits_used"), // how many plan credits were spent on this appointment
  loyaltyPointsRedeemed: integer("loyalty_points_redeemed").notNull().default(0),
  loyaltyPointsEarned: integer("loyalty_points_earned").notNull().default(0),
  pendingCreditsUsed: integer("pending_credits_used"),
  pendingLoyaltyPointsRedeemed: integer("pending_loyalty_points_redeemed").notNull().default(0),
  pendingLoyaltyPointsEarned: integer("pending_loyalty_points_earned").notNull().default(0),
  subscriberPhone: text("subscriber_phone"), // phone of the plan subscriber when coveredByPlan=true; set regardless of clientId to ensure reliable cut counting
  notes: text("notes"),
  cancelToken: text("cancel_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true, userId: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
