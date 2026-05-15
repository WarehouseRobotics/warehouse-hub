import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { users } from "./users.js";

export type PersonalAccessTokenActorType = "user" | "agent";

export const personalAccessTokens = sqliteTable(
  "personal_access_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").notNull(),
    actorType: text("actor_type").notNull().$type<PersonalAccessTokenActorType>(),
    expiresAt: text("expires_at"),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userIdIdx: index("personal_access_tokens_user_id_idx").on(table.userId),
    expiresAtIdx: index("personal_access_tokens_expires_at_idx").on(table.expiresAt),
    tokenHashIdx: uniqueIndex("personal_access_tokens_token_hash_idx").on(table.tokenHash),
  }),
);
