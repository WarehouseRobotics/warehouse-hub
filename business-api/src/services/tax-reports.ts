import { createHash } from "node:crypto";

import {
  taxCarryforwards,
  taxReportFacts,
  taxReportPaymentLinks,
  taxReports,
} from "../db/schema/index.js";
import type { TaxReportFingerprintInput } from "@warehouse-hub/business-schemas";

type TaxReportRecord = typeof taxReports.$inferSelect;
type TaxReportFactRecord = typeof taxReportFacts.$inferSelect;
type TaxCarryforwardRecord = typeof taxCarryforwards.$inferSelect;
type TaxReportPaymentLinkRecord = typeof taxReportPaymentLinks.$inferSelect;

function normalizeFingerprintPart(value: string | null | undefined, options: { uppercase?: boolean } = {}): string {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  return options.uppercase === false ? normalized : normalized.toUpperCase();
}

function parseJsonValue(value: string | null | undefined, warningCode: string): { value: unknown; warning?: string } {
  if (!value) {
    return { value: null };
  }

  try {
    return { value: JSON.parse(value) as unknown };
  } catch {
    return { value: null, warning: warningCode };
  }
}

function parseWarnings(value: string | null | undefined): string[] {
  const parsed = parseJsonValue(value, "malformed_warnings_json");
  if (parsed.warning) {
    return [parsed.warning];
  }

  if (!Array.isArray(parsed.value)) {
    return [];
  }

  const warnings = parsed.value.filter((warning): warning is string => typeof warning === "string");
  if (warnings.length !== parsed.value.length) {
    warnings.push("non_string_warning_dropped");
  }

  return warnings;
}

export function createTaxReportFingerprint(input: TaxReportFingerprintInput): string {
  return createHash("sha256")
    .update(
      [
        normalizeFingerprintPart(input.companyCardId, { uppercase: false }),
        normalizeFingerprintPart(input.countryCode),
        normalizeFingerprintPart(input.taxKind),
        normalizeFingerprintPart(input.formCode),
        normalizeFingerprintPart(input.periodStart),
        normalizeFingerprintPart(input.periodEnd),
        normalizeFingerprintPart(input.taxpayerTaxId),
        normalizeFingerprintPart(input.authoritySubmissionId),
        normalizeFingerprintPart(input.authorityReceiptNumber),
      ].join("|"),
    )
    .digest("hex");
}

export function mapTaxReport(record: TaxReportRecord) {
  const extractedData = parseJsonValue(record.extractedDataJson, "malformed_extracted_data_json");
  const warnings = parseWarnings(record.warningsJson);
  if (extractedData.warning) {
    warnings.push(extractedData.warning);
  }

  return {
    taxReportId: record.id,
    slug: record.slug,
    companyCardId: record.companyCardId,
    documentId: record.documentId,
    countryCode: record.countryCode,
    jurisdiction: record.jurisdiction,
    taxKind: record.taxKind,
    formCode: record.formCode,
    formName: record.formName,
    formVersion: record.formVersion,
    fiscalYear: record.fiscalYear,
    periodGranularity: record.periodGranularity,
    periodLabel: record.periodLabel,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    taxpayerTaxId: record.taxpayerTaxId,
    authoritySubmissionId: record.authoritySubmissionId,
    authorityReceiptNumber: record.authorityReceiptNumber,
    filedAt: record.filedAt,
    dueDate: record.dueDate,
    paymentDueDate: record.paymentDueDate,
    status: record.status,
    result: record.result,
    paymentStatus: record.paymentStatus,
    currency: record.currency,
    taxableBase: record.taxableBase,
    taxDue: record.taxDue,
    taxDeductible: record.taxDeductible,
    resultAmount: record.resultAmount,
    retainedAmount: record.retainedAmount,
    profitOrLoss: record.profitOrLoss,
    confidence: record.confidence,
    fingerprint: record.fingerprint,
    extractedData: extractedData.value,
    warnings: Array.from(new Set(warnings)),
    correctionOfTaxReportId: record.correctionOfTaxReportId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  };
}

export function mapTaxReportFact(record: TaxReportFactRecord) {
  return {
    taxReportFactId: record.id,
    taxReportId: record.taxReportId,
    countryCode: record.countryCode,
    formCode: record.formCode,
    fieldCode: record.fieldCode,
    fieldSystem: record.fieldSystem,
    label: record.label,
    valueType: record.valueType,
    rawValue: record.rawValue,
    normalizedValue: record.normalizedValue,
    currency: record.currency,
    rate: record.rate,
    direction: record.direction,
    confidence: record.confidence,
    createdAt: record.createdAt,
  };
}

export function mapTaxCarryforward(record: TaxCarryforwardRecord) {
  return {
    taxCarryforwardId: record.id,
    slug: record.slug,
    companyCardId: record.companyCardId,
    countryCode: record.countryCode,
    jurisdiction: record.jurisdiction,
    taxKind: record.taxKind,
    kind: record.kind,
    originTaxReportId: record.originTaxReportId,
    originFiscalYear: record.originFiscalYear,
    originPeriodLabel: record.originPeriodLabel,
    currency: record.currency,
    originalAmount: record.originalAmount,
    usedAmount: record.usedAmount,
    remainingAmount: record.remainingAmount,
    expiresAt: record.expiresAt,
    status: record.status,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  };
}

export function mapTaxReportPaymentLink(record: TaxReportPaymentLinkRecord) {
  return {
    taxReportPaymentLinkId: record.id,
    slug: record.slug,
    taxReportId: record.taxReportId,
    bankTransactionId: record.bankTransactionId,
    documentId: record.documentId,
    amount: record.amount,
    currency: record.currency,
    paidAt: record.paidAt,
    paymentReference: record.paymentReference,
    status: record.status,
    confidence: record.confidence,
    reason: record.reason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  };
}
