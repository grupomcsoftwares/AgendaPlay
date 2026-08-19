import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const formerAccountDocumentsTable = pgTable(
  "former_account_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentType: text("document_type").notNull(),
    documentHash: text("document_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastDeletedAt: timestamp("last_deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentHashUnique: unique("former_account_documents_hash_unique").on(table.documentHash),
  }),
);

export type FormerAccountDocument = typeof formerAccountDocumentsTable.$inferSelect;