import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { companyCard } from "./company-card.js";
import { contacts } from "./contacts.js";
import { documents } from "./documents.js";

export const payrolls = sqliteTable(
  "payrolls",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    companyCardId: text("company_card_id")
      .notNull()
      .references(() => companyCard.id),
    employeeContactId: text("employee_contact_id")
      .notNull()
      .references(() => contacts.id),
    documentId: text("document_id").references(() => documents.id),
    payrollNumber: text("payroll_number"),
    countryCode: text("country_code"),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    paymentDate: text("payment_date"),
    currency: text("currency").notNull(),
    grossSalary: text("gross_salary").notNull(),
    netSalary: text("net_salary").notNull(),
    employeeTaxWithheld: text("employee_tax_withheld").notNull(),
    employeeSocialContributions: text("employee_social_contributions").notNull(),
    employerSocialContributions: text("employer_social_contributions").notNull(),
    otherDeductions: text("other_deductions").notNull(),
    otherEarnings: text("other_earnings").notNull(),
    rawLines: text("raw_lines").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("recorded"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    employeeContactIdx: index("payrolls_employee_contact_id_idx").on(table.employeeContactId),
    periodIdx: index("payrolls_period_idx").on(table.periodStart, table.periodEnd),
  }),
);
