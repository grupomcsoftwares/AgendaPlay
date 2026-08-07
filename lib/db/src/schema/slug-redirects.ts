import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const slugRedirectsTable = pgTable("slug_redirects", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  oldSlug: text("old_slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SlugRedirect = typeof slugRedirectsTable.$inferSelect;
