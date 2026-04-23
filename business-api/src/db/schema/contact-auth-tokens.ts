import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { contacts } from "./contacts.js";

export const contactAuthTokens = sqliteTable(
  "contact_auth_tokens",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    contactIdIdx: index("contact_auth_tokens_contact_id_idx").on(table.contactId),
    expiresAtIdx: index("contact_auth_tokens_expires_at_idx").on(table.expiresAt),
    tokenHashIdx: uniqueIndex("contact_auth_tokens_token_hash_idx").on(table.tokenHash),
  }),
);
