import { Decimal } from "decimal.js";

import { AppError } from "../../lib/errors.js";
import { normalizeMoneyString } from "../../lib/money.js";
import type {
  NormalizedTaxReportDraft,
  TaxCountryDetectionInput,
  TaxCountryModule,
  TaxCountryParseInput,
  TaxCountryParseResult,
} from "./types.js";
import type {
  TaxCarryforwardCreateInput,
  TaxReportFactCreateInput,
} from "@warehouse-hub/business-schemas";

const MODELO_303_FORM_NAME = "Modelo 303";
const MONEY_PATTERN =
  "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}|-?\\d+,\\d{2}|-?\\d+\\.\\d{2}";
const MODELO_303_LAYOUT_FIELD_CODES = [
  "07",
  "09",
  "27",
  "28",
  "45",
  "64",
  "66",
  "69",
  "71",
  "72",
  "73",
  "78",
  "87",
  "110",
];
const FIELD_LABELS: Record<string, string> = {
  "07": "Base imponible IVA general",
  "09": "Cuota devengada IVA general",
  "27": "Total cuota devengada",
  "28": "Base IVA deducible operaciones interiores corrientes",
  "45": "Total IVA deducible",
  "64": "Suma de resultados",
  "66": "Atribuible a la Administracion del Estado",
  "69": "Resultado de la autoliquidacion",
  "71": "Resultado de la liquidacion",
  "72": "Importe a compensar",
  "73": "Importe a devolver",
  "78": "Cuotas pendientes de compensacion aplicadas",
  "87": "Cuotas a compensar pendientes",
  "110": "Cuotas a compensar de periodos anteriores",
};

function normalizeCountryCode(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase();
}

function normalizeFormCode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase().replace(/^MODELO[_\s-]*/, "");
  return normalized || undefined;
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return undefined;
}

function optionalMoney(value: string | undefined): string | undefined {
  return value ? normalizeMoneyString(value) : undefined;
}

function isPositive(value: string | null | undefined): boolean {
  return value ? new Decimal(value).gt(0) : false;
}

function isNegative(value: string | null | undefined): boolean {
  return value ? new Decimal(value).lt(0) : false;
}

function absoluteMoney(value: string): string {
  return new Decimal(value).abs().toFixed(2);
}

function parseDateValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

function parseFiscalYear(text: string): number | undefined {
  const year = firstMatch(text, [
    /(?:fiscal\s+year|tax\s+year|ejercicio|ano|año)\s*[:=\-]\s*(20\d{2})/im,
    /(?:fiscal\s+year|tax\s+year|ejercicio|ano|año)\s+(20\d{2})/im,
    /\b(20\d{2})\s*[-/]\s*(?:q[1-4]|[1-4]t)\b/im,
  ]);
  return year ? Number.parseInt(year, 10) : undefined;
}

function quarterBoundaries(year: number, quarter: number) {
  const starts = ["01-01", "04-01", "07-01", "10-01"];
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return {
    label: `${year}-Q${quarter}`,
    start: `${year}-${starts[quarter - 1]}`,
    end: `${year}-${ends[quarter - 1]}`,
  };
}

function monthBoundaries(year: number, month: number) {
  const start = `${year}-${month.toString().padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  return {
    label: `${year}-${month.toString().padStart(2, "0")}`,
    start,
    end: endDate.toISOString().slice(0, 10),
  };
}

function parsePeriod(
  text: string,
  fiscalYear?: number,
  providedPeriodLabel?: string,
) {
  const explicitLabel =
    providedPeriodLabel ??
    firstMatch(text, [
      /period\s+label\s*[:=\-]\s*([0-9]{4}-Q[1-4])/im,
      /per[ií]odo\s*[:=\-]\s*([0-9]{4}-Q[1-4])/im,
    ]);
  if (explicitLabel) {
    const match = explicitLabel.match(/^(20\d{2})-Q([1-4])$/i);
    if (match) {
      const boundaries = quarterBoundaries(
        Number.parseInt(match[1], 10),
        Number.parseInt(match[2], 10),
      );
      return {
        periodLabel: boundaries.label,
        periodStart: boundaries.start,
        periodEnd: boundaries.end,
        periodGranularity: "quarter" as const,
        fiscalYear: Number.parseInt(match[1], 10),
      };
    }
  }

  const quarterMatch = text.match(
    /(?:period|per[ií]odo|trimestre)\s*[:=\-]?\s*(?:q([1-4])|([1-4])t|([1-4]))/im,
  );
  const quarterValue =
    quarterMatch?.[1] ?? quarterMatch?.[2] ?? quarterMatch?.[3];
  if (quarterValue && fiscalYear) {
    const quarter = Number.parseInt(quarterValue, 10);
    if (quarter >= 1 && quarter <= 4) {
      const boundaries = quarterBoundaries(fiscalYear, quarter);
      return {
        periodLabel: boundaries.label,
        periodStart: boundaries.start,
        periodEnd: boundaries.end,
        periodGranularity: "quarter" as const,
        fiscalYear,
      };
    }
  }

  const monthMatch = firstMatch(text, [
    /(?:period|per[ií]odo|mes)\s*[:=\-]\s*(0?[1-9]|1[0-2])/im,
  ]);
  if (monthMatch && fiscalYear) {
    const boundaries = monthBoundaries(fiscalYear, Number.parseInt(monthMatch, 10));
    return {
      periodLabel: boundaries.label,
      periodStart: boundaries.start,
      periodEnd: boundaries.end,
      periodGranularity: "month" as const,
      fiscalYear,
    };
  }

  return {};
}

function parseCasillas(text: string) {
  const fields = new Map<string, string>();
  const pattern = /^\s*(?:casilla|box)\s*0*(\d{1,5})\s*[:=\-]\s*(-?\d[\d.,]*)/gim;

  for (const match of text.matchAll(pattern)) {
    const numericCode = Number.parseInt(match[1], 10);
    const fieldCode =
      numericCode < 100
        ? numericCode.toString().padStart(2, "0")
        : numericCode.toString();
    fields.set(fieldCode, match[2]);
  }

  for (const fieldCode of MODELO_303_LAYOUT_FIELD_CODES) {
    if (fields.has(fieldCode)) {
      continue;
    }

    // Same-line match only: `[^\S\n]` is whitespace excluding newline. Without
    // this constraint, an empty casilla would silently inherit the next line's
    // number when OCR collapses a column.
    const layoutPattern = new RegExp(
      `\\b${fieldCode}\\b[^\\S\\n]+(?:[A-Z][^\\S\\n]+)?(${MONEY_PATTERN})\\b`,
      "im",
    );
    const match = text.match(layoutPattern);
    if (match?.[1]) {
      fields.set(fieldCode, match[1]);
    }
  }

  return fields;
}

// AEAT NIF/CIF: 8 digits + letter, letter + 7 digits + letter/digit,
// or letter + 8 digits. Permit common separators stripped before validation.
const SPANISH_TAX_ID_FORMAT = /^[A-Z]?\d{7,8}[A-Z0-9]?$/i;

function parseTaxpayerTaxId(text: string): string | undefined {
  const candidates = [
    /Identificaci[oó]n[\s\S]{0,150}?\bNIF\b[^\n]*\n\s*([A-Z0-9._/-]+)/im,
    /^\s*NIF\s*[:=\-]\s*([A-Z0-9._/-]+)/im,
    /^\s*CIF\s*[:=\-]\s*([A-Z0-9._/-]+)/im,
  ];
  for (const pattern of candidates) {
    const value = firstMatch(text, [pattern]);
    if (value && SPANISH_TAX_ID_FORMAT.test(value.replace(/[._/-]/g, ""))) {
      return value;
    }
  }
  return undefined;
}

function hasNoActivityMarker(text: string): boolean {
  return [
    /sin\s+actividad\s*[:=\-]\s*(?:x|true|s[ií]|yes|1)\b/im,
    /no[-\s]?activity\s*[:=\-]\s*(?:x|true|yes|1)\b/im,
    /(?:^|\n)\s*(?:x|X|☒)\s+sin\s+actividad\b/im,
    /sin\s+actividad\s*(?:\[[xX]\]|\(x\))/im,
  ].some((pattern) => pattern.test(text));
}

function hasPositiveCasilla(
  casillas: Map<string, string>,
  fieldCode: string,
): boolean {
  const value = optionalMoney(casillas.get(fieldCode));
  return isPositive(value);
}

function buildFact(
  fieldCode: string,
  rawValue: string,
  result: NormalizedTaxReportDraft["result"],
): TaxReportFactCreateInput {
  const normalizedValue = normalizeMoneyString(rawValue);
  const direction =
    fieldCode === "71"
      ? result === "payable"
        ? "payable"
        : result === "refund_requested"
          ? "refund"
          : result === "compensate"
            ? "credit"
            : "informational"
      : ["72", "78", "87", "110"].includes(fieldCode)
        ? "credit"
        : fieldCode === "45"
          ? "deductible"
          : "informational";

  return {
    fieldCode,
    fieldSystem: "casilla",
    label: FIELD_LABELS[fieldCode] ?? null,
    valueType: "money",
    rawValue,
    normalizedValue,
    currency: "EUR",
    direction,
    confidence: "medium",
  };
}

function inferResult(
  resultAmount: string | null | undefined,
  text: string,
  casillas: Map<string, string>,
): NormalizedTaxReportDraft["result"] {
  if (hasNoActivityMarker(text)) {
    return "no_activity";
  }

  if (!resultAmount || new Decimal(resultAmount).eq(0)) {
    return "zero";
  }

  if (isPositive(resultAmount)) {
    return "payable";
  }

  if (
    hasPositiveCasilla(casillas, "73") ||
    (isNegative(resultAmount) && /\b(?:a\s+devolver|devolver|refund)\b/i.test(text))
  ) {
    return "refund_requested";
  }

  return "compensate";
}

function paymentStatusForResult(
  result: NormalizedTaxReportDraft["result"],
): NormalizedTaxReportDraft["paymentStatus"] {
  if (result === "payable") {
    return "unpaid";
  }

  if (result === "refund_requested") {
    return "refund_pending";
  }

  if (["compensate", "zero", "no_activity", "informational"].includes(result)) {
    return "not_required";
  }

  return "unknown";
}

function requireNormalized(
  result: TaxCountryParseResult,
): asserts result is TaxCountryParseResult & {
  fiscalYear: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  periodGranularity: NormalizedTaxReportDraft["periodGranularity"];
  currency: string;
} {
  const missing = [
    result.fiscalYear ? null : "fiscalYear",
    result.periodLabel ? null : "periodLabel",
    result.periodStart ? null : "periodStart",
    result.periodEnd ? null : "periodEnd",
    result.periodGranularity ? null : "periodGranularity",
    result.currency ? null : "currency",
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new AppError(`Missing Spanish tax report fields: ${missing.join(", ")}`, {
      statusCode: 422,
      code: "tax_report_extraction_incomplete",
      details: { missing },
    });
  }
}

export const spainTaxCountryModule: TaxCountryModule = {
  countryCode: "ES",

  detect(input: TaxCountryDetectionInput) {
    const explicitCountry = normalizeCountryCode(input.countryCode);
    if (explicitCountry === "ES") {
      return {
        matched: true,
        countryCode: "ES",
        confidence: "high",
        reason: "explicit_country_code",
      };
    }

    if (/\b(?:AEAT|Agencia Tributaria|Modelo\s+303|Modelo\s+390|Modelo\s+130|Modelo\s+200)\b/i.test(input.ocrText)) {
      return {
        matched: true,
        countryCode: "ES",
        confidence: "medium",
        reason: "spanish_tax_ocr_signal",
      };
    }

    return { matched: false, confidence: "low" };
  },

  parse(input: TaxCountryParseInput) {
    const text = input.ocrText;
    const overrides = input.metadata.overrides;
    const formCode =
      normalizeFormCode(overrides?.formCode) ??
      normalizeFormCode(input.metadata.formCode) ??
      normalizeFormCode(firstMatch(text, [/modelo\s*[_\s-]*(303|390|130|200)/im]));

    if (!formCode) {
      throw new AppError("Could not detect Spanish tax form code", {
        statusCode: 422,
        code: "tax_form_not_detected",
      });
    }

    if (formCode !== "303") {
      throw new AppError(`Spanish tax form is not supported for ingest yet: ${formCode}`, {
        statusCode: 422,
        code: "tax_form_not_supported",
        details: { countryCode: "ES", formCode },
      });
    }

    const casillas = parseCasillas(text);
    const warnings: string[] = [];
    const fiscalYear =
      overrides?.fiscalYear ?? input.metadata.fiscalYear ?? parseFiscalYear(text);
    const parsedPeriod = parsePeriod(
      text,
      fiscalYear,
      overrides?.periodLabel ?? input.metadata.periodLabel,
    );
    const resultAmount =
      optionalMoney(casillas.get("71")) ??
      optionalMoney(
        firstMatch(text, [
          new RegExp(`Importe:\\s*I\\s*(${MONEY_PATTERN})`, "im"),
        ]),
      ) ??
      optionalMoney(firstMatch(text, [/result(?:\s+amount)?\s*[:=\-]\s*(-?\d[\d.,]*)/im]));
    const result = overrides?.result ?? inferResult(resultAmount, text, casillas);
    const authoritySubmissionId =
      overrides?.authoritySubmissionId ??
      firstMatch(text, [
        /(?:submission|presentacion|presentación)\s*(?:id|number|numero|número)?\s*[:=\-]\s*([A-Z0-9._/-]+)/im,
        /Expediente\/Referencia[^\n:]*:\s*([A-Z0-9._/-]+)/im,
        /C[oó]digo\s+Seguro\s+de\s+Verificaci[oó]n\s*:\s*([A-Z0-9._/-]+)/im,
      ]) ??
      null;
    const authorityReceiptNumber =
      overrides?.authorityReceiptNumber ??
      firstMatch(text, [
        /(?:receipt|justificante|nrc)\s*(?:number|numero|número)?\s*[:=\-]\s*([A-Z0-9._/-]+)/im,
        /N[uú]mero\s+de\s+justificante\s*:\s*([A-Z0-9._/-]+)/im,
      ]) ??
      null;

    if (!authoritySubmissionId && !authorityReceiptNumber) {
      warnings.push("missing_authority_reference");
    }

    if (!parsedPeriod.periodLabel && !overrides?.periodLabel && !input.metadata.periodLabel) {
      warnings.push("period_ambiguous");
    }

    const facts = Array.from(casillas.entries()).map(([fieldCode, rawValue]) =>
      buildFact(fieldCode, rawValue, result),
    );
    const taxableBase =
      optionalMoney(firstMatch(text, [/taxable\s+base\s*[:=\-]\s*(-?\d[\d.,]*)/im])) ??
      optionalMoney(casillas.get("07"));
    const taxDue =
      optionalMoney(firstMatch(text, [/tax\s+due\s*[:=\-]\s*(-?\d[\d.,]*)/im])) ??
      optionalMoney(casillas.get("27")) ??
      optionalMoney(casillas.get("09"));
    const taxDeductible =
      optionalMoney(firstMatch(text, [/tax\s+deductible\s*[:=\-]\s*(-?\d[\d.,]*)/im])) ??
      optionalMoney(casillas.get("45"));

    return {
      countryCode: "ES",
      formCode,
      formName: MODELO_303_FORM_NAME,
      fiscalYear: parsedPeriod.fiscalYear ?? fiscalYear,
      periodGranularity: parsedPeriod.periodGranularity,
      periodLabel: parsedPeriod.periodLabel,
      periodStart: parsedPeriod.periodStart,
      periodEnd: parsedPeriod.periodEnd,
      taxpayerTaxId:
        overrides?.taxpayerTaxId ??
        parseTaxpayerTaxId(text) ??
        input.companyTaxId ??
        null,
      authoritySubmissionId,
      authorityReceiptNumber,
      filedAt:
        overrides?.filedAt ??
        firstMatch(text, [
          /(?:filed\s+at|fecha\s+presentacion|fecha\s+presentación)\s*[:=\-]\s*([^\n]+)/im,
          /Presentaci[oó]n\s+realizada\s+el\s*:\s*([^\n]+)/im,
        ]) ??
        null,
      dueDate:
        overrides?.dueDate ??
        parseDateValue(firstMatch(text, [/(?:due\s+date|fecha\s+limite|fecha\s+límite)\s*[:=\-]\s*([^\n]+)/im])) ??
        null,
      paymentDueDate:
        overrides?.paymentDueDate ??
        parseDateValue(firstMatch(text, [/(?:payment\s+due\s+date|fecha\s+de\s+pago)\s*[:=\-]\s*([^\n]+)/im])) ??
        null,
      result,
      paymentStatus: overrides?.paymentStatus ?? paymentStatusForResult(result),
      currency: overrides?.currency ?? "EUR",
      taxableBase,
      taxDue,
      taxDeductible,
      resultAmount: resultAmount ?? null,
      retainedAmount: null,
      profitOrLoss: null,
      facts,
      warnings,
      confidence:
        warnings.includes("period_ambiguous") || warnings.includes("missing_authority_reference")
          ? "medium"
          : "high",
      extractedData: {
        parser: "spain.v1",
        formCode,
        casillas: Object.fromEntries(casillas),
      },
    } satisfies TaxCountryParseResult;
  },

  normalize(input: TaxCountryParseResult) {
    requireNormalized(input);

    const status =
      input.warnings.includes("missing_authority_reference") ||
      input.warnings.includes("period_ambiguous")
        ? "needs_review"
        : "filed";

    return {
      countryCode: input.countryCode,
      jurisdiction: null,
      taxKind: "vat",
      formCode: input.formCode,
      formName: input.formName ?? null,
      formVersion: input.formVersion ?? null,
      fiscalYear: input.fiscalYear,
      periodGranularity: input.periodGranularity,
      periodLabel: input.periodLabel,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      taxpayerTaxId: input.taxpayerTaxId ?? null,
      authoritySubmissionId: input.authoritySubmissionId ?? null,
      authorityReceiptNumber: input.authorityReceiptNumber ?? null,
      filedAt: input.filedAt ?? null,
      dueDate: input.dueDate ?? null,
      paymentDueDate: input.paymentDueDate ?? null,
      status,
      result: input.result ?? "unknown",
      paymentStatus: input.paymentStatus ?? "unknown",
      currency: input.currency,
      taxableBase: input.taxableBase ?? null,
      taxDue: input.taxDue ?? null,
      taxDeductible: input.taxDeductible ?? null,
      resultAmount: input.resultAmount ?? null,
      retainedAmount: input.retainedAmount ?? null,
      profitOrLoss: input.profitOrLoss ?? null,
      confidence: input.confidence,
      extractedData: input.extractedData,
      warnings: input.warnings,
      correctionOfTaxReportId: null,
      facts: input.facts,
      carryforwards: [],
    };
  },

  buildCarryforwards(input: NormalizedTaxReportDraft) {
    if (!["compensate", "refund_requested"].includes(input.result)) {
      return [];
    }

    const extracted = input.extractedData as
      | { casillas?: Record<string, string> }
      | null
      | undefined;
    const casillas = extracted?.casillas ?? {};
    const status: TaxCarryforwardCreateInput["status"] =
      input.status === "needs_review" ? "needs_review" : "active";
    const carryforwards: TaxCarryforwardCreateInput[] = [];

    // Casilla 87: prior-period VAT credits remaining after this return.
    // Persists across return types (compensate or refund) because unused
    // prior credits stay on the books regardless of the current period's
    // refund/compensation choice.
    const priorRemaining = optionalMoney(casillas["87"]);
    if (isPositive(priorRemaining) && priorRemaining) {
      const amount = absoluteMoney(priorRemaining);
      carryforwards.push({
        kind: "vat_credit",
        currency: input.currency,
        originalAmount: amount,
        usedAmount: "0.00",
        remainingAmount: amount,
        expiresAt: null,
        status,
        notes: `${MODELO_303_FORM_NAME} prior-period VAT credit remaining (casilla 87)`,
      });
    }

    // Casilla 72: new credit from this period's negative result being
    // carried forward (compensate only — refund_requested moves the credit
    // to the refund channel instead). Requires explicit casilla 72 to
    // avoid double-counting when casilla 87 already represents the same
    // balance and casilla 72 is absent.
    if (input.result === "compensate") {
      const newCredit = optionalMoney(casillas["72"]);
      if (isPositive(newCredit) && newCredit) {
        const amount = absoluteMoney(newCredit);
        carryforwards.push({
          kind: "vat_credit",
          currency: input.currency,
          originalAmount: amount,
          usedAmount: "0.00",
          remainingAmount: amount,
          expiresAt: null,
          status,
          notes: `${MODELO_303_FORM_NAME} current-period VAT credit to compensate (casilla 72)`,
        });
      }
    }

    return carryforwards;
  },
};
