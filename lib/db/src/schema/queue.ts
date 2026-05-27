import { pgTable, serial, text, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";

export const queueTable = pgTable(
  "queue",
  {
    id: serial("id").primaryKey(),
    appointmentId: integer("appointment_id").references(() => appointmentsTable.id, {
      onDelete: "set null",
    }),
    clientName: text("client_name").notNull(),
    serviceName: text("service_name").notNull(),
    servicePrice: numeric("service_price", { precision: 10, scale: 2 }).notNull(),
    serviceDuration: integer("service_duration").notNull(),
    position: integer("position").notNull(),
    status: text("status").notNull().default("waiting"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appointmentIdUnique: uniqueIndex("queue_appointment_id_unique").on(table.appointmentId),
  }),
);

export const insertQueueSchema = createInsertSchema(queueTable).omit({ id: true, createdAt: true });
export type InsertQueue = z.infer<typeof insertQueueSchema>;
export type QueueEntry = typeof queueTable.$inferSelect;
