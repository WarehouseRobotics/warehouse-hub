import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { companyCard } from "./company-card.js";
import { contacts } from "./contacts.js";
import { deals } from "./deals.js";
import { documents } from "./documents.js";

export const salesInvoices = sqliteTable("sales_invoices", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  companyCardId: text("company_card_id")
    .notNull()
    .references(() => companyCard.id),
  customerContactId: text("customer_contact_id")
    .notNull()
    .references(() => contacts.id),
  dealId: text("deal_id").references(() => deals.id),
  issueDate: text("issue_date").notNull(),
  serviceDate: text("service_date"),
  dueDate: text("due_date"),
  currency: text("currency").notNull(),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  lineItems: text("line_items").notNull(),
  net: text("net").notNull(),
  tax: text("tax").notNull(),
  gross: text("gross").notNull(),
  status: text("status").notNull().default("draft"),
  pdfDocumentId: text("pdf_document_id").references(() => documents.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
});

export const invoiceNumberSeq = sqliteTable("invoice_number_seq", {
  year: integer("year").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});
