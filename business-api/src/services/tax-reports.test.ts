import { describe, expect, it } from "vitest";

import {
  createTaxReportFingerprint,
  mapTaxCarryforward,
  mapTaxReport,
  mapTaxReportFact,
  mapTaxReportPaymentLink,
} from "./tax-reports.js";
import { taxCarryforwardSchema, taxReportPaymentLinkSchema } from "@warehouse-hub/business-schemas";

describe("tax report foundation helpers", () => {
  it("creates a stable normalized fingerprint", () => {
    const first = createTaxReportFingerprint({
      companyCardId: " comp_001 ",
      countryCode: "es",
      taxKind: "vat",
      formCode: " 303 ",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      taxpayerTaxId: " b12345678 ",
      authoritySubmissionId: " ref  123 ",
      authorityReceiptNumber: null,
    });

    const secondInput = {
      companyCardId: "comp_001",
      countryCode: "ES",
      taxKind: "vat" as const,
      formCode: "303",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      taxpayerTaxId: "B12345678",
      authoritySubmissionId: "REF 123",
    };
    const second = createTaxReportFingerprint(secondInput);

    expect(first).toEqual(second);
    expect(first).toHaveLength(64);
    expect(createTaxReportFingerprint({ ...secondInput, companyCardId: "COMP_001" })).not.toEqual(first);
  });

  it("maps tax reports with public ids and safe JSON parsing", () => {
    const mapped = mapTaxReport({
      id: "tr_001",
      slug: "steady-tax-report",
      companyCardId: "comp_001",
      documentId: "doc_001",
      countryCode: "ES",
      jurisdiction: null,
      taxKind: "vat",
      formCode: "303",
      formName: "Modelo 303",
      formVersion: null,
      fiscalYear: 2026,
      periodGranularity: "quarter",
      periodLabel: "2026-Q1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      taxpayerTaxId: "B12345678",
      authoritySubmissionId: "sub_001",
      authorityReceiptNumber: null,
      filedAt: "2026-04-15T10:30:00.000Z",
      dueDate: "2026-04-20",
      paymentDueDate: null,
      status: "filed",
      result: "payable",
      paymentStatus: "unpaid",
      currency: "EUR",
      taxableBase: "12000.00",
      taxDue: "2520.00",
      taxDeductible: "680.00",
      resultAmount: "1840.00",
      retainedAmount: null,
      profitOrLoss: null,
      confidence: "high",
      fingerprint: "fp_001",
      extractedDataJson: "{\"casillas\":{\"71\":\"1840.00\"}}",
      warningsJson: "[\"period_inferred\"]",
      correctionOfTaxReportId: null,
      createdAt: "2026-04-15T10:31:00.000Z",
      updatedAt: "2026-04-15T10:31:00.000Z",
      deletedAt: null,
    });

    expect(mapped.taxReportId).toEqual("tr_001");
    expect(mapped.extractedData).toEqual({ casillas: { "71": "1840.00" } });
    expect(mapped.warnings).toEqual(["period_inferred"]);
  });

  it("adds synthetic warnings for malformed persisted JSON", () => {
    const mapped = mapTaxReport({
      id: "tr_001",
      slug: "steady-tax-report",
      companyCardId: "comp_001",
      documentId: "doc_001",
      countryCode: "ES",
      jurisdiction: null,
      taxKind: "vat",
      formCode: "303",
      formName: null,
      formVersion: null,
      fiscalYear: 2026,
      periodGranularity: "quarter",
      periodLabel: "2026-Q1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      taxpayerTaxId: null,
      authoritySubmissionId: null,
      authorityReceiptNumber: null,
      filedAt: null,
      dueDate: null,
      paymentDueDate: null,
      status: "needs_review",
      result: "unknown",
      paymentStatus: "unknown",
      currency: "EUR",
      taxableBase: null,
      taxDue: null,
      taxDeductible: null,
      resultAmount: null,
      retainedAmount: null,
      profitOrLoss: null,
      confidence: "low",
      fingerprint: "fp_001",
      extractedDataJson: "{bad json",
      warningsJson: "[\"parser_warning\", 42]",
      correctionOfTaxReportId: null,
      createdAt: "2026-04-15T10:31:00.000Z",
      updatedAt: "2026-04-15T10:31:00.000Z",
      deletedAt: null,
    });

    expect(mapped.extractedData).toBeNull();
    expect(mapped.warnings).toEqual([
      "parser_warning",
      "non_string_warning_dropped",
      "malformed_extracted_data_json",
    ]);
  });

  it("maps null optional fields without throwing", () => {
    expect(
      mapTaxReportFact({
        id: "trf_001",
        taxReportId: "tr_001",
        countryCode: "ES",
        formCode: "303",
        fieldCode: "71",
        fieldSystem: "casilla",
        label: null,
        valueType: "money",
        rawValue: "1840,00",
        normalizedValue: null,
        currency: null,
        rate: null,
        direction: null,
        confidence: "medium",
        createdAt: "2026-04-15T10:31:00.000Z",
      }).taxReportFactId,
    ).toEqual("trf_001");

    const carryforward = mapTaxCarryforward({
      id: "tcf_001",
      slug: "steady-carryforward",
      companyCardId: "comp_001",
      countryCode: "ES",
      jurisdiction: null,
      taxKind: "vat",
      kind: "vat_credit",
      originTaxReportId: "tr_001",
      originFiscalYear: 2026,
      originPeriodLabel: "2026-Q1",
      currency: "EUR",
      originalAmount: "100.00",
      usedAmount: "0.00",
      remainingAmount: "100.00",
      expiresAt: null,
      status: "active",
      notes: null,
      createdAt: "2026-04-15T10:31:00.000Z",
      updatedAt: "2026-04-15T10:31:00.000Z",
      deletedAt: null,
    });
    expect(carryforward.taxCarryforwardId).toEqual("tcf_001");
    expect(taxCarryforwardSchema.parse(carryforward).slug).toEqual("steady-carryforward");

    const paymentLink = mapTaxReportPaymentLink({
      id: "trpl_001",
      slug: "steady-payment-link",
      taxReportId: "tr_001",
      bankTransactionId: null,
      documentId: null,
      amount: "1840.00",
      currency: "EUR",
      paidAt: null,
      paymentReference: null,
      status: "suggested",
      confidence: "low",
      reason: null,
      createdAt: "2026-04-15T10:31:00.000Z",
      updatedAt: "2026-04-15T10:31:00.000Z",
      deletedAt: null,
    });
    expect(paymentLink.taxReportPaymentLinkId).toEqual("trpl_001");
    expect(taxReportPaymentLinkSchema.parse(paymentLink).slug).toEqual("steady-payment-link");
  });
});
