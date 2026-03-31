import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { contacts } from "./contacts.js";
import { documents } from "./documents.js";

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    supplierContactId: text("supplier_contact_id")
      .notNull()
      .references(() => contacts.id),
    documentId: text("document_id").references(() => documents.id),
    invoiceNumber: text("invoice_number"),
    invoiceDate: text("invoice_date"),
    dueDate: text("due_date"),
    currency: text("currency").notNull(),
    net: text("net").notNull(),
    tax: text("tax").notNull(),
    gross: text("gross").notNull(),
    taxLines: text("tax_lines"),
    category: text("category"),
    notes: text("notes"),
    status: text("status").notNull().default("recorded"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    supplierContactIdx: index("expenses_supplier_contact_id_idx").on(table.supplierContactId),
  }),
);
