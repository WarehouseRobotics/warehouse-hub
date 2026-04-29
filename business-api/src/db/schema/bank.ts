import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { companyCard } from "./company-card.js";
import { documents } from "./documents.js";

export const bankAccounts = sqliteTable(
  "bank_accounts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    companyCardId: text("company_card_id")
      .notNull()
      .references(() => companyCard.id),
    bankName: text("bank_name").notNull(),
    displayName: text("display_name").notNull(),
    maskedIdentifier: text("masked_identifier"),
    ibanMasked: text("iban_masked"),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    statusIdx: index("bank_accounts_status_idx").on(table.status),
  }),
);

export const bankTransactions = sqliteTable(
  "bank_transactions",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    companyCardId: text("company_card_id")
      .notNull()
      .references(() => companyCard.id),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id),
    documentId: text("document_id").references(() => documents.id),
    transactionDate: text("transaction_date").notNull(),
    postedAt: text("posted_at"),
    amount: text("amount").notNull(),
    currency: text("currency").notNull(),
    description: text("description").notNull(),
    counterpartyName: text("counterparty_name"),
    reference: text("reference"),
    runningBalance: text("running_balance"),
    source: text("source"),
    confidence: text("confidence").notNull().default("medium"),
    kind: text("kind").notNull().default("bank_transaction"),
    status: text("status").notNull().default("recorded"),
    fingerprint: text("fingerprint").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    accountDateIdx: index("bank_transactions_account_date_idx").on(table.bankAccountId, table.transactionDate),
    statusIdx: index("bank_transactions_status_idx").on(table.status),
    fingerprintUniqueIdx: uniqueIndex("bank_transactions_account_fingerprint_unique_idx").on(
      table.bankAccountId,
      table.fingerprint,
    ),
  }),
);

export const bankBalanceSnapshots = sqliteTable(
  "bank_balance_snapshots",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    companyCardId: text("company_card_id")
      .notNull()
      .references(() => companyCard.id),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id),
    documentId: text("document_id").references(() => documents.id),
    observedAt: text("observed_at").notNull(),
    balance: text("balance").notNull(),
    currency: text("currency").notNull(),
    source: text("source"),
    confidence: text("confidence").notNull().default("medium"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    accountObservedIdx: index("bank_balance_snapshots_account_observed_idx").on(table.bankAccountId, table.observedAt),
  }),
);

export const bankTransactionMatches = sqliteTable(
  "bank_transaction_matches",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    bankTransactionId: text("bank_transaction_id")
      .notNull()
      .references(() => bankTransactions.id),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    status: text("status").notNull().default("suggested"),
    confidence: text("confidence").notNull().default("medium"),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    transactionIdx: index("bank_transaction_matches_transaction_idx").on(table.bankTransactionId),
    targetIdx: index("bank_transaction_matches_target_idx").on(table.targetType, table.targetId),
    uniqueTargetIdx: uniqueIndex("bank_transaction_matches_unique_idx").on(
      table.bankTransactionId,
      table.targetType,
      table.targetId,
    ),
  }),
);
