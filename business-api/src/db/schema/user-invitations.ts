import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { magicLinkTokens } from "./magic-link-tokens.js";
import { users, type UserRole } from "./users.js";

export type UserInvitationRole = Exclude<UserRole, "owner">;

export const userInvitations = sqliteTable(
  "user_invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().$type<UserInvitationRole>(),
    magicLinkTokenId: text("magic_link_token_id")
      .notNull()
      .references(() => magicLinkTokens.id),
    acceptedAt: text("accepted_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    emailIdx: index("user_invitations_email_idx").on(table.email),
    invitedByUserIdIdx: index("user_invitations_invited_by_user_id_idx").on(table.invitedByUserId),
    magicLinkTokenIdIdx: index("user_invitations_magic_link_token_id_idx").on(table.magicLinkTokenId),
  }),
);
