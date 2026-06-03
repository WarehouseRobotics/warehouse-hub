import { z } from "zod";

export const taxKindSchema = z.enum([
  "vat",
  "corporate_income",
  "personal_income",
  "withholding",
  "payroll_tax",
  "local_business_tax",
  "social_security",
  "other",
]);

export const taxReportStatusSchema = z.enum([
  "draft_extracted",
  "filed",
  "amended",
  "superseded",
  "void",
  "needs_review",
]);

export const taxReportResultSchema = z.enum([
  "payable",
  "refund_requested",
  "compensate",
  "zero",
  "no_activity",
  "informational",
  "unknown",
]);

export const taxReportPaymentStatusSchema = z.enum([
  "not_required",
  "unpaid",
  "partially_paid",
  "paid",
  "refund_pending",
  "refunded",
  "unknown",
]);

export const taxPeriodGranularitySchema = z.enum([
  "month",
  "quarter",
  "year",
  "custom",
]);
export const taxConfidenceSchema = z.enum(["low", "medium", "high"]);
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const taxReportFactFieldSystemSchema = z.enum([
  "box",
  "casilla",
  "campo",
  "quadro",
  "rigo",
  "line",
  "other",
]);

export const taxReportFactValueTypeSchema = z.enum([
  "money",
  "number",
  "percent",
  "date",
  "text",
  "boolean",
]);

export const taxReportFactDirectionSchema = z.enum([
  "payable",
  "deductible",
  "credit",
  "refund",
  "informational",
]);

export const taxCarryforwardKindSchema = z.enum([
  "tax_loss",
  "profit_base",
  "vat_credit",
  "withholding_credit",
  "installment_credit",
  "refund_credit",
  "other",
]);

export const taxCarryforwardStatusSchema = z.enum([
  "active",
  "used",
  "expired",
  "superseded",
  "needs_review",
]);

export const taxReportPaymentLinkStatusSchema = z.enum([
  "suggested",
  "confirmed",
  "rejected",
]);

export const taxReportSchema = z
  .object({
    taxReportId: z.string().min(1),
    slug: z.string().min(1),
    companyCardId: z.string().min(1),
    documentId: z.string().min(1),
    countryCode: z.string().min(2),
    jurisdiction: z.union([z.string().min(1), z.null()]).optional(),
    taxKind: taxKindSchema,
    formCode: z.string().min(1),
    formName: z.union([z.string().min(1), z.null()]).optional(),
    formVersion: z.union([z.string().min(1), z.null()]).optional(),
    fiscalYear: z.number().int(),
    periodGranularity: taxPeriodGranularitySchema,
    periodLabel: z.string().min(1),
    periodStart: z.string().min(10).max(10),
    periodEnd: z.string().min(10).max(10),
    taxpayerTaxId: z.union([z.string().min(1), z.null()]).optional(),
    authoritySubmissionId: z.union([z.string().min(1), z.null()]).optional(),
    authorityReceiptNumber: z.union([z.string().min(1), z.null()]).optional(),
    filedAt: z.union([z.string().min(1), z.null()]).optional(),
    dueDate: z.union([z.string().min(10).max(10), z.null()]).optional(),
    paymentDueDate: z.union([z.string().min(10).max(10), z.null()]).optional(),
    status: taxReportStatusSchema,
    result: taxReportResultSchema,
    paymentStatus: taxReportPaymentStatusSchema,
    currency: currencyCodeSchema,
    taxableBase: z.union([z.string().min(1), z.null()]).optional(),
    taxDue: z.union([z.string().min(1), z.null()]).optional(),
    taxDeductible: z.union([z.string().min(1), z.null()]).optional(),
    resultAmount: z.union([z.string().min(1), z.null()]).optional(),
    retainedAmount: z.union([z.string().min(1), z.null()]).optional(),
    profitOrLoss: z.union([z.string().min(1), z.null()]).optional(),
    confidence: taxConfidenceSchema,
    fingerprint: z.string().min(1),
    extractedData: z.unknown(),
    warnings: z.array(z.string()),
    correctionOfTaxReportId: z.union([z.string().min(1), z.null()]).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    deletedAt: z.union([z.string().min(1), z.null()]).optional(),
  })
  .strict();

export const taxReportInputSchema = taxReportSchema
  .omit({
    taxReportId: true,
    slug: true,
    fingerprint: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  })
  .extend({
    status: taxReportStatusSchema.default("filed"),
    result: taxReportResultSchema.default("unknown"),
    paymentStatus: taxReportPaymentStatusSchema.default("unknown"),
    confidence: taxConfidenceSchema.default("medium"),
    extractedData: z.unknown().optional(),
    warnings: z.array(z.string()).default([]),
  })
  .strict();

export const taxReportFingerprintInputSchema = z
  .object({
    companyCardId: z.string().min(1),
    countryCode: z.string().min(2),
    taxKind: taxKindSchema,
    formCode: z.string().min(1),
    periodStart: z.string().min(10).max(10),
    periodEnd: z.string().min(10).max(10),
    taxpayerTaxId: z.union([z.string().min(1), z.null()]).optional(),
    authoritySubmissionId: z.union([z.string().min(1), z.null()]).optional(),
    authorityReceiptNumber: z.union([z.string().min(1), z.null()]).optional(),
  })
  .strict();

export const taxReportFactSchema = z
  .object({
    taxReportFactId: z.string().min(1),
    taxReportId: z.string().min(1),
    countryCode: z.string().min(2),
    formCode: z.string().min(1),
    fieldCode: z.string().min(1),
    fieldSystem: taxReportFactFieldSystemSchema,
    label: z.union([z.string().min(1), z.null()]).optional(),
    valueType: taxReportFactValueTypeSchema,
    rawValue: z.string().min(1),
    normalizedValue: z.union([z.string().min(1), z.null()]).optional(),
    currency: z.union([currencyCodeSchema, z.null()]).optional(),
    rate: z.union([z.string().min(1), z.null()]).optional(),
    direction: z.union([taxReportFactDirectionSchema, z.null()]).optional(),
    confidence: taxConfidenceSchema,
    createdAt: z.string().min(1),
  })
  .strict();

export const taxReportFactInputSchema = taxReportFactSchema
  .omit({
    taxReportFactId: true,
    createdAt: true,
  })
  .extend({
    confidence: taxConfidenceSchema.default("medium"),
  })
  .strict();

export const taxReportFactCreateInputSchema = taxReportFactSchema
  .omit({
    taxReportFactId: true,
    taxReportId: true,
    countryCode: true,
    formCode: true,
    createdAt: true,
  })
  .extend({
    confidence: taxConfidenceSchema.default("medium"),
  })
  .strict();

export const taxCarryforwardSchema = z
  .object({
    taxCarryforwardId: z.string().min(1),
    slug: z.string().min(1),
    companyCardId: z.string().min(1),
    countryCode: z.string().min(2),
    jurisdiction: z.union([z.string().min(1), z.null()]).optional(),
    taxKind: taxKindSchema,
    kind: taxCarryforwardKindSchema,
    originTaxReportId: z.string().min(1),
    originFiscalYear: z.number().int(),
    originPeriodLabel: z.string().min(1),
    currency: currencyCodeSchema,
    originalAmount: z.string().min(1),
    usedAmount: z.string().min(1),
    remainingAmount: z.string().min(1),
    expiresAt: z.union([z.string().min(1), z.null()]).optional(),
    status: taxCarryforwardStatusSchema,
    notes: z.union([z.string().min(1), z.null()]).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    deletedAt: z.union([z.string().min(1), z.null()]).optional(),
  })
  .strict();

export const spainTaxPositionSchema = z
  .object({
    companyCardId: z.string().min(1),
    countryCode: z.literal("ES"),
    fiscalYear: z.number().int().positive(),
    vat: z
      .object({
        latestPeriodLabel: z.string().min(1),
        latestTaxReportId: z.string().min(1),
        result: taxReportResultSchema,
        resultAmount: z.string().min(1),
        remainingVatCredit: z.union([z.string().min(1), z.null()]).optional(),
        refundRequested: z.union([z.string().min(1), z.null()]).optional(),
        paymentStatus: taxReportPaymentStatusSchema,
      })
      .strict()
      .optional(),
    autonomoIrpf: z
      .object({
        latestPeriodLabel: z.string().min(1),
        latestTaxReportId: z.string().min(1),
        ytdIncome: z.string().min(1),
        ytdExpenses: z.string().min(1),
        ytdNetProfitOrLoss: z.string().min(1),
        retentions: z.string().min(1),
        installmentResult: z.string().min(1),
        negativeToDeductSameYear: z.union([z.string().min(1), z.null()]).optional(),
      })
      .strict()
      .optional(),
    corporateIncome: z
      .object({
        latestFiscalYear: z.number().int().positive(),
        latestTaxReportId: z.string().min(1),
        accountingResult: z.union([z.string().min(1), z.null()]).optional(),
        preCompensationTaxableBase: z.union([z.string().min(1), z.null()]).optional(),
        priorNegativeBaseApplied: z.union([z.string().min(1), z.null()]).optional(),
        taxableBase: z.union([z.string().min(1), z.null()]).optional(),
        currentYearProfitOrLoss: z.union([z.string().min(1), z.null()]).optional(),
        remainingCompensableNegativeBase: z.union([z.string().min(1), z.null()]).optional(),
      })
      .strict()
      .optional(),
    warnings: z.array(z.string()),
    confidence: taxConfidenceSchema,
  })
  .strict();

export const taxCarryforwardInputSchema = taxCarryforwardSchema
  .omit({
    taxCarryforwardId: true,
    slug: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  })
  .extend({
    originFiscalYear: z.number().int().optional(),
    originPeriodLabel: z.string().min(1).optional(),
    status: taxCarryforwardStatusSchema.default("active"),
  })
  .strict();

export const taxCarryforwardCreateInputSchema = taxCarryforwardSchema
  .omit({
    taxCarryforwardId: true,
    slug: true,
    companyCardId: true,
    countryCode: true,
    jurisdiction: true,
    taxKind: true,
    originTaxReportId: true,
    originFiscalYear: true,
    originPeriodLabel: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  })
  .extend({
    originFiscalYear: z.number().int().optional(),
    originPeriodLabel: z.string().min(1).optional(),
    status: taxCarryforwardStatusSchema.default("active"),
  })
  .strict();

export const taxReportPaymentLinkSchema = z
  .object({
    taxReportPaymentLinkId: z.string().min(1),
    slug: z.string().min(1),
    taxReportId: z.string().min(1),
    bankTransactionId: z.union([z.string().min(1), z.null()]).optional(),
    documentId: z.union([z.string().min(1), z.null()]).optional(),
    amount: z.string().min(1),
    currency: currencyCodeSchema,
    paidAt: z.union([z.string().min(1), z.null()]).optional(),
    paymentReference: z.union([z.string().min(1), z.null()]).optional(),
    status: taxReportPaymentLinkStatusSchema,
    confidence: taxConfidenceSchema,
    reason: z.union([z.string().min(1), z.null()]).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    deletedAt: z.union([z.string().min(1), z.null()]).optional(),
  })
  .strict();

const taxReportPaymentLinkInputObjectSchema = taxReportPaymentLinkSchema
  .omit({
    taxReportPaymentLinkId: true,
    slug: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  })
  .extend({
    status: taxReportPaymentLinkStatusSchema.default("suggested"),
    confidence: taxConfidenceSchema.default("medium"),
  })
  .strict();

export const taxReportPaymentLinkInputSchema =
  taxReportPaymentLinkInputObjectSchema.superRefine((input, context) => {
    if (!input.bankTransactionId && !input.documentId && !input.paymentReference) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one of bankTransactionId, documentId, or paymentReference is required",
      });
    }
  });

export const taxReportPaymentLinkCreateInputSchema =
  taxReportPaymentLinkInputSchema;

export const taxReportPaymentLinkPatchSchema = z
  .object({
    status: taxReportPaymentLinkStatusSchema.optional(),
    confidence: taxConfidenceSchema.optional(),
    reason: z.union([z.string().min(1), z.null()]).optional(),
  })
  .strict();

export const taxReportPaymentReceiptUploadSchema = z
  .object({
    kind: z
      .enum(["tax_payment_receipt", "tax_authority_notice"])
      .default("tax_payment_receipt"),
    source: z.string().min(1).optional(),
    link: taxReportPaymentLinkInputObjectSchema.omit({
      taxReportId: true,
      documentId: true,
    }),
  })
  .strict();

export const taxReportCreateRequestSchema = taxReportInputSchema
  .extend({
    facts: z.array(taxReportFactCreateInputSchema).default([]),
    carryforwards: z.array(taxCarryforwardCreateInputSchema).default([]),
  })
  .strict();

export const taxReportIngestKindSchema = z.literal("tax_declaration");
export const taxReportIngestStatusOverrideSchema = z.enum([
  "filed",
  "needs_review",
  "amended",
]);

export const taxReportIngestOverridesSchema = z
  .object({
    countryCode: z.string().min(2).optional(),
    jurisdiction: z.union([z.string().min(1), z.null()]).optional(),
    taxKind: taxKindSchema.optional(),
    formCode: z.string().min(1).optional(),
    formName: z.union([z.string().min(1), z.null()]).optional(),
    formVersion: z.union([z.string().min(1), z.null()]).optional(),
    fiscalYear: z.coerce.number().int().positive().optional(),
    periodGranularity: taxPeriodGranularitySchema.optional(),
    periodLabel: z.string().min(1).optional(),
    periodStart: z.string().min(10).max(10).optional(),
    periodEnd: z.string().min(10).max(10).optional(),
    taxpayerTaxId: z.union([z.string().min(1), z.null()]).optional(),
    authoritySubmissionId: z.union([z.string().min(1), z.null()]).optional(),
    authorityReceiptNumber: z.union([z.string().min(1), z.null()]).optional(),
    filedAt: z.union([z.string().min(1), z.null()]).optional(),
    dueDate: z.union([z.string().min(10).max(10), z.null()]).optional(),
    paymentDueDate: z.union([z.string().min(10).max(10), z.null()]).optional(),
    status: taxReportIngestStatusOverrideSchema.optional(),
    result: taxReportResultSchema.optional(),
    paymentStatus: taxReportPaymentStatusSchema.optional(),
    currency: currencyCodeSchema.optional(),
    taxableBase: z.union([z.string().min(1), z.null()]).optional(),
    taxDue: z.union([z.string().min(1), z.null()]).optional(),
    taxDeductible: z.union([z.string().min(1), z.null()]).optional(),
    resultAmount: z.union([z.string().min(1), z.null()]).optional(),
    retainedAmount: z.union([z.string().min(1), z.null()]).optional(),
    profitOrLoss: z.union([z.string().min(1), z.null()]).optional(),
    confidence: taxConfidenceSchema.optional(),
    correctionOfTaxReportId: z.union([z.string().min(1), z.null()]).optional(),
  })
  .strict();

export const taxReportIngestSchema = z
  .object({
    kind: taxReportIngestKindSchema.default("tax_declaration"),
    companyCardId: z.string().min(1),
    countryCode: z.string().min(2).optional(),
    taxKind: taxKindSchema.optional(),
    formCode: z.string().min(1).optional(),
    fiscalYear: z.coerce.number().int().positive().optional(),
    periodLabel: z.string().min(1).optional(),
    source: z.string().optional(),
    overrides: taxReportIngestOverridesSchema.optional(),
  })
  .strict();

export type TaxKind = z.infer<typeof taxKindSchema>;
export type TaxReportStatus = z.infer<typeof taxReportStatusSchema>;
export type TaxReportResult = z.infer<typeof taxReportResultSchema>;
export type TaxReportPaymentStatus = z.infer<
  typeof taxReportPaymentStatusSchema
>;
export type TaxPeriodGranularity = z.infer<typeof taxPeriodGranularitySchema>;
export type TaxConfidence = z.infer<typeof taxConfidenceSchema>;
export type TaxReport = z.infer<typeof taxReportSchema>;
export type TaxReportInput = z.infer<typeof taxReportInputSchema>;
export type TaxReportCreateRequest = z.infer<
  typeof taxReportCreateRequestSchema
>;
export type TaxReportFingerprintInput = z.infer<
  typeof taxReportFingerprintInputSchema
>;
export type TaxReportFact = z.infer<typeof taxReportFactSchema>;
export type TaxReportFactInput = z.infer<typeof taxReportFactInputSchema>;
export type TaxReportFactCreateInput = z.infer<
  typeof taxReportFactCreateInputSchema
>;
export type TaxCarryforward = z.infer<typeof taxCarryforwardSchema>;
export type SpainTaxPosition = z.infer<typeof spainTaxPositionSchema>;
export type TaxCarryforwardInput = z.infer<typeof taxCarryforwardInputSchema>;
export type TaxCarryforwardCreateInput = z.infer<
  typeof taxCarryforwardCreateInputSchema
>;
export type TaxReportPaymentLink = z.infer<typeof taxReportPaymentLinkSchema>;
export type TaxReportPaymentLinkInput = z.infer<
  typeof taxReportPaymentLinkInputSchema
>;
export type TaxReportPaymentLinkCreateInput = z.infer<
  typeof taxReportPaymentLinkCreateInputSchema
>;
export type TaxReportPaymentLinkPatch = z.infer<
  typeof taxReportPaymentLinkPatchSchema
>;
export type TaxReportPaymentReceiptUpload = z.infer<
  typeof taxReportPaymentReceiptUploadSchema
>;
export type TaxReportIngestKind = z.infer<typeof taxReportIngestKindSchema>;
export type TaxReportIngestOverrides = z.infer<
  typeof taxReportIngestOverridesSchema
>;
export type TaxReportIngestInput = z.infer<typeof taxReportIngestSchema>;
