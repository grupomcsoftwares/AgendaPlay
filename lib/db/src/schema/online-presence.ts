import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const onlinePresenceTable = pgTable(
  "online_presence",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    lastSeenAtIdx: index("online_presence_last_seen_at_idx").on(table.lastSeenAt),
  }),
);

export const insertOnlinePresenceSchema = createInsertSchema(onlinePresenceTable);
export type InsertOnlinePresence = z.infer<typeof insertOnlinePresenceSchema>;
export type OnlinePresence = typeof onlinePresenceTable.$inferSelect;