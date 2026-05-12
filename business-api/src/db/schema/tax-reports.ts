import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { bankTransactions } from "./bank.js";
import { companyCard } from "./company-card.js";
import { documents } from "./documents.js";

export const taxReports = sqliteTable(
  "tax_reports",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    companyCardId: text("company_card_id")
      .notNull()
      .references(() => companyCard.id),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    countryCode: text("country_code").notNull(),
    jurisdiction: text("jurisdiction"),
    taxKind: text("tax_kind").notNull(),
    formCode: text("form_code").notNull(),
    formName: text("form_name"),
    formVersion: text("form_version"),
    fiscalYear: integer("fiscal_year").notNull(),
    periodGranularity: text("period_granularity").notNull(),
    periodLabel: text("period_label").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    taxpayerTaxId: text("taxpayer_tax_id"),
    authoritySubmissionId: text("authority_submission_id"),
    authorityReceiptNumber: text("authority_receipt_number"),
    filedAt: text("filed_at"),
    dueDate: text("due_date"),
    paymentDueDate: text("payment_due_date"),
    status: text("status").notNull().default("filed"),
    result: text("result").notNull().default("unknown"),
    paymentStatus: text("payment_status").notNull().default("unknown"),
    currency: text("currency").notNull(),
    taxableBase: text("taxable_base"),
    taxDue: text("tax_due"),
    taxDeductible: text("tax_deductible"),
    resultAmount: text("result_amount"),
    retainedAmount: text("retained_amount"),
    profitOrLoss: text("profit_or_loss"),
    confidence: text("confidence").notNull().default("medium"),
    fingerprint: text("fingerprint").notNull(),
    extractedDataJson: text("extracted_data_json"),
    warningsJson: text("warnings_json").notNull().default("[]"),
    correctionOfTaxReportId: text("correction_of_tax_report_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    companyCountryKindYearIdx: index("tax_reports_company_country_kind_year_idx").on(
      table.companyCardId,
      table.countryCode,
      table.taxKind,
      table.fiscalYear,
    ),
    statusIdx: index("tax_reports_status_idx").on(table.status),
    paymentStatusIdx: index("tax_reports_payment_status_idx").on(table.paymentStatus),
    periodIdx: index("tax_reports_period_idx").on(table.periodEnd, table.periodStart),
    formIdx: index("tax_reports_form_idx").on(table.countryCode, table.formCode),
    correctionIdx: index("tax_reports_correction_idx").on(table.correctionOfTaxReportId),
    fingerprintUniqueIdx: uniqueIndex("tax_reports_company_fingerprint_unique_idx").on(
      table.companyCardId,
      table.fingerprint,
    ),
  }),
);

export const taxReportFacts = sqliteTable(
  "tax_report_facts",
  {
    id: text("id").primaryKey(),
    taxReportId: text("tax_report_id")
      .notNull()
      .references(() => taxReports.id),
    countryCode: text("country_code").notNull(),
    formCode: text("form_code").notNull(),
    fieldCode: text("field_code").notNull(),
    fieldSystem: text("field_system").notNull(),
    label: text("label"),
    valueType: text("value_type").notNull(),
    rawValue: text("raw_value").notNull(),
    normalizedValue: text("normalized_value"),
    currency: text("currency"),
    rate: text("rate"),
    direction: text("direction"),
    confidence: text("confidence").notNull().default("medium"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    reportIdx: index("tax_report_facts_report_idx").on(table.taxReportId),
    fieldIdx: index("tax_report_facts_field_idx").on(
      table.countryCode,
      table.formCode,
      table.fieldSystem,
      table.fieldCode,
    ),
  }),
);

export const taxCarryforwards = sqliteTable(
  "tax_carryforwards",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    companyCardId: text("company_card_id")
      .notNull()
      .references(() => companyCard.id),
    countryCode: text("country_code").notNull(),
    jurisdiction: text("jurisdiction"),
    taxKind: text("tax_kind").notNull(),
    kind: text("kind").notNull(),
    originTaxReportId: text("origin_tax_report_id")
      .notNull()
      .references(() => taxReports.id),
    originFiscalYear: integer("origin_fiscal_year").notNull(),
    originPeriodLabel: text("origin_period_label").notNull(),
    currency: text("currency").notNull(),
    originalAmount: text("original_amount").notNull(),
    usedAmount: text("used_amount").notNull().default("0.00"),
    remainingAmount: text("remaining_amount").notNull(),
    expiresAt: text("expires_at"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    companyKindStatusYearIdx: index("tax_carryforwards_company_kind_status_year_idx").on(
      table.companyCardId,
      table.kind,
      table.status,
      table.originFiscalYear,
    ),
    reportIdx: index("tax_carryforwards_origin_report_idx").on(table.originTaxReportId),
    countryTaxKindIdx: index("tax_carryforwards_country_tax_kind_idx").on(table.countryCode, table.taxKind),
  }),
);

export const taxReportPaymentLinks = sqliteTable(
  "tax_report_payment_links",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    taxReportId: text("tax_report_id")
      .notNull()
      .references(() => taxReports.id),
    bankTransactionId: text("bank_transaction_id").references(() => bankTransactions.id),
    documentId: text("document_id").references(() => documents.id),
    amount: text("amount").notNull(),
    currency: text("currency").notNull(),
    paidAt: text("paid_at"),
    paymentReference: text("payment_reference"),
    status: text("status").notNull().default("suggested"),
    confidence: text("confidence").notNull().default("medium"),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    reportStatusIdx: index("tax_report_payment_links_report_status_idx").on(table.taxReportId, table.status),
    bankTransactionIdx: index("tax_report_payment_links_bank_transaction_idx").on(table.bankTransactionId),
    documentIdx: index("tax_report_payment_links_document_idx").on(table.documentId),
    uniqueBankTransactionIdx: uniqueIndex("tax_report_payment_links_unique_bank_transaction_idx")
      .on(table.taxReportId, table.bankTransactionId)
      .where(sql`${table.bankTransactionId} IS NOT NULL`),
    uniqueDocumentIdx: uniqueIndex("tax_report_payment_links_unique_document_idx")
      .on(table.taxReportId, table.documentId)
      .where(sql`${table.documentId} IS NOT NULL`),
    uniquePaymentReferenceIdx: uniqueIndex("tax_report_payment_links_unique_payment_reference_idx")
      .on(table.taxReportId, table.paymentReference)
      .where(sql`${table.paymentReference} IS NOT NULL`),
    uniqueEvidenceIdx: uniqueIndex("tax_report_payment_links_unique_evidence_idx")
      .on(
        table.taxReportId,
        table.bankTransactionId,
        table.documentId,
        table.paymentReference,
      )
      .where(sql`
        ${table.bankTransactionId} IS NOT NULL
        AND ${table.documentId} IS NOT NULL
        AND ${table.paymentReference} IS NOT NULL
      `),
  }),
);
