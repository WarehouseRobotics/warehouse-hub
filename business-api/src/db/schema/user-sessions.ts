import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { users } from "./users.js";

export const userSessions = sqliteTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    userAgent: text("user_agent"),
  },
  (table) => ({
    userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("user_sessions_expires_at_idx").on(table.expiresAt),
    tokenHashIdx: uniqueIndex("user_sessions_token_hash_idx").on(table.tokenHash),
  }),
);
