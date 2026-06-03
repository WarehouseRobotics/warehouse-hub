import { describe, expect, it } from "vitest";

import { structuredTaxReportSchema } from "./structured-tax-report.js";

describe("structuredTaxReportSchema", () => {
  it("normalizes empty optional strings from structured OCR to null", () => {
    const parsed = structuredTaxReportSchema.parse({
      schemaVersion: "tax_report.v1",
      documentType: "tax_declaration",
      countryCode: "ES",
      authorityName: "AEAT",
      formCode: "200",
      formName: "Modelo 200",
      formVersion: "",
      taxKind: "corporate_income",
      fiscalYear: 2024,
      periodGranularity: "year",
      periodLabel: "2024",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      taxpayerTaxId: "B02672152",
      authoritySubmissionId: "202420067210082L",
      authorityReceiptNumber: "2005683250690",
      filedAt: "",
      dueDate: null,
      paymentDueDate: null,
      result: "zero",
      paymentStatus: "not_required",
      currency: "EUR",
      taxableBase: "",
      taxDue: "",
      taxDeductible: "",
      resultAmount: "",
      retainedAmount: "",
      profitOrLoss: "",
      fields: [
        {
          fieldCode: "00550",
          fieldSystem: "casilla",
          label: "",
          valueType: "money",
          rawValue: "218,51",
          normalizedValue: "",
          currency: "EUR",
          rate: "",
          direction: "informational",
          confidence: "high",
        },
        {
          fieldCode: "00552",
          fieldSystem: "casilla",
          label: "Base imponible",
          valueType: "money",
          rawValue: "",
          normalizedValue: "",
          currency: "EUR",
          rate: null,
          direction: "informational",
          confidence: "medium",
        },
      ],
      carryforwardDetails: [
        {
          kind: "tax_loss",
          originFiscalYear: 2022,
          pendingAtStartOrGenerated: "20.087,97",
          appliedThisReturn: "",
          pendingForFuture: "19.869,46",
          originalAmount: "",
          usedAmount: "",
          remainingAmount: "",
          expiresAt: null,
          notes: "",
        },
      ],
      warnings: [],
      confidence: "high",
      rawText: "Modelo 200",
      pageNotes: null,
    });

    expect(parsed.formVersion).toBeNull();
    expect(parsed.filedAt).toBeNull();
    expect(parsed.taxableBase).toBeNull();
    expect(parsed.fields[0]?.label).toBeNull();
    expect(parsed.fields[0]?.normalizedValue).toBeNull();
    expect(parsed.fields[0]?.rate).toBeNull();
    expect(parsed.fields[1]?.rawValue).toBe("");
    expect(parsed.fields[1]?.normalizedValue).toBeNull();
    expect(parsed.carryforwardDetails[0]?.appliedThisReturn).toBeNull();
    expect(parsed.carryforwardDetails[0]?.notes).toBeNull();
  });
});
