import { pgTable, text, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  documentType: text("document_type").notNull().default("cpf"),
  cpf: text("cpf").unique(),
  cnpj: text("cnpj").unique(),
  passwordHash: text("password_hash").notNull(),
  barbershopName: text("barbershop_name").notNull().default("Minha Barbearia"),
  ownerName: text("owner_name").notNull().default("Proprietário"),
  phone: text("phone"),
  slug: text("slug").unique(),
  previousSlug: text("previous_slug"),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).notNull().defaultNow(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end", { withTimezone: true }),
  stripePaymentFailing: boolean("stripe_payment_failing").notNull().default(false),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  maxBarbers: integer("max_barbers"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  trialStartedAt: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  stripePriceId: true,
  stripeCurrentPeriodEnd: true,
  stripePaymentFailing: true,
  maxBarbers: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
