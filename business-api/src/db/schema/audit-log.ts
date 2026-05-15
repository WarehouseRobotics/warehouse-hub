import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { personalAccessTokens } from "./personal-access-tokens.js";
import { users } from "./users.js";

export type AuditActorType = "user" | "agent" | "system";

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: text("at").notNull().default(sql`CURRENT_TIMESTAMP`),
    actorUserId: text("actor_user_id").references(() => users.id),
    actorTokenId: text("actor_token_id").references(() => personalAccessTokens.id),
    actorType: text("actor_type").notNull().$type<AuditActorType>(),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    requestId: text("request_id").notNull(),
    metadata: text("metadata").notNull(),
  },
  (table) => ({
    atIdx: index("audit_log_at_idx").on(table.at),
    actorUserIdIdx: index("audit_log_actor_user_id_idx").on(table.actorUserId),
    objectIdx: index("audit_log_object_idx").on(table.objectType, table.objectId),
  }),
);
