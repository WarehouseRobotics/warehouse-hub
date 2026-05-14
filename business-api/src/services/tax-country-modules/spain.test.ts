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
