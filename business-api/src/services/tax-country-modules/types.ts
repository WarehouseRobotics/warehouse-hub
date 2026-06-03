import type {
  TaxCarryforwardCreateInput,
  TaxConfidence,
  TaxReportCreateRequest,
  TaxReportFactCreateInput,
  TaxReportIngestInput,
} from "@warehouse-hub/business-schemas";
import type { StructuredTaxReport } from "../../schemas/structured-tax-report.js";

export type NormalizedTaxReportDraft = Omit<
  TaxReportCreateRequest,
  "companyCardId" | "documentId"
>;

export type TaxCountryDetectionInput = {
  kind: TaxReportIngestInput["kind"];
  countryCode?: string;
  formCode?: string;
  ocrText: string;
  structuredData?: StructuredTaxReport;
};

export type TaxCountryDetectionResult = {
  matched: boolean;
  countryCode?: string;
  confidence: TaxConfidence;
  reason?: string;
};

export type TaxCountryParseInput = {
  ocrText: string;
  structuredData?: StructuredTaxReport;
  metadata: TaxReportIngestInput;
  companyTaxId?: string | null;
};

export type TaxCountryParseResult = {
  countryCode: string;
  formCode: string;
  formName?: string | null;
  formVersion?: string | null;
  fiscalYear?: number;
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  periodGranularity?: NormalizedTaxReportDraft["periodGranularity"];
  taxpayerTaxId?: string | null;
  authoritySubmissionId?: string | null;
  authorityReceiptNumber?: string | null;
  filedAt?: string | null;
  dueDate?: string | null;
  paymentDueDate?: string | null;
  result?: NormalizedTaxReportDraft["result"];
  paymentStatus?: NormalizedTaxReportDraft["paymentStatus"];
  currency?: string;
  taxableBase?: string | null;
  taxDue?: string | null;
  taxDeductible?: string | null;
  resultAmount?: string | null;
  retainedAmount?: string | null;
  profitOrLoss?: string | null;
  facts: TaxReportFactCreateInput[];
  warnings: string[];
  confidence: TaxConfidence;
  extractedData: unknown;
};

export type TaxCountryModule = {
  countryCode: string;
  detect(input: TaxCountryDetectionInput): TaxCountryDetectionResult;
  parse(input: TaxCountryParseInput): TaxCountryParseResult;
  normalize(input: TaxCountryParseResult): NormalizedTaxReportDraft;
  buildCarryforwards(
    input: NormalizedTaxReportDraft,
  ): TaxCarryforwardCreateInput[];
};
