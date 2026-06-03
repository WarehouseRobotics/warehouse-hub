import { z } from "zod";

const nullableString = z
  .union([z.string().min(1), z.literal(""), z.null()])
  .transform((value) => (value === "" ? null : value));

export const structuredTaxReportFieldSchema = z
  .object({
    fieldCode: z.string().min(1),
    fieldSystem: z.enum(["box", "casilla", "campo", "quadro", "rigo", "line", "other"]),
    label: nullableString,
    valueType: z.enum(["money", "number", "percent", "date", "text", "boolean"]).nullable(),
    rawValue: z.string(),
    normalizedValue: nullableString,
    currency: z.string().length(3).nullable(),
    rate: nullableString,
    direction: z.enum(["payable", "deductible", "credit", "refund", "informational"]).nullable(),
    confidence: z.enum(["low", "medium", "high"]).nullable(),
  })
  .strict();

export const structuredTaxReportCarryforwardDetailSchema = z
  .object({
    kind: z
      .enum([
        "tax_loss",
        "profit_base",
        "vat_credit",
        "withholding_credit",
        "installment_credit",
        "refund_credit",
        "other",
      ])
      .nullable(),
    originFiscalYear: z.number().int().nullable(),
    pendingAtStartOrGenerated: nullableString,
    appliedThisReturn: nullableString,
    pendingForFuture: nullableString,
    originalAmount: nullableString,
    usedAmount: nullableString,
    remainingAmount: nullableString,
    expiresAt: z.string().min(10).max(10).nullable(),
    notes: nullableString,
  })
  .strict();

export const structuredTaxReportSchema = z
  .object({
    schemaVersion: z.literal("tax_report.v1"),
    documentType: z.literal("tax_declaration"),
    countryCode: z.string().length(2).nullable(),
    authorityName: nullableString,
    formCode: nullableString,
    formName: nullableString,
    formVersion: nullableString,
    taxKind: z
      .enum([
        "vat",
        "corporate_income",
        "personal_income",
        "withholding",
        "payroll_tax",
        "local_business_tax",
        "social_security",
        "other",
      ])
      .nullable(),
    fiscalYear: z.number().int().nullable(),
    periodGranularity: z.enum(["month", "quarter", "year", "custom"]).nullable(),
    periodLabel: nullableString,
    periodStart: z.string().min(10).max(10).nullable(),
    periodEnd: z.string().min(10).max(10).nullable(),
    taxpayerTaxId: nullableString,
    authoritySubmissionId: nullableString,
    authorityReceiptNumber: nullableString,
    filedAt: nullableString,
    dueDate: z.string().min(10).max(10).nullable(),
    paymentDueDate: z.string().min(10).max(10).nullable(),
    result: z
      .enum([
        "payable",
        "refund_requested",
        "compensate",
        "zero",
        "no_activity",
        "informational",
        "unknown",
      ])
      .nullable(),
    paymentStatus: z
      .enum([
        "not_required",
        "unpaid",
        "partially_paid",
        "paid",
        "refund_pending",
        "refunded",
        "unknown",
      ])
      .nullable(),
    currency: z.string().length(3).nullable(),
    taxableBase: nullableString,
    taxDue: nullableString,
    taxDeductible: nullableString,
    resultAmount: nullableString,
    retainedAmount: nullableString,
    profitOrLoss: nullableString,
    fields: z.array(structuredTaxReportFieldSchema),
    carryforwardDetails: z.array(structuredTaxReportCarryforwardDetailSchema),
    warnings: z.array(z.string().min(1)),
    confidence: z.enum(["low", "medium", "high"]).nullable(),
    rawText: z.string().min(1),
    pageNotes: z.array(z.string().min(1)).nullable(),
  })
  .strict();

export type StructuredTaxReport = z.output<typeof structuredTaxReportSchema>;

export const structuredTaxReportJsonSchema = {
  name: "structured_tax_report_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", enum: ["tax_report.v1"] },
      documentType: { type: "string", enum: ["tax_declaration"] },
      countryCode: { type: ["string", "null"], minLength: 2, maxLength: 2 },
      authorityName: { type: ["string", "null"], description: "Tax authority name, such as AEAT" },
      formCode: { type: ["string", "null"], description: "Official form code, such as 303, 130, or 200" },
      formName: { type: ["string", "null"], description: "Official form name" },
      formVersion: { type: ["string", "null"] },
      taxKind: {
        type: ["string", "null"],
        enum: [
          "vat",
          "corporate_income",
          "personal_income",
          "withholding",
          "payroll_tax",
          "local_business_tax",
          "social_security",
          "other",
          null,
        ],
      },
      fiscalYear: { type: ["integer", "null"] },
      periodGranularity: { type: ["string", "null"], enum: ["month", "quarter", "year", "custom", null] },
      periodLabel: { type: ["string", "null"] },
      periodStart: { type: ["string", "null"], minLength: 10, maxLength: 10 },
      periodEnd: { type: ["string", "null"], minLength: 10, maxLength: 10 },
      taxpayerTaxId: { type: ["string", "null"] },
      authoritySubmissionId: { type: ["string", "null"] },
      authorityReceiptNumber: { type: ["string", "null"] },
      filedAt: { type: ["string", "null"] },
      dueDate: { type: ["string", "null"], minLength: 10, maxLength: 10 },
      paymentDueDate: { type: ["string", "null"], minLength: 10, maxLength: 10 },
      result: {
        type: ["string", "null"],
        enum: ["payable", "refund_requested", "compensate", "zero", "no_activity", "informational", "unknown", null],
      },
      paymentStatus: {
        type: ["string", "null"],
        enum: ["not_required", "unpaid", "partially_paid", "paid", "refund_pending", "refunded", "unknown", null],
      },
      currency: { type: ["string", "null"], minLength: 3, maxLength: 3 },
      taxableBase: { type: ["string", "null"] },
      taxDue: { type: ["string", "null"] },
      taxDeductible: { type: ["string", "null"] },
      resultAmount: { type: ["string", "null"] },
      retainedAmount: { type: ["string", "null"] },
      profitOrLoss: { type: ["string", "null"] },
      fields: {
        type: "array",
        description: "Authority field boxes, such as Spanish casillas. Preserve official field codes exactly, including leading zeros.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            fieldCode: { type: "string" },
            fieldSystem: { type: "string", enum: ["box", "casilla", "campo", "quadro", "rigo", "line", "other"] },
            label: { type: ["string", "null"] },
            valueType: { type: ["string", "null"], enum: ["money", "number", "percent", "date", "text", "boolean", null] },
            rawValue: {
              type: "string",
              description: "Visible field value only. Do not include or repeat the fieldCode/casilla code here.",
            },
            normalizedValue: { type: ["string", "null"], description: "Normalized numeric/date/text value when obvious; no currency symbols" },
            currency: { type: ["string", "null"], minLength: 3, maxLength: 3 },
            rate: { type: ["string", "null"] },
            direction: {
              type: ["string", "null"],
              enum: ["payable", "deductible", "credit", "refund", "informational", null],
            },
            confidence: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
          },
          required: [
            "fieldCode",
            "fieldSystem",
            "label",
            "valueType",
            "rawValue",
            "normalizedValue",
            "currency",
            "rate",
            "direction",
            "confidence"
          ],
        },
      },
      carryforwardDetails: {
        type: "array",
        description: "Rows or balances that affect future declarations, such as Modelo 200 negative-base compensation detail.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: {
              type: ["string", "null"],
              enum: [
                "tax_loss",
                "profit_base",
                "vat_credit",
                "withholding_credit",
                "installment_credit",
                "refund_credit",
                "other",
                null,
              ],
            },
            originFiscalYear: { type: ["integer", "null"] },
            pendingAtStartOrGenerated: { type: ["string", "null"] },
            appliedThisReturn: { type: ["string", "null"] },
            pendingForFuture: { type: ["string", "null"] },
            originalAmount: { type: ["string", "null"] },
            usedAmount: { type: ["string", "null"] },
            remainingAmount: { type: ["string", "null"] },
            expiresAt: { type: ["string", "null"], minLength: 10, maxLength: 10 },
            notes: { type: ["string", "null"] },
          },
          required: [
            "kind",
            "originFiscalYear",
            "pendingAtStartOrGenerated",
            "appliedThisReturn",
            "pendingForFuture",
            "originalAmount",
            "usedAmount",
            "remainingAmount",
            "expiresAt",
            "notes"
          ],
        },
      },
      warnings: { type: "array", items: { type: "string" } },
      confidence: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
      rawText: { type: "string", description: "Readable OCR text or concise source transcription for search/indexing" },
      pageNotes: { type: ["array", "null"], items: { type: "string" } },
    },
    required: [
      "schemaVersion",
      "documentType",
      "countryCode",
      "authorityName",
      "formCode",
      "formName",
      "formVersion",
      "taxKind",
      "fiscalYear",
      "periodGranularity",
      "periodLabel",
      "periodStart",
      "periodEnd",
      "taxpayerTaxId",
      "authoritySubmissionId",
      "authorityReceiptNumber",
      "filedAt",
      "dueDate",
      "paymentDueDate",
      "result",
      "paymentStatus",
      "currency",
      "taxableBase",
      "taxDue",
      "taxDeductible",
      "resultAmount",
      "retainedAmount",
      "profitOrLoss",
      "fields",
      "carryforwardDetails",
      "warnings",
      "confidence",
      "rawText",
      "pageNotes"
    ],
  },
} as const;
