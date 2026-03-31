import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { contacts } from "./contacts.js";

export const deals = sqliteTable("deals", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  customerContactId: text("customer_contact_id")
    .notNull()
    .references(() => contacts.id),
  title: text("title").notNull(),
  stage: text("stage").notNull(),
  currency: text("currency").notNull(),
  expectedCloseDate: text("expected_close_date"),
  lineItems: text("line_items").notNull(),
  net: text("net").notNull(),
  tax: text("tax").notNull(),
  gross: text("gross").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
});
