import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const clientReengagementPushSubscriptionsTable = pgTable(
  "client_reengagement_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    clientPhone: text("client_phone").notNull(),
    clientName: text("client_name").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    lastAppointmentAt: timestamp("last_appointment_at", { withTimezone: true }).notNull(),
    reengagementSentAt: timestamp("reengagement_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userPhoneEndpointUnique: unique("client_reengagement_user_phone_endpoint_unique").on(
      table.userId,
      table.clientPhone,
      table.endpoint,
    ),
  }),
);

export type ClientReengagementPushSubscription =
  typeof clientReengagementPushSubscriptionsTable.$inferSelect;