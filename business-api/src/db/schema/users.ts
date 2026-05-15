import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { workspaces } from "./workspaces.js";

export type UserRole = "owner" | "admin" | "member";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").notNull().$type<UserRole>(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastLoginAt: text("last_login_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    workspaceIdIdx: index("users_workspace_id_idx").on(table.workspaceId),
    workspaceEmailActiveUniqueIdx: uniqueIndex(
      "users_workspace_email_active_unique_idx",
    )
      .on(table.workspaceId, table.email)
      .where(sql`${table.deletedAt} IS NULL`),
    workspaceOwnerActiveUniqueIdx: uniqueIndex(
      "users_workspace_owner_active_unique_idx",
    )
      .on(table.workspaceId)
      .where(sql`${table.role} = 'owner' AND ${table.deletedAt} IS NULL`),
  }),
);
