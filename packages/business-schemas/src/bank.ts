import { z } from "zod";

export const bankAccountStatusSchema = z.enum(["active", "archived"]);

export const bankAccountInputSchema = z
  .object({
    bankName: z.string().min(1),
    displayName: z.string().min(1),
    maskedIdentifier: z.string().min(1).optional(),
    ibanMasked: z.string().min(1).optional(),
    currency: z.string().length(3),
    status: bankAccountStatusSchema.default("active"),
  })
  .strict();

export const bankAccountPatchSchema = bankAccountInputSchema.partial();

export const bankTransactionKindSchema = z.enum([
  "bank_transaction",
  "opening_balance",
  "balance_adjustment",
  "transfer",
]);

export const bankTransactionStatusSchema = z.enum(["recorded", "needs_review", "void"]);
export const bankConfidenceSchema = z.enum(["low", "medium", "high"]);

export const bankTransactionInputSchema = z
  .object({
    bankAccountId: z.string().min(1),
    transactionDate: z.string().min(10).max(10),
    postedAt: z.string().min(1).optional(),
    amount: z.string().min(1),
    currency: z.string().length(3),
    description: z.string().min(1),
    counterpartyName: z.string().min(1).optional(),
    reference: z.string().min(1).optional(),
    runningBalance: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    confidence: bankConfidenceSchema.default("medium"),
    kind: bankTransactionKindSchema.default("bank_transaction"),
    status: bankTransactionStatusSchema.default("recorded"),
    documentId: z.string().min(1).optional(),
  })
  .strict();

export const bankTransactionPatchSchema = bankTransactionInputSchema
  .omit({ bankAccountId: true })
  .partial();

export const bankTransactionUpsertSchema = bankTransactionInputSchema.extend({
  fingerprint: z.string().min(1).optional(),
});

export const bankBalanceSnapshotInputSchema = z
  .object({
    bankAccountId: z.string().min(1),
    observedAt: z.string().min(1),
    balance: z.string().min(1),
    currency: z.string().length(3),
    source: z.string().min(1).optional(),
    confidence: bankConfidenceSchema.default("medium"),
    documentId: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();

export const bankTransactionMatchTargetTypeSchema = z.enum(["expense", "sales_invoice", "payroll"]);
export const bankTransactionMatchStatusSchema = z.enum(["suggested", "confirmed", "rejected"]);

export const bankTransactionMatchInputSchema = z
  .object({
    bankTransactionId: z.string().min(1),
    targetType: bankTransactionMatchTargetTypeSchema,
    targetId: z.string().min(1),
    status: bankTransactionMatchStatusSchema.default("suggested"),
    confidence: bankConfidenceSchema.default("medium"),
    reason: z.string().min(1).optional(),
  })
  .strict();

export const bankTransactionMatchPatchSchema = z
  .object({
    status: bankTransactionMatchStatusSchema.optional(),
    confidence: bankConfidenceSchema.optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();

export const bankCsvImportOptionsSchema = z
  .object({
    dateColumn: z.string().min(1).default("date"),
    amountColumn: z.string().min(1).default("amount"),
    descriptionColumn: z.string().min(1).default("description"),
    referenceColumn: z.string().min(1).optional(),
    balanceColumn: z.string().min(1).optional(),
    currencyColumn: z.string().min(1).optional(),
    defaultCurrency: z.string().length(3).optional(),
    source: z.string().min(1).default("bank_csv"),
  })
  .strict();

export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;
export type BankAccountPatch = z.infer<typeof bankAccountPatchSchema>;
export type BankTransactionInput = z.infer<typeof bankTransactionInputSchema>;
export type BankTransactionPatch = z.infer<typeof bankTransactionPatchSchema>;
export type BankTransactionUpsert = z.infer<typeof bankTransactionUpsertSchema>;
export type BankBalanceSnapshotInput = z.infer<typeof bankBalanceSnapshotInputSchema>;
export type BankTransactionMatchInput = z.infer<typeof bankTransactionMatchInputSchema>;
export type BankTransactionMatchPatch = z.infer<typeof bankTransactionMatchPatchSchema>;
export type BankCsvImportOptions = z.infer<typeof bankCsvImportOptionsSchema>;
