import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { contacts } from "./contacts.js";

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    commentableType: text("commentable_type").notNull(),
    commentableId: text("commentable_id").notNull(),
    commentableSlug: text("commentable_slug").notNull(),
    body: text("body").notNull(),
    authorName: text("author_name").notNull(),
    authorContactId: text("author_contact_id").references(() => contacts.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    commentableIdIdx: index("comments_commentable_type_id_idx").on(
      table.commentableType,
      table.commentableId,
    ),
    commentableSlugIdx: index("comments_commentable_type_slug_idx").on(
      table.commentableType,
      table.commentableSlug,
    ),
    authorContactIdx: index("comments_author_contact_id_idx").on(table.authorContactId),
    createdAtIdx: index("comments_created_at_idx").on(table.createdAt),
  }),
);
