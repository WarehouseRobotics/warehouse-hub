import { describe, expect, it } from "vitest";

import { realAeatModelo303Text } from "../../../test/helpers/spain-fixtures.js";
import { selectTaxCountryModule } from "./index.js";
import { spainTaxCountryModule } from "./spain.js";

const payable303Text = `
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q1
NIF: B12345678
Presentacion id: AEAT303Q1
Casilla 07: 12000,00
field 99: 999,00
Casilla 28: 2520,00
Casilla 45: 680,00
Casilla 71: 1840,00
`;

const payable130Text = `
AEAT Modelo 130
Ejercicio: 2026
Periodo: Q2
NIF: 12345678Z
Presentacion id: AEAT130Q2
Casilla 01: 30000,00
Casilla 02: 12000,00
Casilla 03: 18000,00
Casilla 04: 3600,00
Casilla 05: 800,00
Casilla 06: 500,00
Casilla 07: 2300,00
Casilla 12: 2300,00
Casilla 14: 2300,00
Casilla 15: 0,00
Casilla 17: 2300,00
Casilla 18: 0,00
Casilla 19: 2300,00
`;

function parseAndNormalize(text: string) {
  const parsed = spainTaxCountryModule.parse({
    ocrText: text,
    metadata: {
      kind: "tax_declaration",
      companyCardId: "comp_test",
      countryCode: "ES",
    },
    companyTaxId: null,
  });

  return {
    parsed,
    normalized: spainTaxCountryModule.normalize(parsed),
  };
}

describe("spainTaxCountryModule", () => {
  it("detects and normalizes Modelo 303 payable returns", () => {
    const detected = spainTaxCountryModule.detect({
      kind: "tax_declaration",
      countryCode: undefined,
      formCode: undefined,
      ocrText: payable303Text,
    });
    const parsed = spainTaxCountryModule.parse({
      ocrText: payable303Text,
      metadata: { kind: "tax_declaration", companyCardId: "comp_test" },
      companyTaxId: null,
    });
    const normalized = spainTaxCountryModule.normalize(parsed);

    expect(detected).toEqual(
      expect.objectContaining({ matched: true, countryCode: "ES" }),
    );
    expect(normalized).toEqual(
      expect.objectContaining({
        countryCode: "ES",
        taxKind: "vat",
        formCode: "303",
        fiscalYear: 2026,
        periodGranularity: "quarter",
        periodLabel: "2026-Q1",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        status: "filed",
        result: "payable",
        paymentStatus: "unpaid",
        resultAmount: "1840.00",
        taxableBase: "12000.00",
      }),
    );
    expect(normalized.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldCode: "07",
          fieldSystem: "casilla",
          normalizedValue: "12000.00",
        }),
        expect.objectContaining({
          fieldCode: "71",
          fieldSystem: "casilla",
          direction: "payable",
          normalizedValue: "1840.00",
        }),
      ]),
    );
    expect(normalized.facts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldCode: "99" })]),
    );
    expect(parsed.extractedData).toEqual(
      expect.objectContaining({
        casillas: expect.objectContaining({ "07": "12000,00" }),
      }),
    );
    expect(parsed.extractedData).not.toEqual(
      expect.objectContaining({ rawText: expect.any(String) }),
    );
  });

  it.each([
    {
      name: "payable",
      text: payable303Text,
      result: "payable",
      paymentStatus: "unpaid",
      carryforwards: [],
    },
    {
      name: "compensate",
      text: `
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q2
NIF: B12345678
Presentacion id: AEAT303Q2
Casilla 71: -180,00
Casilla 72: 180,00
`,
      result: "compensate",
      paymentStatus: "not_required",
      carryforwards: [
        expect.objectContaining({
          kind: "vat_credit",
          remainingAmount: "180.00",
        }),
      ],
    },
    {
      name: "refund",
      text: `
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q3
NIF: B12345678
Presentacion id: AEAT303Q3
Casilla 71: -220,00
Casilla 73: 220,00
`,
      result: "refund_requested",
      paymentStatus: "refund_pending",
      carryforwards: [],
    },
    {
      name: "zero",
      text: `
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q4
NIF: B12345678
Presentacion id: AEAT303Q4
Casilla 71: 0,00
`,
      result: "zero",
      paymentStatus: "not_required",
      carryforwards: [],
    },
    {
      name: "no activity",
      text: `
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q4
NIF: B12345678
Presentacion id: AEAT303Q4NA
Sin actividad: X
Casilla 71: 0,00
`,
      result: "no_activity",
      paymentStatus: "not_required",
      carryforwards: [],
    },
  ])(
    "maps Modelo 303 $name returns to the expected result state",
    ({ text, result, paymentStatus, carryforwards }) => {
      const { normalized } = parseAndNormalize(text);

      expect(normalized).toEqual(
        expect.objectContaining({
          result,
          paymentStatus,
        }),
      );
      expect(spainTaxCountryModule.buildCarryforwards(normalized)).toEqual(
        carryforwards,
      );
    },
  );

  it("builds VAT credit carryforwards for both prior-period and current-period balances", () => {
    const { normalized } = parseAndNormalize(`
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q2
NIF: B12345678
Presentacion id: AEAT303Q2
Casilla 71: -200,00
Casilla 72: 200,00
Casilla 78: 20,00
Casilla 87: 180,00
`);

    expect(normalized.result).toBe("compensate");
    expect(normalized.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldCode: "78",
          normalizedValue: "20.00",
          direction: "credit",
        }),
      ]),
    );

    const carryforwards = spainTaxCountryModule.buildCarryforwards(normalized);
    expect(carryforwards).toHaveLength(2);
    expect(carryforwards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "vat_credit",
          remainingAmount: "180.00",
          status: "active",
          notes: expect.stringContaining("casilla 87"),
        }),
        expect.objectContaining({
          kind: "vat_credit",
          remainingAmount: "200.00",
          status: "active",
          notes: expect.stringContaining("casilla 72"),
        }),
      ]),
    );
  });

  it("extracts Modelo 303 facts from AEAT PDF text layout", () => {
    const { parsed, normalized } = parseAndNormalize(realAeatModelo303Text);

    expect(normalized).toEqual(
      expect.objectContaining({
        countryCode: "ES",
        taxKind: "vat",
        formCode: "303",
        fiscalYear: 2025,
        periodGranularity: "quarter",
        periodLabel: "2025-Q3",
        periodStart: "2025-07-01",
        periodEnd: "2025-09-30",
        taxpayerTaxId: "B02672152",
        authorityReceiptNumber: "3036662516571",
        status: "filed",
        result: "compensate",
        resultAmount: "-169.41",
        taxDeductible: "169.41",
      }),
    );
    expect(parsed.extractedData).toEqual(
      expect.objectContaining({
        casillas: expect.objectContaining({
          "71": "-169,41",
          "72": "169,41",
          "87": "7.648,17",
          "110": "7.648,17",
        }),
      }),
    );
    expect(normalized.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldCode: "71", normalizedValue: "-169.41" }),
        expect.objectContaining({ fieldCode: "72", normalizedValue: "169.41" }),
        expect.objectContaining({ fieldCode: "87", normalizedValue: "7648.17" }),
        expect.objectContaining({ fieldCode: "110", normalizedValue: "7648.17" }),
      ]),
    );
    expect(normalized.warnings).toEqual([]);
    expect(normalized.confidence).toBe("high");
    expect(spainTaxCountryModule.buildCarryforwards(normalized)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "vat_credit",
          remainingAmount: "7648.17",
          status: "active",
          notes: expect.stringContaining("casilla 87"),
        }),
        expect.objectContaining({
          kind: "vat_credit",
          remainingAmount: "169.41",
          status: "active",
          notes: expect.stringContaining("casilla 72"),
        }),
      ]),
    );
  });

  it("classifies negative result with 'A devolver' keyword as refund when casilla 73 is missing", () => {
    const { normalized } = parseAndNormalize(`
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q3
NIF: B12345678
Presentacion id: AEAT303Q3K
A DEVOLVER
Casilla 71: -120,00
`);

    expect(normalized.result).toBe("refund_requested");
    expect(normalized.paymentStatus).toBe("refund_pending");
  });

  it("treats negative result without refund signals as compensate", () => {
    const { normalized } = parseAndNormalize(`
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q3
NIF: B12345678
Presentacion id: AEAT303Q3C
Casilla 71: -120,00
Casilla 73: 0,00
`);

    expect(normalized.result).toBe("compensate");
  });

  it("normalizes Modelo 130 payable returns with YTD profit and retained amount but no withholding carryforward", () => {
    const { parsed, normalized } = parseAndNormalize(payable130Text);

    expect(normalized).toEqual(
      expect.objectContaining({
        countryCode: "ES",
        taxKind: "personal_income",
        formCode: "130",
        formName: "Modelo 130",
        fiscalYear: 2026,
        periodGranularity: "quarter",
        periodLabel: "2026-Q2",
        periodStart: "2026-04-01",
        periodEnd: "2026-06-30",
        taxpayerTaxId: "12345678Z",
        status: "filed",
        result: "payable",
        paymentStatus: "unpaid",
        resultAmount: "2300.00",
        retainedAmount: "500.00",
        profitOrLoss: "18000.00",
      }),
    );
    expect(normalized.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldCode: "01",
          label: "Ingresos fiscalmente computables acumulados",
          normalizedValue: "30000.00",
        }),
        expect.objectContaining({
          fieldCode: "02",
          direction: "deductible",
          normalizedValue: "12000.00",
        }),
        expect.objectContaining({
          fieldCode: "06",
          direction: "credit",
          normalizedValue: "500.00",
        }),
        expect.objectContaining({
          fieldCode: "19",
          direction: "payable",
          normalizedValue: "2300.00",
        }),
      ]),
    );
    expect(parsed.extractedData).toEqual(
      expect.objectContaining({
        casillas: expect.objectContaining({
          "03": "18000,00",
          "19": "2300,00",
        }),
      }),
    );
    const carryforwards = spainTaxCountryModule.buildCarryforwards(normalized);
    expect(carryforwards).toEqual([]);
    expect(carryforwards).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "withholding_credit" }),
      ]),
    );
  });

  it("keeps negative Modelo 130 YTD net result as profitOrLoss without tax-loss carryforward", () => {
    const { normalized } = parseAndNormalize(`
AEAT Modelo 130
Ejercicio: 2026
Periodo: Q1
NIF: 12345678Z
Presentacion id: AEAT130Q1NEG
Casilla 01: 4000,00
Casilla 02: 6000,00
Casilla 03: -2000,00
Casilla 04: 0,00
Casilla 05: 0,00
Casilla 06: 0,00
Casilla 07: 0,00
Casilla 12: 0,00
Casilla 14: 0,00
Casilla 15: 0,00
Casilla 17: 0,00
Casilla 18: 0,00
Casilla 19: 0,00
`);

    const carryforwards = spainTaxCountryModule.buildCarryforwards(normalized);

    expect(normalized).toEqual(
      expect.objectContaining({
        taxKind: "personal_income",
        formCode: "130",
        result: "zero",
        paymentStatus: "not_required",
        resultAmount: "0.00",
        profitOrLoss: "-2000.00",
      }),
    );
    expect(carryforwards).toEqual([]);
    expect(carryforwards).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "tax_loss" })]),
    );
  });

  it("creates same-year Modelo 130 installment credits for negative Q1-Q3 final results", () => {
    const { normalized } = parseAndNormalize(`
AEAT Modelo 130
Ejercicio: 2026
Periodo: Q3
NIF: 12345678Z
Presentacion id: AEAT130Q3CREDIT
Casilla 01: 20000,00
Casilla 02: 15000,00
Casilla 03: 5000,00
Casilla 04: 1000,00
Casilla 05: 700,00
Casilla 06: 100,00
Casilla 07: 200,00
Casilla 12: 200,00
Casilla 14: -75,00
Casilla 15: 0,00
Casilla 17: -75,00
Casilla 18: 0,00
Casilla 19: -75,00
`);

    expect(normalized).toEqual(
      expect.objectContaining({
        result: "compensate",
        paymentStatus: "not_required",
        resultAmount: "-75.00",
        profitOrLoss: "5000.00",
      }),
    );
    expect(spainTaxCountryModule.buildCarryforwards(normalized)).toEqual([
      expect.objectContaining({
        kind: "installment_credit",
        originalAmount: "75.00",
        usedAmount: "0.00",
        remainingAmount: "75.00",
        expiresAt: "2026-12-31",
        status: "active",
        notes: expect.stringContaining("casilla 19"),
      }),
    ]);
  });

  it("does not carry negative Modelo 130 Q4 final results into the next year", () => {
    const { normalized } = parseAndNormalize(`
AEAT Modelo 130
Ejercicio: 2026
Periodo: Q4
NIF: 12345678Z
Presentacion id: AEAT130Q4NEG
Casilla 01: 20000,00
Casilla 02: 15000,00
Casilla 03: 5000,00
Casilla 04: 1000,00
Casilla 05: 700,00
Casilla 06: 100,00
Casilla 07: 200,00
Casilla 12: 200,00
Casilla 14: -75,00
Casilla 15: 0,00
Casilla 17: -75,00
Casilla 18: 0,00
Casilla 19: -75,00
`);

    expect(normalized).toEqual(
      expect.objectContaining({
        periodLabel: "2026-Q4",
        result: "compensate",
        resultAmount: "-75.00",
      }),
    );
    expect(spainTaxCountryModule.buildCarryforwards(normalized)).toEqual([]);
  });

  it("rejects unsupported countries and Spanish forms", () => {
    expect(() =>
      selectTaxCountryModule({
        kind: "tax_declaration",
        countryCode: "FR",
        formCode: "303",
        ocrText: payable303Text,
      }),
    ).toThrow("Unsupported tax report country");

    expect(() =>
      spainTaxCountryModule.parse({
        ocrText: "AEAT Modelo 390\nEjercicio: 2026\nPeriodo: 2026",
        metadata: {
          kind: "tax_declaration",
          companyCardId: "comp_test",
          countryCode: "ES",
        },
        companyTaxId: null,
      }),
    ).toThrow("not supported");
  });
});
