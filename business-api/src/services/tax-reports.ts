import { createHash } from "node:crypto";

import { Decimal } from "decimal.js";
import { and, eq, isNull, lte, or } from "drizzle-orm";

import { getDatabase, getOrm } from "../db/connection.js";
import {
  bankTransactions,
  documents,
  taxCarryforwards,
  taxReportFacts,
  taxReportPaymentLinks,
  taxReports,
} from "../db/schema/index.js";
import {
  computeEmbeddingText,
  isBenignEmbeddingSyncError,
  upsertEmbedding,
} from "../lib/embeddings.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { applySimilarityFilter, compareDateDesc } from "../lib/list-filters.js";
import { logger } from "../lib/logger.js";
import { normalizeMoneyString } from "../lib/money.js";
import { createSlug } from "../lib/slug-ids.js";
import {
  getDocumentMeta,
  updateDocumentProcessing,
  uploadDocument,
} from "./documents.js";
import { getBankTransaction } from "./bank.js";
import {
  getBankTransactionRecordByIdOrSlug,
  getDocumentRecordByIdOrSlug,
  requireBankTransactionRecord,
  requireCompanyCardRecord,
  requireDocumentRecord,
} from "./shared.js";
import type {
  TaxCarryforwardCreateInput,
  SpainTaxPosition,
  TaxReportCreateRequest,
  TaxReportFactCreateInput,
  TaxReportFingerprintInput,
  TaxReportPaymentLinkCreateInput,
  TaxReportPaymentLinkPatch,
  TaxReportPaymentReceiptUpload,
  TaxReportPaymentStatus,
} from "@warehouse-hub/business-schemas";
import { spainTaxPositionSchema } from "@warehouse-hub/business-schemas";

type TaxReportRecord = typeof taxReports.$inferSelect;
type TaxReportFactRecord = typeof taxReportFacts.$inferSelect;
type TaxCarryforwardRecord = typeof taxCarryforwards.$inferSelect;
type TaxReportPaymentLinkRecord = typeof taxReportPaymentLinks.$inferSelect;
type BankTransactionRecord = typeof bankTransactions.$inferSelect;

type TaxReportListFilters = {
  countryCode?: string;
  taxKind?: string;
  formCode?: string;
  fiscalYear?: number;
  periodStart?: string;
  periodEnd?: string;
  status?: string;
  paymentStatus?: string;
  query?: string;
  similar?: string;
  limit?: number;
};

type TaxCarryforwardListFilters = {
  countryCode?: string;
  taxKind?: string;
  kind?: string;
  status?: string;
  originFiscalYear?: number;
  includeSuperseded?: boolean;
};

type TaxReportPaymentLinkListFilters = {
  taxReportId?: string;
  status?: string;
};

type SpainTaxPositionInput = {
  companyCardId: string;
  fiscalYear: number;
};

type TaxReportGetOptions = {
  includePaymentEvidence?: boolean;
};

const SPAIN_TAX_POSITION_ACTIVE_STATUSES = new Set([
  "draft_extracted",
  "filed",
  "amended",
  "needs_review",
]);

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeFingerprintPart(
  value: string | null | undefined,
  options: { uppercase?: boolean } = {},
): string {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  return options.uppercase === false ? normalized : normalized.toUpperCase();
}

function normalizeCountryCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeFormCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeTaxKind(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalMoney(
  value: string | null | undefined,
): string | null {
  return value === null || value === undefined
    ? null
    : normalizeMoneyString(value);
}

function parseJsonValue(
  value: string | null | undefined,
  warningCode: string,
): { value: unknown; warning?: string } {
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

  const warnings = parsed.value.filter(
    (warning): warning is string => typeof warning === "string",
  );
  if (warnings.length !== parsed.value.length) {
    warnings.push("non_string_warning_dropped");
  }

  return warnings;
}

function getTaxReportRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(taxReports)
    .where(
      and(
        isNull(taxReports.deletedAt),
        or(eq(taxReports.id, idOrSlug), eq(taxReports.slug, idOrSlug)),
      ),
    )
    .get();
}

function requireTaxReportRecord(idOrSlug: string) {
  const record = getTaxReportRecordByIdOrSlug(idOrSlug);
  if (!record) {
    throw new AppError(`Tax report not found: ${idOrSlug}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  return record;
}

function findTaxReportByFingerprint(
  companyCardId: string,
  fingerprint: string,
) {
  return getOrm()
    .select()
    .from(taxReports)
    .where(
      and(
        isNull(taxReports.deletedAt),
        eq(taxReports.companyCardId, companyCardId),
        eq(taxReports.fingerprint, fingerprint),
      ),
    )
    .get();
}

function queryMatchesTaxReport(
  report: ReturnType<typeof mapTaxReport>,
  facts: ReturnType<typeof mapTaxReportFact>[],
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    report.slug,
    report.countryCode,
    report.taxKind,
    report.formCode,
    report.formName,
    report.formVersion,
    report.periodLabel,
    report.periodStart,
    report.periodEnd,
    report.taxpayerTaxId,
    report.authoritySubmissionId,
    report.authorityReceiptNumber,
    report.status,
    report.result,
    report.paymentStatus,
    report.currency,
    report.taxableBase,
    report.taxDue,
    report.taxDeductible,
    report.resultAmount,
    report.retainedAmount,
    report.profitOrLoss,
    ...report.warnings,
    ...facts.flatMap((fact) => [
      fact.fieldCode,
      fact.fieldSystem,
      fact.label,
      fact.rawValue,
      fact.normalizedValue,
      fact.direction,
    ]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function getTaxReportFacts(taxReportId: string) {
  return getOrm()
    .select()
    .from(taxReportFacts)
    .where(eq(taxReportFacts.taxReportId, taxReportId))
    .all()
    .map(mapTaxReportFact);
}

function getTaxReportCarryforwards(taxReportId: string) {
  return getOrm()
    .select()
    .from(taxCarryforwards)
    .where(
      and(
        isNull(taxCarryforwards.deletedAt),
        eq(taxCarryforwards.originTaxReportId, taxReportId),
      ),
    )
    .all()
    .map(mapTaxCarryforward);
}

function isActiveSpainTaxPositionReport(record: TaxReportRecord): boolean {
  return SPAIN_TAX_POSITION_ACTIVE_STATUSES.has(record.status);
}

function getTaxReportPaymentLinks(taxReportId: string) {
  return getOrm()
    .select()
    .from(taxReportPaymentLinks)
    .where(
      and(
        isNull(taxReportPaymentLinks.deletedAt),
        eq(taxReportPaymentLinks.taxReportId, taxReportId),
      ),
    )
    .all()
    .map(mapTaxReportPaymentLink);
}

function scheduleEmbedding(taxReportId: string): void {
  void upsertEmbedding(
    "tax_report",
    taxReportId,
    computeEmbeddingText(
      "tax_report",
      buildTaxReportEmbeddingPayload(taxReportId),
    ),
  ).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    logger.warn("Failed to sync tax report embedding", { taxReportId, error });
  });
}

function normalizeFactInput(data: TaxReportFactCreateInput) {
  return {
    fieldCode: data.fieldCode.trim(),
    fieldSystem: data.fieldSystem,
    label: normalizeNullable(data.label),
    valueType: data.valueType,
    rawValue: data.rawValue.trim(),
    normalizedValue:
      data.normalizedValue === null || data.normalizedValue === undefined
        ? null
        : data.valueType === "money"
          ? normalizeMoneyString(data.normalizedValue)
          : data.normalizedValue.trim(),
    currency: data.currency ?? null,
    rate: normalizeNullable(data.rate),
    direction: data.direction ?? null,
    confidence: data.confidence,
  };
}

function normalizeCarryforwardInput(data: TaxCarryforwardCreateInput) {
  return {
    kind: data.kind,
    originFiscalYear: data.originFiscalYear,
    originPeriodLabel: normalizeNullable(data.originPeriodLabel),
    currency: data.currency,
    originalAmount: normalizeMoneyString(data.originalAmount),
    usedAmount: normalizeMoneyString(data.usedAmount),
    remainingAmount: normalizeMoneyString(data.remainingAmount),
    expiresAt: data.expiresAt ?? null,
    status: data.status,
    notes: normalizeNullable(data.notes),
  };
}

function toDecimalMoney(value: string): Decimal {
  return new Decimal(normalizeMoneyString(value));
}

function absMoney(value: string): Decimal {
  return toDecimalMoney(value).abs();
}

function formatDecimalMoney(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function positiveMoneyOrNull(value: Decimal): string | null {
  return value.gt(0) ? formatDecimalMoney(value) : null;
}

function moneyOrZero(value: string | null | undefined): string {
  return value ? normalizeMoneyString(value) : "0.00";
}

function sameMoney(left: string, right: string): boolean {
  return toDecimalMoney(left).eq(toDecimalMoney(right));
}

function normalizePaymentLinkInput(data: TaxReportPaymentLinkCreateInput) {
  return {
    bankTransactionId: normalizeNullable(data.bankTransactionId),
    documentId: normalizeNullable(data.documentId),
    amount: formatDecimalMoney(absMoney(data.amount)),
    currency: data.currency.trim().toUpperCase(),
    paidAt: normalizeNullable(data.paidAt),
    paymentReference: normalizeNullable(data.paymentReference),
    status: data.status,
    confidence: data.confidence,
    reason: normalizeNullable(data.reason),
  };
}

function requireTaxReportPaymentLinkRecord(idOrSlug: string) {
  const record = getOrm()
    .select()
    .from(taxReportPaymentLinks)
    .where(
      and(
        isNull(taxReportPaymentLinks.deletedAt),
        or(
          eq(taxReportPaymentLinks.id, idOrSlug),
          eq(taxReportPaymentLinks.slug, idOrSlug),
        ),
      ),
    )
    .get();
  if (!record) {
    throw new AppError(`Tax report payment link not found: ${idOrSlug}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  return record;
}

function getExistingPaymentLink(input: {
  taxReportId: string;
  bankTransactionId?: string | null;
  documentId?: string | null;
  paymentReference?: string | null;
}) {
  const baseConditions = [
    isNull(taxReportPaymentLinks.deletedAt),
    eq(taxReportPaymentLinks.taxReportId, input.taxReportId),
  ];

  if (input.bankTransactionId) {
    const match = getOrm()
      .select()
      .from(taxReportPaymentLinks)
      .where(
        and(
          ...baseConditions,
          eq(taxReportPaymentLinks.bankTransactionId, input.bankTransactionId),
        ),
      )
      .get();
    if (match) {
      return match;
    }
  }

  if (input.documentId) {
    const match = getOrm()
      .select()
      .from(taxReportPaymentLinks)
      .where(
        and(...baseConditions, eq(taxReportPaymentLinks.documentId, input.documentId)),
      )
      .get();
    if (match) {
      return match;
    }
  }

  if (input.paymentReference) {
    return getOrm()
      .select()
      .from(taxReportPaymentLinks)
      .where(
        and(
          ...baseConditions,
          eq(taxReportPaymentLinks.paymentReference, input.paymentReference),
        ),
      )
      .get();
  }

  return undefined;
}

function requirePaymentLinkEvidence(input: ReturnType<typeof normalizePaymentLinkInput>) {
  if (!input.bankTransactionId && !input.documentId && !input.paymentReference) {
    throw new AppError(
      "At least one of bankTransactionId, documentId, or paymentReference is required",
      { statusCode: 400, code: "validation_error" },
    );
  }
}

function validatePaymentLinkEvidence(
  report: TaxReportRecord,
  input: ReturnType<typeof normalizePaymentLinkInput>,
) {
  requirePaymentLinkEvidence(input);

  if (input.bankTransactionId) {
    const transaction = requireBankTransactionRecord(input.bankTransactionId);
    if (transaction.companyCardId !== report.companyCardId) {
      throw new AppError("Bank transaction does not belong to the tax report company card", {
        statusCode: 400,
        code: "company_card_mismatch",
      });
    }
    if (transaction.status === "void") {
      throw new AppError("Void bank transactions cannot be used as tax payment evidence", {
        statusCode: 400,
        code: "invalid_payment_evidence",
      });
    }
    if (transaction.currency !== input.currency) {
      throw new AppError("Bank transaction currency does not match the payment link", {
        statusCode: 400,
        code: "currency_mismatch",
      });
    }
    if (!sameMoney(formatDecimalMoney(absMoney(transaction.amount)), input.amount)) {
      throw new AppError("Bank transaction amount does not match the payment link", {
        statusCode: 400,
        code: "amount_mismatch",
      });
    }
  }

  if (input.documentId) {
    const document = requireDocumentRecord(input.documentId);
    if (document.companyCardId !== report.companyCardId) {
      throw new AppError("Document does not belong to the tax report company card", {
        statusCode: 400,
        code: "company_card_mismatch",
      });
    }
    if (
      document.kind !== "tax_payment_receipt" &&
      document.kind !== "tax_authority_notice"
    ) {
      throw new AppError(
        "Tax payment evidence documents must be tax_payment_receipt or tax_authority_notice",
        { statusCode: 400, code: "invalid_payment_evidence" },
      );
    }
  }
}

function confirmedPaymentLinks(taxReportId: string) {
  return getOrm()
    .select()
    .from(taxReportPaymentLinks)
    .where(
      and(
        isNull(taxReportPaymentLinks.deletedAt),
        eq(taxReportPaymentLinks.taxReportId, taxReportId),
        eq(taxReportPaymentLinks.status, "confirmed"),
      ),
    )
    .all();
}

function getActiveBankTransaction(id: string): BankTransactionRecord | undefined {
  return getBankTransactionRecordByIdOrSlug(id);
}

function paymentLinkHasActiveEvidence(link: TaxReportPaymentLinkRecord): boolean {
  if (
    link.bankTransactionId &&
    getActiveBankTransaction(link.bankTransactionId)
  ) {
    return true;
  }

  if (link.documentId && getDocumentRecordByIdOrSlug(link.documentId)) {
    return true;
  }

  return !link.bankTransactionId && !link.documentId && Boolean(link.paymentReference);
}

type PayablePaymentEvidence = {
  link: TaxReportPaymentLinkRecord;
  amount: Decimal;
  kind: "bank_transaction" | "document_or_reference";
};

function payablePaymentEvidence(
  report: TaxReportRecord,
): PayablePaymentEvidence[] {
  return confirmedPaymentLinks(report.id)
    .filter((link) => link.currency === report.currency)
    .filter(paymentLinkHasActiveEvidence)
    .map((link) => ({
      link,
      amount: toDecimalMoney(link.amount),
      kind:
        link.bankTransactionId && getActiveBankTransaction(link.bankTransactionId)
          ? "bank_transaction"
          : "document_or_reference",
    }));
}

function duplicatesBankEvidence(
  evidence: PayablePaymentEvidence,
  bankEvidence: PayablePaymentEvidence[],
): boolean {
  if (evidence.kind === "bank_transaction") {
    return false;
  }

  return bankEvidence.some((bank) => {
    if (!bank.amount.eq(evidence.amount)) {
      return false;
    }

    const sharedReference =
      Boolean(bank.link.paymentReference) &&
      bank.link.paymentReference === evidence.link.paymentReference;
    const sharedPaidAt =
      Boolean(bank.link.paidAt) &&
      bank.link.paidAt === evidence.link.paidAt;

    return sharedReference || sharedPaidAt;
  });
}

function payablePaidAmount(report: TaxReportRecord): Decimal {
  const evidence = payablePaymentEvidence(report);
  const bankEvidence = evidence.filter((item) => item.kind === "bank_transaction");

  return evidence
    .filter((item) => !duplicatesBankEvidence(item, bankEvidence))
    .reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
}

function linkPaymentEvidenceDocument(documentId: string, taxReportId: string): void {
  const document = requireDocumentRecord(documentId);
  const linkedToSameReport =
    document.linkedEntityType === "tax_report" &&
    document.linkedEntityId === taxReportId;
  const unlinked = !document.linkedEntityType && !document.linkedEntityId;

  if (!linkedToSameReport && !unlinked) {
    return;
  }

  if (linkedToSameReport) {
    return;
  }

  updateDocumentProcessing(document.id, {
    linkedEntityType: "tax_report",
    linkedEntityId: taxReportId,
  });
}

function computeTaxReportPaymentStatus(
  report: TaxReportRecord,
): TaxReportPaymentStatus {
  if (
    report.result === "zero" ||
    report.result === "no_activity" ||
    report.result === "informational" ||
    report.result === "compensate"
  ) {
    return "not_required";
  }

  if (report.result === "refund_requested") {
    if (!report.resultAmount) {
      return "refund_pending";
    }

    const refundAmount = absMoney(report.resultAmount);
    if (refundAmount.lte(0)) {
      return "not_required";
    }

    const refundedAmount = confirmedPaymentLinks(report.id)
      .filter((link) => link.currency === report.currency && link.bankTransactionId)
      .reduce((sum, link) => {
        const transaction = link.bankTransactionId
          ? getActiveBankTransaction(link.bankTransactionId)
          : undefined;
        if (!transaction) {
          return sum;
        }

        const amount = toDecimalMoney(transaction.amount);
        return amount.gt(0) ? sum.plus(amount) : sum;
      }, new Decimal(0));

    return refundedAmount.gte(refundAmount) ? "refunded" : "refund_pending";
  }

  if (report.result !== "payable") {
    return "unknown";
  }

  if (!report.resultAmount) {
    return "unknown";
  }

  const payableAmount = absMoney(report.resultAmount);
  if (payableAmount.lte(0)) {
    return "not_required";
  }

  const paidAmount = payablePaidAmount(report);

  if (paidAmount.lte(0)) {
    return "unpaid";
  }

  return paidAmount.lt(payableAmount) ? "partially_paid" : "paid";
}

function recomputeTaxReportPaymentStatus(taxReportId: string): void {
  const report = requireTaxReportRecord(taxReportId);
  const paymentStatus = computeTaxReportPaymentStatus(report);
  if (paymentStatus === report.paymentStatus) {
    return;
  }

  getOrm()
    .update(taxReports)
    .set({
      paymentStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(taxReports.id, report.id))
    .run();
  scheduleEmbedding(report.id);
}

function isWithinDays(left: string | null | undefined, right: string | null | undefined, days: number): boolean {
  if (!left || !right) {
    return false;
  }

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return false;
  }

  return Math.abs(leftTime - rightTime) <= days * 24 * 60 * 60 * 1000;
}

function normalizeLookupText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function paymentSuggestionSignals(report: TaxReportRecord, transaction: BankTransactionRecord) {
  const transactionText = normalizeLookupText(
    `${transaction.reference ?? ""} ${transaction.description} ${transaction.counterpartyName ?? ""}`,
  );
  const reportTokens = [
    report.authorityReceiptNumber,
    report.authoritySubmissionId,
    report.formCode,
    report.periodLabel,
    report.taxKind,
  ]
    .map(normalizeLookupText)
    .filter(Boolean);
  const referenceMatched = reportTokens.some((token) => transactionText.includes(token));
  const dateMatched = [
    report.paymentDueDate,
    report.dueDate,
    report.filedAt,
    report.periodEnd,
  ].some((date) => isWithinDays(transaction.transactionDate, date, 30));

  return { referenceMatched, dateMatched };
}

export function createTaxReportFingerprint(
  input: TaxReportFingerprintInput,
): string {
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
  const extractedData = parseJsonValue(
    record.extractedDataJson,
    "malformed_extracted_data_json",
  );
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

export function createTaxReport(data: TaxReportCreateRequest) {
  const company = requireCompanyCardRecord(data.companyCardId);
  const document = requireDocumentRecord(data.documentId);
  if (document.companyCardId !== company.id) {
    throw new AppError(
      "Document does not belong to the selected company card",
      {
        statusCode: 400,
        code: "company_card_mismatch",
      },
    );
  }

  const countryCode = normalizeCountryCode(data.countryCode);
  const taxKind = normalizeTaxKind(data.taxKind);
  const formCode = normalizeFormCode(data.formCode);
  const correctionOf = data.correctionOfTaxReportId
    ? requireTaxReportRecord(data.correctionOfTaxReportId)
    : null;
  if (correctionOf && correctionOf.companyCardId !== company.id) {
    throw new AppError(
      "Corrected tax report does not belong to the selected company card",
      {
        statusCode: 400,
        code: "company_card_mismatch",
      },
    );
  }

  const fingerprint = createTaxReportFingerprint({
    companyCardId: company.id,
    countryCode,
    taxKind: taxKind as TaxReportFingerprintInput["taxKind"],
    formCode,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    taxpayerTaxId: data.taxpayerTaxId ?? null,
    authoritySubmissionId: data.authoritySubmissionId ?? null,
    authorityReceiptNumber: data.authorityReceiptNumber ?? null,
  });
  const duplicate = findTaxReportByFingerprint(company.id, fingerprint);
  if (duplicate) {
    updateDocumentProcessing(document.id, {
      linkedEntityType: "tax_report",
      linkedEntityId: duplicate.id,
    });
    return { ...getTaxReport(duplicate.id), duplicate: true };
  }

  const id = createPrefixedId("tr_");
  const now = new Date().toISOString();
  const status =
    data.correctionOfTaxReportId && data.status === "filed"
      ? "amended"
      : data.status;
  const slug = createSlug(
    `${company.id}:${countryCode}:${taxKind}:${formCode}:${data.periodLabel}:${id}`,
  );

  getDatabase().transaction(() => {
    getOrm()
      .insert(taxReports)
      .values({
        id,
        slug,
        companyCardId: company.id,
        documentId: document.id,
        countryCode,
        jurisdiction: data.jurisdiction ?? null,
        taxKind,
        formCode,
        formName: data.formName ?? null,
        formVersion: data.formVersion ?? null,
        fiscalYear: data.fiscalYear,
        periodGranularity: data.periodGranularity,
        periodLabel: data.periodLabel,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        taxpayerTaxId: data.taxpayerTaxId ?? null,
        authoritySubmissionId: data.authoritySubmissionId ?? null,
        authorityReceiptNumber: data.authorityReceiptNumber ?? null,
        filedAt: data.filedAt ?? null,
        dueDate: data.dueDate ?? null,
        paymentDueDate: data.paymentDueDate ?? null,
        status,
        result: data.result,
        paymentStatus: data.paymentStatus,
        currency: data.currency,
        taxableBase: normalizeOptionalMoney(data.taxableBase),
        taxDue: normalizeOptionalMoney(data.taxDue),
        taxDeductible: normalizeOptionalMoney(data.taxDeductible),
        resultAmount: normalizeOptionalMoney(data.resultAmount),
        retainedAmount: normalizeOptionalMoney(data.retainedAmount),
        profitOrLoss: normalizeOptionalMoney(data.profitOrLoss),
        confidence: data.confidence,
        fingerprint,
        extractedDataJson:
          data.extractedData === undefined
            ? null
            : JSON.stringify(data.extractedData),
        warningsJson: JSON.stringify(data.warnings),
        correctionOfTaxReportId: correctionOf?.id ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();

    for (const fact of data.facts) {
      const normalized = normalizeFactInput(fact);
      getOrm()
        .insert(taxReportFacts)
        .values({
          id: createPrefixedId("trf_"),
          taxReportId: id,
          countryCode,
          formCode,
          fieldCode: normalized.fieldCode,
          fieldSystem: normalized.fieldSystem,
          label: normalized.label,
          valueType: normalized.valueType,
          rawValue: normalized.rawValue,
          normalizedValue: normalized.normalizedValue,
          currency: normalized.currency,
          rate: normalized.rate,
          direction: normalized.direction,
          confidence: normalized.confidence,
          createdAt: now,
        })
        .run();
    }

    if (correctionOf) {
      getOrm()
        .update(taxReports)
        .set({
          status: "superseded",
          updatedAt: now,
        })
        .where(eq(taxReports.id, correctionOf.id))
        .run();

      getOrm()
        .update(taxCarryforwards)
        .set({
          status: "superseded",
          updatedAt: now,
        })
        .where(
          and(
            isNull(taxCarryforwards.deletedAt),
            eq(taxCarryforwards.originTaxReportId, correctionOf.id),
            eq(taxCarryforwards.status, "active"),
          ),
        )
        .run();
    }

    for (const carryforward of data.carryforwards) {
      const normalized = normalizeCarryforwardInput(carryforward);
      const carryforwardId = createPrefixedId("tcf_");
      getOrm()
        .insert(taxCarryforwards)
        .values({
          id: carryforwardId,
          slug: createSlug(
            `${company.id}:${countryCode}:${taxKind}:${normalized.kind}:${data.periodLabel}:${carryforwardId}`,
          ),
          companyCardId: company.id,
          countryCode,
          jurisdiction: data.jurisdiction ?? null,
          taxKind,
          kind: normalized.kind,
          originTaxReportId: id,
          originFiscalYear: normalized.originFiscalYear ?? data.fiscalYear,
          originPeriodLabel: normalized.originPeriodLabel ?? data.periodLabel,
          currency: normalized.currency,
          originalAmount: normalized.originalAmount,
          usedAmount: normalized.usedAmount,
          remainingAmount: normalized.remainingAmount,
          expiresAt: normalized.expiresAt,
          status: normalized.status,
          notes: normalized.notes,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .run();
    }

    getOrm()
      .update(documents)
      .set({
        linkedEntityType: "tax_report",
        linkedEntityId: id,
      })
      .where(eq(documents.id, document.id))
      .run();
  })();

  const created = getTaxReport(id);
  scheduleEmbedding(id);
  if (correctionOf) {
    scheduleEmbedding(correctionOf.id);
  }

  return { ...created, duplicate: false };
}

export function createTaxReportPaymentLink(data: TaxReportPaymentLinkCreateInput) {
  const report = requireTaxReportRecord(data.taxReportId);
  const normalized = normalizePaymentLinkInput({
    ...data,
    taxReportId: report.id,
  });
  validatePaymentLinkEvidence(report, normalized);

  const existing = getExistingPaymentLink({
    taxReportId: report.id,
    bankTransactionId: normalized.bankTransactionId,
    documentId: normalized.documentId,
    paymentReference: normalized.paymentReference,
  });
  if (existing) {
    if (existing.status === "confirmed" && normalized.status !== "confirmed") {
      return mapTaxReportPaymentLink(existing);
    }

    return updateTaxReportPaymentLink(existing.id, {
      status: normalized.status,
      confidence: normalized.confidence,
      reason: normalized.reason,
    });
  }

  const id = createPrefixedId("trpl_");
  const now = new Date().toISOString();
  getOrm()
    .insert(taxReportPaymentLinks)
    .values({
      id,
      slug: createSlug(
        `${report.id}:${normalized.bankTransactionId ?? normalized.documentId ?? normalized.paymentReference}:${id}`,
      ),
      taxReportId: report.id,
      bankTransactionId: normalized.bankTransactionId,
      documentId: normalized.documentId,
      amount: normalized.amount,
      currency: normalized.currency,
      paidAt: normalized.paidAt,
      paymentReference: normalized.paymentReference,
      status: normalized.status,
      confidence: normalized.confidence,
      reason: normalized.reason,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  if (normalized.documentId) {
    linkPaymentEvidenceDocument(normalized.documentId, report.id);
  }

  if (normalized.status === "confirmed") {
    recomputeTaxReportPaymentStatus(report.id);
  }
  scheduleEmbedding(report.id);

  return mapTaxReportPaymentLink(requireTaxReportPaymentLinkRecord(id));
}

export function listTaxReportPaymentLinks(
  filters: TaxReportPaymentLinkListFilters = {},
) {
  const conditions = [isNull(taxReportPaymentLinks.deletedAt)];
  if (filters.taxReportId) {
    const report = requireTaxReportRecord(filters.taxReportId);
    conditions.push(eq(taxReportPaymentLinks.taxReportId, report.id));
  }
  if (filters.status) {
    conditions.push(eq(taxReportPaymentLinks.status, filters.status));
  }
  const activeTaxReportIds = new Set(
    getOrm()
      .select({ id: taxReports.id })
      .from(taxReports)
      .where(isNull(taxReports.deletedAt))
      .all()
      .map((record) => record.id),
  );

  return getOrm()
    .select()
    .from(taxReportPaymentLinks)
    .where(and(...conditions))
    .all()
    .filter((record) => activeTaxReportIds.has(record.taxReportId))
    .map(mapTaxReportPaymentLink)
    .sort((left, right) => {
      return (
        compareDateDesc(left.paidAt, right.paidAt) ||
        compareDateDesc(left.createdAt, right.createdAt) ||
        right.taxReportPaymentLinkId.localeCompare(left.taxReportPaymentLinkId)
      );
    });
}

export function updateTaxReportPaymentLink(
  idOrSlug: string,
  patch: TaxReportPaymentLinkPatch,
) {
  const existing = requireTaxReportPaymentLinkRecord(idOrSlug);
  getOrm()
    .update(taxReportPaymentLinks)
    .set({
      status: patch.status ?? existing.status,
      confidence: patch.confidence ?? existing.confidence,
      reason:
        patch.reason === undefined
          ? existing.reason
          : normalizeNullable(patch.reason),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(taxReportPaymentLinks.id, existing.id))
    .run();

  if (patch.status !== undefined && patch.status !== existing.status) {
    recomputeTaxReportPaymentStatus(existing.taxReportId);
  }
  scheduleEmbedding(existing.taxReportId);

  return mapTaxReportPaymentLink(requireTaxReportPaymentLinkRecord(existing.id));
}

export function suggestTaxReportPaymentLinks(idOrSlug: string) {
  const report = requireTaxReportRecord(idOrSlug);
  const resultAmount = report.resultAmount ? absMoney(report.resultAmount) : null;
  if (
    !resultAmount ||
    resultAmount.lte(0) ||
    (report.result !== "payable" && report.result !== "refund_requested")
  ) {
    return {
      taxReportId: report.id,
      autoConfirmed: false,
      matches: [],
    };
  }

  const wantsDebit = report.result === "payable";
  const candidates = getOrm()
    .select()
    .from(bankTransactions)
    .where(
      and(
        isNull(bankTransactions.deletedAt),
        eq(bankTransactions.companyCardId, report.companyCardId),
        eq(bankTransactions.currency, report.currency),
        eq(bankTransactions.status, "recorded"),
      ),
    )
    .all()
    .filter((transaction) => {
      const amount = toDecimalMoney(transaction.amount);
      return (
        amount.isNegative() === wantsDebit &&
        amount.abs().eq(resultAmount)
      );
    })
    .map((transaction) => {
      const { referenceMatched, dateMatched } = paymentSuggestionSignals(
        report,
        transaction,
      );
      return {
        transaction,
        referenceMatched,
        dateMatched,
      };
    })
    .filter((candidate) => candidate.referenceMatched || candidate.dateMatched);

  const matches = candidates.map(({ transaction, referenceMatched }) => {
    const existing = getExistingPaymentLink({
      taxReportId: report.id,
      bankTransactionId: transaction.id,
    });
    if (existing) {
      return mapTaxReportPaymentLink(existing);
    }

    return createTaxReportPaymentLink({
      taxReportId: report.id,
      bankTransactionId: transaction.id,
      amount: formatDecimalMoney(absMoney(transaction.amount)),
      currency: transaction.currency,
      paidAt: transaction.transactionDate,
      paymentReference: transaction.reference ?? undefined,
      status: "suggested",
      confidence: referenceMatched ? "high" : "medium",
      reason: referenceMatched
        ? "Amount and tax reference matched"
        : "Amount matched within the tax payment date window",
    });
  });

  return {
    taxReportId: report.id,
    autoConfirmed: false,
    matches,
  };
}

export function uploadTaxReportPaymentReceipt(
  idOrSlug: string,
  file: Express.Multer.File,
  input: TaxReportPaymentReceiptUpload,
) {
  const report = requireTaxReportRecord(idOrSlug);
  const document = uploadDocument(file, {
    kind: input.kind,
    companyCardId: report.companyCardId,
    source: input.source,
  });

  const paymentLink = createTaxReportPaymentLink({
    ...input.link,
    taxReportId: report.id,
    documentId: document.documentId,
  });

  return {
    document: getDocumentMeta(document.documentId),
    paymentLink,
    taxReport: getTaxReport(report.id).taxReport,
  };
}

export async function listTaxReports(filters: TaxReportListFilters = {}) {
  const conditions = [isNull(taxReports.deletedAt)];
  if (filters.countryCode) {
    conditions.push(
      eq(taxReports.countryCode, normalizeCountryCode(filters.countryCode)),
    );
  }
  if (filters.taxKind) {
    conditions.push(eq(taxReports.taxKind, normalizeTaxKind(filters.taxKind)));
  }
  if (filters.formCode) {
    conditions.push(
      eq(taxReports.formCode, normalizeFormCode(filters.formCode)),
    );
  }
  if (filters.fiscalYear !== undefined) {
    conditions.push(eq(taxReports.fiscalYear, filters.fiscalYear));
  }
  if (filters.periodStart) {
    conditions.push(eq(taxReports.periodStart, filters.periodStart));
  }
  if (filters.periodEnd) {
    conditions.push(eq(taxReports.periodEnd, filters.periodEnd));
  }
  if (filters.status) {
    conditions.push(eq(taxReports.status, filters.status));
  }
  if (filters.paymentStatus) {
    conditions.push(eq(taxReports.paymentStatus, filters.paymentStatus));
  }

  const records = getOrm()
    .select()
    .from(taxReports)
    .where(and(...conditions))
    .all();
  let items = records
    .map((record) => ({
      report: mapTaxReport(record),
      facts: filters.query ? getTaxReportFacts(record.id) : [],
    }))
    .filter(
      (item) =>
        !filters.query ||
        queryMatchesTaxReport(item.report, item.facts, filters.query),
    )
    .map((item) => item.report)
    .sort((left, right) => {
      return (
        compareDateDesc(left.periodEnd, right.periodEnd) ||
        compareDateDesc(left.filedAt, right.filedAt) ||
        compareDateDesc(left.createdAt, right.createdAt) ||
        right.taxReportId.localeCompare(left.taxReportId)
      );
    });

  if (filters.similar) {
    items = await applySimilarityFilter(items, {
      entityType: "tax_report",
      similar: filters.similar,
      limit: filters.limit,
      getEntityId: (report) => report.taxReportId,
    });
  } else if (filters.limit !== undefined) {
    items = items.slice(0, filters.limit);
  }

  return items;
}

function compareTaxReportRecordsDesc(
  left: TaxReportRecord,
  right: TaxReportRecord,
): number {
  return (
    compareDateDesc(left.periodEnd, right.periodEnd) ||
    compareDateDesc(left.filedAt, right.filedAt) ||
    compareDateDesc(left.createdAt, right.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

function latestReportForForm(
  records: TaxReportRecord[],
  formCode: string,
  taxKind: string,
): TaxReportRecord | undefined {
  return records
    .filter(
      (record) => record.formCode === formCode && record.taxKind === taxKind,
    )
    .sort(compareTaxReportRecordsDesc)[0];
}

function findMoneyFact(
  facts: ReturnType<typeof mapTaxReportFact>[],
  fieldCode: string,
): string | null {
  const fact = facts.find(
    (candidate) =>
      candidate.fieldSystem === "casilla" &&
      candidate.fieldCode === fieldCode &&
      candidate.valueType === "money",
  );
  return (
    normalizeOptionalMoney(
      normalizeNullable(fact?.normalizedValue) ?? normalizeNullable(fact?.rawValue),
    ) ?? null
  );
}

function carryforwardRemainingSum(
  carryforwards: ReturnType<typeof mapTaxCarryforward>[],
  kind: string,
): Decimal {
  return carryforwards
    .filter((carryforward) => carryforward.kind === kind)
    .filter((carryforward) =>
      ["active", "needs_review"].includes(carryforward.status),
    )
    .reduce(
      (sum, carryforward) => sum.plus(carryforward.remainingAmount),
      new Decimal(0),
    );
}

function latestReportCarryforwards(report: TaxReportRecord | undefined) {
  return report ? getTaxReportCarryforwards(report.id) : [];
}

function getSpainPositionCarryforwards(filters: {
  companyCardId: string;
  taxKind: string;
  kind: string;
  originFiscalYear?: number;
  originFiscalYearThrough?: number;
}) {
  const conditions = [
    isNull(taxCarryforwards.deletedAt),
    eq(taxCarryforwards.companyCardId, filters.companyCardId),
    eq(taxCarryforwards.countryCode, "ES"),
    eq(taxCarryforwards.taxKind, filters.taxKind),
    eq(taxCarryforwards.kind, filters.kind),
    or(
      eq(taxCarryforwards.status, "active"),
      eq(taxCarryforwards.status, "needs_review"),
    ),
  ];

  if (filters.originFiscalYear !== undefined) {
    conditions.push(
      eq(taxCarryforwards.originFiscalYear, filters.originFiscalYear),
    );
  }
  if (filters.originFiscalYearThrough !== undefined) {
    conditions.push(
      lte(
        taxCarryforwards.originFiscalYear,
        filters.originFiscalYearThrough,
      ),
    );
  }

  return getOrm()
    .select()
    .from(taxCarryforwards)
    .where(and(...conditions))
    .all()
    .map(mapTaxCarryforward);
}

function buildSpainVatPosition(report: TaxReportRecord | undefined) {
  if (!report) {
    return undefined;
  }

  const mapped = mapTaxReport(report);
  const carryforwards = latestReportCarryforwards(report);
  const remainingVatCredit = positiveMoneyOrNull(
    carryforwardRemainingSum(carryforwards, "vat_credit"),
  );
  const refundAmount =
    mapped.result === "refund_requested" && mapped.resultAmount
      ? absMoney(mapped.resultAmount)
      : null;
  const refundRequested =
    refundAmount && refundAmount.gt(0)
      ? formatDecimalMoney(refundAmount)
      : null;

  return {
    latestPeriodLabel: mapped.periodLabel,
    latestTaxReportId: mapped.taxReportId,
    result: mapped.result,
    resultAmount: moneyOrZero(mapped.resultAmount),
    remainingVatCredit,
    refundRequested,
    paymentStatus: mapped.paymentStatus,
  };
}

function buildSpainAutonomoIrpfPosition(
  report: TaxReportRecord | undefined,
  context: { companyCardId: string; fiscalYear: number },
) {
  if (!report) {
    return undefined;
  }

  const mapped = mapTaxReport(report);
  const facts = getTaxReportFacts(report.id);
  const carryforwards = getSpainPositionCarryforwards({
    companyCardId: context.companyCardId,
    taxKind: "personal_income",
    kind: "installment_credit",
    originFiscalYear: context.fiscalYear,
  });
  const negativeToDeductSameYear = positiveMoneyOrNull(
    carryforwardRemainingSum(carryforwards, "installment_credit"),
  );

  return {
    latestPeriodLabel: mapped.periodLabel,
    latestTaxReportId: mapped.taxReportId,
    ytdIncome: moneyOrZero(findMoneyFact(facts, "01")),
    ytdExpenses: moneyOrZero(findMoneyFact(facts, "02")),
    ytdNetProfitOrLoss: moneyOrZero(
      findMoneyFact(facts, "03") ?? mapped.profitOrLoss,
    ),
    retentions: moneyOrZero(findMoneyFact(facts, "06") ?? mapped.retainedAmount),
    installmentResult: moneyOrZero(
      findMoneyFact(facts, "19") ?? mapped.resultAmount,
    ),
    negativeToDeductSameYear,
  };
}

function buildSpainCorporateIncomePosition(
  report: TaxReportRecord | undefined,
  context: { companyCardId: string; fiscalYear: number },
) {
  if (!report) {
    return undefined;
  }

  const mapped = mapTaxReport(report);
  const facts = getTaxReportFacts(report.id);
  const accountingResult = findMoneyFact(facts, "00500");
  const preCompensationTaxableBase = findMoneyFact(facts, "00550");
  const taxableBase = findMoneyFact(facts, "00552") ?? mapped.taxableBase;
  const carryforwards = getSpainPositionCarryforwards({
    companyCardId: context.companyCardId,
    taxKind: "corporate_income",
    kind: "tax_loss",
    originFiscalYearThrough: context.fiscalYear,
  });
  const remainingCompensableNegativeBase = positiveMoneyOrNull(
    carryforwardRemainingSum(carryforwards, "tax_loss"),
  );

  return {
    latestFiscalYear: mapped.fiscalYear,
    latestTaxReportId: mapped.taxReportId,
    accountingResult,
    preCompensationTaxableBase,
    priorNegativeBaseApplied: findMoneyFact(facts, "00547"),
    taxableBase,
    currentYearProfitOrLoss:
      accountingResult ?? preCompensationTaxableBase ?? mapped.profitOrLoss,
    remainingCompensableNegativeBase,
  };
}

function confidenceForSpainTaxPosition(
  yearRecords: TaxReportRecord[],
  selectedReports: TaxReportRecord[],
  warnings: string[],
): SpainTaxPosition["confidence"] {
  if (yearRecords.length === 0) {
    return "low";
  }

  if (
    warnings.length > 0 ||
    selectedReports.some((report) =>
      ["draft_extracted", "needs_review"].includes(report.status),
    ) ||
    selectedReports.some((report) => report.confidence !== "high")
  ) {
    return "medium";
  }

  return "high";
}

export function getSpainTaxPosition(
  input: SpainTaxPositionInput,
): SpainTaxPosition {
  if (!Number.isInteger(input.fiscalYear) || input.fiscalYear <= 0) {
    throw new AppError("fiscalYear must be a positive integer", {
      statusCode: 400,
      code: "validation_error",
    });
  }

  const company = requireCompanyCardRecord(input.companyCardId);
  const records = getOrm()
    .select()
    .from(taxReports)
    .where(
      and(
        isNull(taxReports.deletedAt),
        eq(taxReports.companyCardId, company.id),
        eq(taxReports.countryCode, "ES"),
      ),
    )
    .all()
    .filter(isActiveSpainTaxPositionReport);
  const yearRecords = records.filter(
    (record) => record.fiscalYear === input.fiscalYear,
  );
  const latest303 = latestReportForForm(yearRecords, "303", "vat");
  const latest130 = latestReportForForm(
    yearRecords,
    "130",
    "personal_income",
  );
  const latest200 = latestReportForForm(
    yearRecords,
    "200",
    "corporate_income",
  );
  const warnings: string[] = [];

  if (!latest303) {
    warnings.push("missing_model_303_for_vat_position");
  }
  if (
    records.some(
      (record) =>
        record.formCode === "130" && record.taxKind === "personal_income",
    ) &&
    !latest130
  ) {
    warnings.push("missing_model_130_for_autonomo_profile");
  }
  if (
    records.some(
      (record) =>
        record.formCode === "200" && record.taxKind === "corporate_income",
    ) &&
    !latest200
  ) {
    warnings.push("missing_model_200_for_corporate_profile");
  }
  if (latest130 && latest200) {
    warnings.push("mixed_spanish_income_tax_profiles");
  }

  const selectedReports = [latest303, latest130, latest200].filter(
    (report): report is TaxReportRecord => Boolean(report),
  );
  const position = {
    companyCardId: company.id,
    countryCode: "ES" as const,
    fiscalYear: input.fiscalYear,
    vat: buildSpainVatPosition(latest303),
    autonomoIrpf: buildSpainAutonomoIrpfPosition(latest130, {
      companyCardId: company.id,
      fiscalYear: input.fiscalYear,
    }),
    corporateIncome: buildSpainCorporateIncomePosition(latest200, {
      companyCardId: company.id,
      fiscalYear: input.fiscalYear,
    }),
    warnings: Array.from(new Set(warnings)),
    confidence: confidenceForSpainTaxPosition(
      yearRecords,
      selectedReports,
      warnings,
    ),
  };

  return spainTaxPositionSchema.parse(position);
}

function getTaxReportPaymentEvidence(taxReportId: string) {
  const links = getTaxReportPaymentLinks(taxReportId);
  const bankTransactionIds = Array.from(
    new Set(
      links
        .map((link) => link.bankTransactionId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const documentIds = Array.from(
    new Set(
      links
        .map((link) => link.documentId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const bankTransactionsEvidence = bankTransactionIds.flatMap((id) => {
    try {
      return [getBankTransaction(id)];
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  });
  const documentEvidence = documentIds.flatMap((id) => {
    try {
      return [getDocumentMeta(id)];
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  });

  return {
    bankTransactions: bankTransactionsEvidence,
    documents: documentEvidence,
  };
}

export function getTaxReport(
  idOrSlug: string,
  options: TaxReportGetOptions = {},
) {
  const reportRecord = requireTaxReportRecord(idOrSlug);
  const detail = {
    taxReport: mapTaxReport(reportRecord),
    document: getDocumentMeta(reportRecord.documentId),
    facts: getTaxReportFacts(reportRecord.id),
    carryforwards: getTaxReportCarryforwards(reportRecord.id),
    paymentLinks: getTaxReportPaymentLinks(reportRecord.id),
  };

  return options.includePaymentEvidence
    ? {
        ...detail,
        paymentEvidence: getTaxReportPaymentEvidence(reportRecord.id),
      }
    : detail;
}

export function buildTaxReportEmbeddingPayload(idOrSlug: string) {
  return getTaxReport(idOrSlug);
}

export function listTaxCarryforwards(filters: TaxCarryforwardListFilters = {}) {
  const conditions = [isNull(taxCarryforwards.deletedAt)];
  if (filters.countryCode) {
    conditions.push(
      eq(
        taxCarryforwards.countryCode,
        normalizeCountryCode(filters.countryCode),
      ),
    );
  }
  if (filters.taxKind) {
    conditions.push(
      eq(taxCarryforwards.taxKind, normalizeTaxKind(filters.taxKind)),
    );
  }
  if (filters.kind) {
    conditions.push(eq(taxCarryforwards.kind, filters.kind));
  }
  if (filters.originFiscalYear !== undefined) {
    conditions.push(
      eq(taxCarryforwards.originFiscalYear, filters.originFiscalYear),
    );
  }
  if (filters.status) {
    conditions.push(eq(taxCarryforwards.status, filters.status));
  } else if (!filters.includeSuperseded) {
    conditions.push(eq(taxCarryforwards.status, "active"));
  }
  const activeTaxReportIds = new Set(
    getOrm()
      .select({ id: taxReports.id })
      .from(taxReports)
      .where(isNull(taxReports.deletedAt))
      .all()
      .map((record) => record.id),
  );

  return getOrm()
    .select()
    .from(taxCarryforwards)
    .where(and(...conditions))
    .all()
    .filter((record) => activeTaxReportIds.has(record.originTaxReportId))
    .map(mapTaxCarryforward)
    .sort((left, right) => {
      return (
        right.originFiscalYear - left.originFiscalYear ||
        compareDateDesc(left.createdAt, right.createdAt) ||
        right.taxCarryforwardId.localeCompare(left.taxCarryforwardId)
      );
    });
}

export function softDeleteTaxReport(idOrSlug: string) {
  const existing = requireTaxReportRecord(idOrSlug);
  const now = new Date().toISOString();

  getDatabase().transaction(() => {
    getOrm()
      .update(taxReports)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(taxReports.id, existing.id))
      .run();

    getOrm()
      .update(taxCarryforwards)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          isNull(taxCarryforwards.deletedAt),
          eq(taxCarryforwards.originTaxReportId, existing.id),
        ),
      )
      .run();

    getOrm()
      .update(taxReportPaymentLinks)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          isNull(taxReportPaymentLinks.deletedAt),
          eq(taxReportPaymentLinks.taxReportId, existing.id),
        ),
      )
      .run();
  })();
}
