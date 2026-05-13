import { AppError } from "../lib/errors.js";
import { createStoredDocument, getDocumentMeta, updateDocumentProcessing } from "./documents.js";
import { extractDocumentText } from "./document-ocr.js";
import { requireCompanyCardRecord } from "./shared.js";
import { createTaxReport, getTaxReport } from "./tax-reports.js";
import { selectTaxCountryModule } from "./tax-country-modules/index.js";
import type {
  NormalizedTaxReportDraft,
  TaxCountryParseResult,
} from "./tax-country-modules/index.js";
import type {
  TaxReportCreateRequest,
  TaxReportIngestInput,
  TaxReportIngestOverrides,
} from "@warehouse-hub/business-schemas";

type TaxReportIngestResponse = ReturnType<typeof createTaxReport> & {
  document: ReturnType<typeof getDocumentMeta>;
  ocr: {
    status: string;
    engine: string | null;
    text: string | null;
    completedAt: string | null;
  };
  warnings: string[];
};

function definedOverrideKeys(
  overrides: TaxReportIngestOverrides | undefined,
): string[] {
  if (!overrides) {
    return [];
  }

  return Object.entries(overrides)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

function mergeParseOverrides(
  parsed: TaxCountryParseResult,
  input: TaxReportIngestInput,
): TaxCountryParseResult {
  const overrides = input.overrides;
  return {
    ...parsed,
    countryCode: overrides?.countryCode ?? input.countryCode ?? parsed.countryCode,
    formCode: overrides?.formCode ?? input.formCode ?? parsed.formCode,
    formName: overrides?.formName ?? parsed.formName,
    formVersion: overrides?.formVersion ?? parsed.formVersion,
    fiscalYear: overrides?.fiscalYear ?? input.fiscalYear ?? parsed.fiscalYear,
    periodGranularity: overrides?.periodGranularity ?? parsed.periodGranularity,
    periodLabel: overrides?.periodLabel ?? input.periodLabel ?? parsed.periodLabel,
    periodStart: overrides?.periodStart ?? parsed.periodStart,
    periodEnd: overrides?.periodEnd ?? parsed.periodEnd,
    taxpayerTaxId: overrides?.taxpayerTaxId ?? parsed.taxpayerTaxId,
    authoritySubmissionId:
      overrides?.authoritySubmissionId ?? parsed.authoritySubmissionId,
    authorityReceiptNumber:
      overrides?.authorityReceiptNumber ?? parsed.authorityReceiptNumber,
    filedAt: overrides?.filedAt ?? parsed.filedAt,
    dueDate: overrides?.dueDate ?? parsed.dueDate,
    paymentDueDate: overrides?.paymentDueDate ?? parsed.paymentDueDate,
    result: overrides?.result ?? parsed.result,
    paymentStatus: overrides?.paymentStatus ?? parsed.paymentStatus,
    currency: overrides?.currency ?? parsed.currency,
    taxableBase: overrides?.taxableBase ?? parsed.taxableBase,
    taxDue: overrides?.taxDue ?? parsed.taxDue,
    taxDeductible: overrides?.taxDeductible ?? parsed.taxDeductible,
    resultAmount: overrides?.resultAmount ?? parsed.resultAmount,
    retainedAmount: overrides?.retainedAmount ?? parsed.retainedAmount,
    profitOrLoss: overrides?.profitOrLoss ?? parsed.profitOrLoss,
    confidence: overrides?.confidence ?? parsed.confidence,
  };
}

function applyReportOverrides(
  draft: NormalizedTaxReportDraft,
  input: TaxReportIngestInput,
): NormalizedTaxReportDraft {
  const overrides = input.overrides;
  return {
    ...draft,
    countryCode: overrides?.countryCode ?? input.countryCode ?? draft.countryCode,
    jurisdiction: overrides?.jurisdiction ?? draft.jurisdiction,
    taxKind: overrides?.taxKind ?? input.taxKind ?? draft.taxKind,
    formCode: overrides?.formCode ?? input.formCode ?? draft.formCode,
    formName: overrides?.formName ?? draft.formName,
    formVersion: overrides?.formVersion ?? draft.formVersion,
    fiscalYear: overrides?.fiscalYear ?? input.fiscalYear ?? draft.fiscalYear,
    periodGranularity: overrides?.periodGranularity ?? draft.periodGranularity,
    periodLabel: overrides?.periodLabel ?? input.periodLabel ?? draft.periodLabel,
    periodStart: overrides?.periodStart ?? draft.periodStart,
    periodEnd: overrides?.periodEnd ?? draft.periodEnd,
    taxpayerTaxId: overrides?.taxpayerTaxId ?? draft.taxpayerTaxId,
    authoritySubmissionId:
      overrides?.authoritySubmissionId ?? draft.authoritySubmissionId,
    authorityReceiptNumber:
      overrides?.authorityReceiptNumber ?? draft.authorityReceiptNumber,
    filedAt: overrides?.filedAt ?? draft.filedAt,
    dueDate: overrides?.dueDate ?? draft.dueDate,
    paymentDueDate: overrides?.paymentDueDate ?? draft.paymentDueDate,
    status: overrides?.status ?? draft.status,
    result: overrides?.result ?? draft.result,
    paymentStatus: overrides?.paymentStatus ?? draft.paymentStatus,
    currency: overrides?.currency ?? draft.currency,
    taxableBase: overrides?.taxableBase ?? draft.taxableBase,
    taxDue: overrides?.taxDue ?? draft.taxDue,
    taxDeductible: overrides?.taxDeductible ?? draft.taxDeductible,
    resultAmount: overrides?.resultAmount ?? draft.resultAmount,
    retainedAmount: overrides?.retainedAmount ?? draft.retainedAmount,
    profitOrLoss: overrides?.profitOrLoss ?? draft.profitOrLoss,
    confidence: overrides?.confidence ?? draft.confidence,
    correctionOfTaxReportId:
      overrides?.correctionOfTaxReportId ?? draft.correctionOfTaxReportId,
  };
}

function mergeExtractedData(
  extractedData: unknown,
  metadata: { normalizedBy: string; appliedOverrides: string[] },
) {
  if (
    extractedData &&
    typeof extractedData === "object" &&
    !Array.isArray(extractedData)
  ) {
    return {
      ...extractedData,
      ...metadata,
    };
  }

  return {
    value: extractedData,
    ...metadata,
  };
}

function validateCorrectionTarget(
  companyCardId: string,
  draft: NormalizedTaxReportDraft,
): void {
  const correctionOfTaxReportId = draft.correctionOfTaxReportId;
  if (!correctionOfTaxReportId) {
    return;
  }

  const correctionOf = getTaxReport(correctionOfTaxReportId).taxReport;
  if (correctionOf.companyCardId !== companyCardId) {
    throw new AppError(
      "Corrected tax report does not belong to the selected company card",
      {
        statusCode: 400,
        code: "company_card_mismatch",
      },
    );
  }

  const mismatches = [
    correctionOf.countryCode.toUpperCase() !== draft.countryCode.toUpperCase()
      ? "countryCode"
      : null,
    correctionOf.taxKind.toLowerCase() !== draft.taxKind.toLowerCase()
      ? "taxKind"
      : null,
    correctionOf.formCode.toUpperCase() !== draft.formCode.toUpperCase()
      ? "formCode"
      : null,
    correctionOf.periodStart !== draft.periodStart ? "periodStart" : null,
    correctionOf.periodEnd !== draft.periodEnd ? "periodEnd" : null,
  ].filter((value): value is string => Boolean(value));

  if (mismatches.length > 0) {
    throw new AppError(
      "Corrected tax report does not match the ingested declaration scope",
      {
        statusCode: 422,
        code: "invalid_tax_report_correction",
        details: { correctionOfTaxReportId, mismatches },
      },
    );
  }
}

function wrapIngestError(error: AppError, documentId: string): AppError {
  return new AppError(error.message, {
    statusCode: error.statusCode,
    code: error.code,
    details: {
      ...((error.details &&
      typeof error.details === "object" &&
      !Array.isArray(error.details)
        ? error.details
        : {}) as Record<string, unknown>),
      documentId,
    },
  });
}

export async function ingestTaxReport(
  file: Express.Multer.File,
  input: TaxReportIngestInput,
): Promise<TaxReportIngestResponse> {
  const company = requireCompanyCardRecord(input.companyCardId);
  const document = createStoredDocument(file, {
    kind: input.kind,
    companyCardId: company.id,
    source: input.source,
  });
  const appliedOverrides = definedOverrideKeys(input.overrides);

  updateDocumentProcessing(document.documentId, {
    ocrStatus: "processing",
    ocrError: null,
    ocrEngine: null,
    extractedData: null,
  });

  try {
    const ocrResult = await extractDocumentText(file);
    const module = selectTaxCountryModule({
      kind: input.kind,
      countryCode: input.overrides?.countryCode ?? input.countryCode,
      formCode: input.overrides?.formCode ?? input.formCode,
      ocrText: ocrResult.text,
    });
    const parsed = mergeParseOverrides(
      module.parse({
        ocrText: ocrResult.text,
        metadata: input,
        companyTaxId: company.taxId,
      }),
      input,
    );
    const normalizedWithoutCarryforwards = applyReportOverrides(
      module.normalize(parsed),
      input,
    );
    const carryforwards = module.buildCarryforwards(
      normalizedWithoutCarryforwards,
    );
    validateCorrectionTarget(company.id, normalizedWithoutCarryforwards);
    const normalized: NormalizedTaxReportDraft = {
      ...normalizedWithoutCarryforwards,
      carryforwards,
      warnings: Array.from(
        new Set([
          ...normalizedWithoutCarryforwards.warnings,
          ...appliedOverrides.map((field) => `override_applied:${field}`),
        ]),
      ),
      extractedData: mergeExtractedData(normalizedWithoutCarryforwards.extractedData, {
        normalizedBy: module.countryCode,
        appliedOverrides,
      }),
    };
    const completedAt = new Date().toISOString();

    updateDocumentProcessing(document.documentId, {
      ocrStatus: "completed",
      ocrText: ocrResult.text,
      ocrError: null,
      ocrEngine: ocrResult.engine,
      ocrCompletedAt: completedAt,
      extractedData: normalized.extractedData,
    });

    const createInput: TaxReportCreateRequest = {
      companyCardId: company.id,
      documentId: document.documentId,
      ...normalized,
    };
    const created = createTaxReport(createInput);
    const responseWarnings = created.duplicate
      ? Array.from(new Set([...normalized.warnings, "duplicate_tax_report_fingerprint"]))
      : normalized.warnings;
    const updatedDocument = getDocumentMeta(document.documentId);

    return {
      ...created,
      document: updatedDocument,
      ocr: {
        status: updatedDocument.ocrStatus,
        engine: updatedDocument.ocrEngine,
        text: updatedDocument.ocrText,
        completedAt: updatedDocument.ocrCompletedAt,
      },
      warnings: responseWarnings,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tax report ingestion failed";
    const failedDocument = updateDocumentProcessing(document.documentId, {
      ocrStatus: "failed",
      ocrError: message,
    });

    if (error instanceof AppError) {
      throw wrapIngestError(error, failedDocument.documentId);
    }

    throw error;
  }
}
