import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type MagicLinkTokenPurpose = "login" | "invite_accept";

export const magicLinkTokens = sqliteTable(
  "magic_link_tokens",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull().$type<MagicLinkTokenPurpose>(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    emailIdx: index("magic_link_tokens_email_idx").on(table.email),
    expiresAtIdx: index("magic_link_tokens_expires_at_idx").on(table.expiresAt),
    tokenHashIdx: uniqueIndex("magic_link_tokens_token_hash_idx").on(table.tokenHash),
  }),
);
