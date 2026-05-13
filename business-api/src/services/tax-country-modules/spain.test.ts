import { describe, expect, it } from "vitest";

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

  it("builds VAT credit carryforwards for Modelo 303 compensation returns", () => {
    const parsed = spainTaxCountryModule.parse({
      ocrText: `
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q2
NIF: B12345678
Presentacion id: AEAT303Q2
Casilla 71: -180,00
Casilla 87: 180,00
`,
      metadata: {
        kind: "tax_declaration",
        companyCardId: "comp_test",
        countryCode: "ES",
      },
      companyTaxId: null,
    });
    const normalized = spainTaxCountryModule.normalize(parsed);

    expect(normalized.result).toBe("compensate");
    expect(spainTaxCountryModule.buildCarryforwards(normalized)).toEqual([
      expect.objectContaining({
        kind: "vat_credit",
        remainingAmount: "180.00",
        status: "active",
      }),
    ]);
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
