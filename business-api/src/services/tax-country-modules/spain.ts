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

const MONEY_PATTERN =
  "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}|-?\\d+,\\d{2}|-?\\d+\\.\\d{2}";

type SpainSupportedFormCode = "130" | "200" | "303";
type SpainFormConfig = {
  formName: string;
  taxKind: NormalizedTaxReportDraft["taxKind"];
  layoutFieldCodes: string[];
  resultFieldCode: string;
  fieldLabels: Record<string, string>;
};
type TaxReportFactDirection = NonNullable<
  TaxReportFactCreateInput["direction"]
>;

const FORM_CONFIG: Record<SpainSupportedFormCode, SpainFormConfig> = {
  "303": {
    formName: "Modelo 303",
    taxKind: "vat",
    layoutFieldCodes: [
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
    ],
    resultFieldCode: "71",
    fieldLabels: {
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
    },
  },
  "130": {
    formName: "Modelo 130",
    taxKind: "personal_income",
    layoutFieldCodes: [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "12",
      "14",
      "15",
      "17",
      "18",
      "19",
    ],
    resultFieldCode: "19",
    fieldLabels: {
      "01": "Ingresos fiscalmente computables acumulados",
      "02": "Gastos fiscalmente deducibles acumulados",
      "03": "Rendimiento neto acumulado",
      "04": "Porcentaje sobre rendimiento neto positivo",
      "05": "Pagos fraccionados positivos anteriores",
      "06": "Retenciones e ingresos a cuenta soportados",
      "07": "Resultado parcial",
      "12": "Total liquidacion",
      "14": "Resultado despues de minoracion",
      "15": "Resultados negativos de trimestres anteriores",
      "17": "Resultado previo a complementaria",
      "18": "Resultados a ingresar de autoliquidaciones anteriores",
      "19": "Resultado de la autoliquidacion",
    },
  },
  "200": {
    formName: "Modelo 200",
    taxKind: "corporate_income",
    layoutFieldCodes: [
      "00500",
      "00501",
      "00547",
      "00550",
      "00552",
      "01586",
    ],
    resultFieldCode: "01586",
    fieldLabels: {
      "00500": "Resultado de la cuenta de perdidas y ganancias",
      "00501": "Resultado antes del Impuesto sobre Sociedades",
      "00547":
        "Compensacion de bases imponibles negativas de periodos anteriores",
      "00550":
        "Base imponible antes de reserva de capitalizacion y compensacion",
      "00552": "Base imponible",
      "01586": "Resultado de la liquidacion",
    },
  },
};
const SUPPORTED_FORM_CODES = new Set(Object.keys(FORM_CONFIG));

type Modelo200NegativeBaseDetailRow = {
  originFiscalYear: number;
  pendingAtStartOrGenerated: string;
  appliedThisReturn: string;
  pendingForFuture: string;
};

type Modelo200NegativeBaseDetailParseResult = {
  rows: Modelo200NegativeBaseDetailRow[];
  warnings: string[];
};

type Modelo200CodeAmount = {
  code: string;
  amount: string | null;
};

function configForForm(formCode: string): SpainFormConfig {
  return FORM_CONFIG[formCode as SpainSupportedFormCode];
}

function normalizeCountryCode(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase();
}

function normalizeFormCode(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/^MODELO[_\s-]*/, "");
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
    /(?:fiscal\s+year|tax\s+year|ejercicio|ano|año)[^\d]{0,80}(20\d{2})/im,
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

function yearBoundaries(year: number) {
  return {
    label: `${year}`,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
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
    const boundaries = monthBoundaries(
      fiscalYear,
      Number.parseInt(monthMatch, 10),
    );
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

function parseAnnualPeriod(
  text: string,
  fiscalYear?: number,
  providedPeriodLabel?: string,
) {
  const explicitYear =
    firstMatch(providedPeriodLabel ?? "", [/^(20\d{2})$/]) ??
    firstMatch(text, [
      /period\s+label\s*[:=\-]\s*(20\d{2})/im,
      /per[ií]odo\s*[:=\-]\s*(20\d{2})/im,
    ]) ??
    (fiscalYear ? String(fiscalYear) : undefined);

  if (!explicitYear) {
    return {};
  }

  const year = Number.parseInt(explicitYear, 10);
  const boundaries = yearBoundaries(year);
  return {
    periodLabel: boundaries.label,
    periodStart: boundaries.start,
    periodEnd: boundaries.end,
    periodGranularity: "year" as const,
    fiscalYear: year,
  };
}

function layoutFieldCodesForForm(formCode: string): string[] {
  return configForForm(formCode).layoutFieldCodes;
}

function taxKindForForm(formCode: string): NormalizedTaxReportDraft["taxKind"] {
  return configForForm(formCode).taxKind;
}

function normalizeCasillaCode(rawValue: string, formCode: string): string {
  const numericCode = Number.parseInt(rawValue, 10);
  if (formCode === "200") {
    return numericCode.toString().padStart(5, "0");
  }

  return numericCode < 100
    ? numericCode.toString().padStart(2, "0")
    : numericCode.toString();
}

function parseCasillas(text: string, formCode: string) {
  const fields = new Map<string, string>();
  const pattern = /^\s*(?:casilla|box)\s*(\d{1,5})\s*[:=\-]\s*(-?\d[\d.,]*)/gim;

  for (const match of text.matchAll(pattern)) {
    fields.set(normalizeCasillaCode(match[1], formCode), match[2]);
  }

  for (const fieldCode of layoutFieldCodesForForm(formCode)) {
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

function parseModelo200CodeAmounts(line: string): Modelo200CodeAmount[] {
  return Array.from(
    line.matchAll(new RegExp(`\\b(\\d{5})\\b(?:\\s+(${MONEY_PATTERN}))?`, "g")),
  ).map((match) => ({
    code: match[1],
    amount: optionalMoney(match[2]) ?? null,
  }));
}

function parseModelo200NegativeBaseDetailTotals(
  text: string,
): Modelo200NegativeBaseDetailRow | null {
  const totalLine = text.match(/^\s*Total\b.*$/im)?.[0];
  if (!totalLine) {
    return null;
  }

  const totals = new Map(
    parseModelo200CodeAmounts(totalLine)
      .filter((cell) => cell.amount)
      .map((cell) => [cell.code, cell.amount as string]),
  );
  const pendingAtStartOrGenerated = totals.get("00670");
  const appliedThisReturn = totals.get("00547");
  const pendingForFuture = totals.get("00671");
  if (
    !pendingAtStartOrGenerated ||
    !appliedThisReturn ||
    !pendingForFuture
  ) {
    return null;
  }

  return {
    originFiscalYear: 0,
    pendingAtStartOrGenerated,
    appliedThisReturn,
    pendingForFuture,
  };
}

function sumsMatchModelo200Totals(
  rows: Modelo200NegativeBaseDetailRow[],
  totals: Modelo200NegativeBaseDetailRow | null,
): boolean {
  if (!totals) {
    return false;
  }

  const sum = (selector: (row: Modelo200NegativeBaseDetailRow) => string) =>
    rows
      .reduce((total, row) => total.plus(selector(row)), new Decimal(0))
      .toFixed(2);

  return (
    new Decimal(sum((row) => row.pendingAtStartOrGenerated)).eq(
      totals.pendingAtStartOrGenerated,
    ) &&
    new Decimal(sum((row) => row.appliedThisReturn)).eq(
      totals.appliedThisReturn,
    ) &&
    new Decimal(sum((row) => row.pendingForFuture)).eq(
      totals.pendingForFuture,
    )
  );
}

function parseModelo200NegativeBaseDetail(
  text: string,
): Modelo200NegativeBaseDetailParseResult {
  const rows: Modelo200NegativeBaseDetailRow[] = [];
  const warnings: string[] = [];
  let hasMissingAmount = false;
  const rowPattern =
    /^.*Compensaci[oó]n de base a[nñ]o\s+(20\d{2})(?:\(\*\))?.*$/gim;

  for (const match of text.matchAll(rowPattern)) {
    const line = match[0];
    const cells = parseModelo200CodeAmounts(line).slice(0, 3);
    if (cells.length < 3) {
      continue;
    }

    hasMissingAmount ||= cells.some((cell) => !cell.amount);
    const amounts = cells.map((cell) => cell.amount ?? "0.00");
    if (amounts.every((amount) => new Decimal(amount).eq(0))) {
      continue;
    }

    rows.push({
      originFiscalYear: Number.parseInt(match[1], 10),
      pendingAtStartOrGenerated: amounts[0],
      appliedThisReturn: amounts[1],
      pendingForFuture: amounts[2],
    });
  }

  if (
    hasMissingAmount &&
    !sumsMatchModelo200Totals(
      rows,
      parseModelo200NegativeBaseDetailTotals(text),
    )
  ) {
    warnings.push("model_200_negative_base_detail_amount_missing");
  }

  return { rows, warnings };
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

function directionForResultAmount(
  result: NormalizedTaxReportDraft["result"],
): TaxReportFactDirection {
  if (result === "payable") {
    return "payable";
  }

  if (result === "refund_requested") {
    return "refund";
  }

  if (result === "compensate") {
    return "credit";
  }

  return "informational";
}

function modelo130Direction(
  fieldCode: string,
  result: NormalizedTaxReportDraft["result"],
): TaxReportFactDirection {
  if (fieldCode === FORM_CONFIG["130"].resultFieldCode) {
    return directionForResultAmount(result);
  }

  if (["05", "06", "15"].includes(fieldCode)) {
    return "credit";
  }

  if (fieldCode === "02") {
    return "deductible";
  }

  return "informational";
}

function modelo200Direction(
  fieldCode: string,
  result: NormalizedTaxReportDraft["result"],
): TaxReportFactDirection {
  if (fieldCode === "00547") {
    return "credit";
  }

  if (fieldCode === FORM_CONFIG["200"].resultFieldCode) {
    return directionForResultAmount(result);
  }

  return "informational";
}

function modelo303Direction(
  fieldCode: string,
  result: NormalizedTaxReportDraft["result"],
): TaxReportFactDirection {
  if (fieldCode === FORM_CONFIG["303"].resultFieldCode) {
    return directionForResultAmount(result);
  }

  if (["72", "78", "87", "110"].includes(fieldCode)) {
    return "credit";
  }

  if (fieldCode === "45") {
    return "deductible";
  }

  return "informational";
}

function directionForFact(
  formCode: string,
  fieldCode: string,
  result: NormalizedTaxReportDraft["result"],
): TaxReportFactDirection {
  if (formCode === "130") {
    return modelo130Direction(fieldCode, result);
  }

  if (formCode === "200") {
    return modelo200Direction(fieldCode, result);
  }

  return modelo303Direction(fieldCode, result);
}

function buildFact(
  formCode: string,
  fieldCode: string,
  rawValue: string,
  result: NormalizedTaxReportDraft["result"],
): TaxReportFactCreateInput {
  const normalizedValue = normalizeMoneyString(rawValue);
  const formConfig = configForForm(formCode);

  return {
    fieldCode,
    fieldSystem: "casilla",
    label: formConfig.fieldLabels[fieldCode] ?? null,
    valueType: "money",
    rawValue,
    normalizedValue,
    currency: "EUR",
    direction: directionForFact(formCode, fieldCode, result),
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
    (isNegative(resultAmount) &&
      /\b(?:a\s+devolver|devolver|refund)\b/i.test(text))
  ) {
    return "refund_requested";
  }

  return "compensate";
}

function inferModelo130Result(
  resultAmount: string | null | undefined,
): NormalizedTaxReportDraft["result"] {
  if (!resultAmount || new Decimal(resultAmount).eq(0)) {
    return "zero";
  }

  return isPositive(resultAmount) ? "payable" : "compensate";
}

function inferModelo200Result(
  resultAmount: string | null | undefined,
  taxableBase: string | null | undefined,
  text: string,
): NormalizedTaxReportDraft["result"] {
  if (resultAmount) {
    if (new Decimal(resultAmount).eq(0)) {
      return "zero";
    }

    return isPositive(resultAmount) ? "payable" : "refund_requested";
  }

  if (
    /\bresultado\s+cero\b/i.test(text) ||
    (taxableBase && new Decimal(taxableBase).lte(0))
  ) {
    return "zero";
  }

  return "unknown";
}

function inferModelo200TaxableBase(
  casillas: Map<string, string>,
): string | null {
  const taxableBase = optionalMoney(casillas.get("00552"));
  if (taxableBase) {
    return taxableBase;
  }

  const preCompensationTaxableBase = optionalMoney(casillas.get("00550"));
  const priorNegativeBaseApplied = optionalMoney(casillas.get("00547"));
  if (preCompensationTaxableBase && priorNegativeBaseApplied) {
    return new Decimal(preCompensationTaxableBase)
      .minus(priorNegativeBaseApplied)
      .toFixed(2);
  }

  return null;
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
    throw new AppError(
      `Missing Spanish tax report fields: ${missing.join(", ")}`,
      {
        statusCode: 422,
        code: "tax_report_extraction_incomplete",
        details: { missing },
      },
    );
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

    if (
      /\b(?:AEAT|Agencia Tributaria|Modelo\s+303|Modelo\s+390|Modelo\s+130|Modelo\s+200)\b/i.test(
        input.ocrText,
      )
    ) {
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
      normalizeFormCode(
        firstMatch(text, [/modelo\s*[_\s-]*(303|390|130|200)/im]),
      );

    if (!formCode) {
      throw new AppError("Could not detect Spanish tax form code", {
        statusCode: 422,
        code: "tax_form_not_detected",
      });
    }

    if (!SUPPORTED_FORM_CODES.has(formCode)) {
      throw new AppError(
        `Spanish tax form is not supported for ingest yet: ${formCode}`,
        {
          statusCode: 422,
          code: "tax_form_not_supported",
          details: { countryCode: "ES", formCode },
        },
      );
    }

    const casillas = parseCasillas(text, formCode);
    const formConfig = configForForm(formCode);
    const warnings: string[] = [];
    const fiscalYear =
      overrides?.fiscalYear ??
      input.metadata.fiscalYear ??
      parseFiscalYear(text);
    const parsedPeriod =
      formCode === "200"
        ? parseAnnualPeriod(
            text,
            fiscalYear,
            overrides?.periodLabel ?? input.metadata.periodLabel,
          )
        : parsePeriod(
            text,
            fiscalYear,
            overrides?.periodLabel ?? input.metadata.periodLabel,
          );
    const modelo200NegativeBaseDetailParse =
      formCode === "200"
        ? parseModelo200NegativeBaseDetail(text)
        : { rows: [], warnings: [] };
    const modelo200NegativeBaseDetail = modelo200NegativeBaseDetailParse.rows;
    const taxableBase =
      formCode === "303"
        ? (optionalMoney(
            firstMatch(text, [/taxable\s+base\s*[:=\-]\s*(-?\d[\d.,]*)/im]),
          ) ?? optionalMoney(casillas.get("07")))
        : formCode === "200"
          ? inferModelo200TaxableBase(casillas)
          : null;
    const resultAmount =
      optionalMoney(casillas.get(formConfig.resultFieldCode)) ??
      optionalMoney(
        firstMatch(text, [
          new RegExp(`Importe:\\s*I\\s*(${MONEY_PATTERN})`, "im"),
        ]),
      ) ??
      optionalMoney(
        firstMatch(text, [/result(?:\s+amount)?\s*[:=\-]\s*(-?\d[\d.,]*)/im]),
      );
    const result =
      overrides?.result ??
      (formCode === "130"
        ? inferModelo130Result(resultAmount)
        : formCode === "200"
          ? inferModelo200Result(resultAmount, taxableBase, text)
          : inferResult(resultAmount, text, casillas));
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

    warnings.push(...modelo200NegativeBaseDetailParse.warnings);

    if (!authoritySubmissionId && !authorityReceiptNumber) {
      warnings.push("missing_authority_reference");
    }

    if (
      !parsedPeriod.periodLabel &&
      !overrides?.periodLabel &&
      !input.metadata.periodLabel
    ) {
      warnings.push("period_ambiguous");
    }

    if (
      formCode === "200" &&
      taxableBase &&
      isNegative(taxableBase) &&
      modelo200NegativeBaseDetail.length === 0
    ) {
      warnings.push("model_200_negative_base_detail_missing");
    }

    const facts = Array.from(casillas.entries()).map(([fieldCode, rawValue]) =>
      buildFact(formCode, fieldCode, rawValue, result),
    );
    const taxDue =
      formCode === "303"
        ? (optionalMoney(
            firstMatch(text, [/tax\s+due\s*[:=\-]\s*(-?\d[\d.,]*)/im]),
          ) ??
          optionalMoney(casillas.get("27")) ??
          optionalMoney(casillas.get("09")))
        : null;
    const taxDeductible =
      formCode === "303"
        ? (optionalMoney(
            firstMatch(text, [/tax\s+deductible\s*[:=\-]\s*(-?\d[\d.,]*)/im]),
          ) ?? optionalMoney(casillas.get("45")))
        : null;

    return {
      countryCode: "ES",
      formCode,
      formName: formConfig.formName,
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
        parseDateValue(
          firstMatch(text, [
            /(?:due\s+date|fecha\s+limite|fecha\s+límite)\s*[:=\-]\s*([^\n]+)/im,
          ]),
        ) ??
        null,
      paymentDueDate:
        overrides?.paymentDueDate ??
        parseDateValue(
          firstMatch(text, [
            /(?:payment\s+due\s+date|fecha\s+de\s+pago)\s*[:=\-]\s*([^\n]+)/im,
          ]),
        ) ??
        null,
      result,
      paymentStatus: overrides?.paymentStatus ?? paymentStatusForResult(result),
      currency: overrides?.currency ?? "EUR",
      taxableBase,
      taxDue,
      taxDeductible,
      resultAmount: resultAmount ?? null,
      retainedAmount:
        formCode === "130" ? (optionalMoney(casillas.get("06")) ?? null) : null,
      profitOrLoss:
        formCode === "130"
          ? (optionalMoney(casillas.get("03")) ?? null)
          : formCode === "200"
            ? (taxableBase ?? optionalMoney(casillas.get("00500")) ?? null)
            : null,
      facts,
      warnings,
      confidence:
        warnings.includes("period_ambiguous") ||
        warnings.includes("missing_authority_reference") ||
        warnings.includes("model_200_negative_base_detail_amount_missing")
          ? "medium"
          : "high",
      extractedData: {
        parser: "spain.v1",
        formCode,
        casillas: Object.fromEntries(casillas),
        modelo200NegativeBaseDetail,
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
      taxKind: taxKindForForm(input.formCode),
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
    const extracted = input.extractedData as
      | {
          casillas?: Record<string, string>;
          modelo200NegativeBaseDetail?: Modelo200NegativeBaseDetailRow[];
        }
      | null
      | undefined;
    const casillas = extracted?.casillas ?? {};
    const status: TaxCarryforwardCreateInput["status"] =
      input.status === "needs_review" ? "needs_review" : "active";
    const carryforwards: TaxCarryforwardCreateInput[] = [];

    if (input.formCode === "130") {
      const finalResult = optionalMoney(casillas["19"]) ?? input.resultAmount;
      const quarter = input.periodLabel.match(/-Q([1-4])$/)?.[1];
      if (
        input.result !== "compensate" ||
        !finalResult ||
        !isNegative(finalResult) ||
        !["1", "2", "3"].includes(quarter ?? "")
      ) {
        return [];
      }

      const amount = absoluteMoney(finalResult);
      return [
        {
          kind: "installment_credit",
          currency: input.currency,
          originalAmount: amount,
          usedAmount: "0.00",
          remainingAmount: amount,
          expiresAt: `${input.fiscalYear}-12-31`,
          status,
          notes: `${FORM_CONFIG["130"].formName} same-year negative payment result to deduct (casilla 19)`,
        },
      ];
    }

    if (input.formCode === "200") {
      const detailRows = extracted?.modelo200NegativeBaseDetail ?? [];
      if (detailRows.length > 0) {
        return detailRows.map((row) => {
          const remainingAmount = normalizeMoneyString(row.pendingForFuture);
          const rowStatus: TaxCarryforwardCreateInput["status"] =
            status === "needs_review"
              ? "needs_review"
              : isPositive(remainingAmount)
                ? "active"
                : "used";

          return {
            kind: "tax_loss",
            currency: input.currency,
            originalAmount: normalizeMoneyString(row.pendingAtStartOrGenerated),
            usedAmount: normalizeMoneyString(row.appliedThisReturn),
            remainingAmount,
            expiresAt: null,
            status: rowStatus,
            notes: `${FORM_CONFIG["200"].formName} negative taxable base detail for ${row.originFiscalYear}`,
          };
        });
      }

      const taxableBase = input.taxableBase ?? optionalMoney(casillas["00552"]);
      if (!taxableBase || !isNegative(taxableBase)) {
        return [];
      }

      const amount = absoluteMoney(taxableBase);
      return [
        {
          kind: "tax_loss",
          currency: input.currency,
          originalAmount: amount,
          usedAmount: "0.00",
          remainingAmount: amount,
          expiresAt: null,
          status: "needs_review",
          notes: `${FORM_CONFIG["200"].formName} negative taxable base without page-15 detail`,
        },
      ];
    }

    if (!["compensate", "refund_requested"].includes(input.result)) {
      return [];
    }

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
        notes: `${FORM_CONFIG["303"].formName} prior-period VAT credit remaining (casilla 87)`,
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
          notes: `${FORM_CONFIG["303"].formName} current-period VAT credit to compensate (casilla 72)`,
        });
      }
    }

    return carryforwards;
  },
};
