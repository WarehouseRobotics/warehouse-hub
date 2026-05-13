import { createHash } from "node:crypto";

import { and, eq, isNull, or } from "drizzle-orm";

import { getDatabase, getOrm } from "../db/connection.js";
import {
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
import { getDocumentMeta, updateDocumentProcessing } from "./documents.js";
import { requireCompanyCardRecord, requireDocumentRecord } from "./shared.js";
import type {
  TaxCarryforwardCreateInput,
  TaxReportCreateRequest,
  TaxReportFactCreateInput,
  TaxReportFingerprintInput,
} from "@warehouse-hub/business-schemas";

type TaxReportRecord = typeof taxReports.$inferSelect;
type TaxReportFactRecord = typeof taxReportFacts.$inferSelect;
type TaxCarryforwardRecord = typeof taxCarryforwards.$inferSelect;
type TaxReportPaymentLinkRecord = typeof taxReportPaymentLinks.$inferSelect;

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
    currency: data.currency,
    originalAmount: normalizeMoneyString(data.originalAmount),
    usedAmount: normalizeMoneyString(data.usedAmount),
    remainingAmount: normalizeMoneyString(data.remainingAmount),
    expiresAt: data.expiresAt ?? null,
    status: data.status,
    notes: normalizeNullable(data.notes),
  };
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
          originFiscalYear: data.fiscalYear,
          originPeriodLabel: data.periodLabel,
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

export function getTaxReport(idOrSlug: string) {
  const reportRecord = requireTaxReportRecord(idOrSlug);
  return {
    taxReport: mapTaxReport(reportRecord),
    document: getDocumentMeta(reportRecord.documentId),
    facts: getTaxReportFacts(reportRecord.id),
    carryforwards: getTaxReportCarryforwards(reportRecord.id),
    paymentLinks: getTaxReportPaymentLinks(reportRecord.id),
  };
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

  return getOrm()
    .select()
    .from(taxCarryforwards)
    .where(and(...conditions))
    .all()
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
  getOrm()
    .update(taxReports)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(taxReports.id, existing.id))
    .run();
}
