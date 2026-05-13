import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");

async function resetTestState() {
  const { resetDatabase, initializeDatabase } =
    await import("../src/db/connection.js");
  resetDatabase();
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(path.join(testDataDir, "business-api.sqlite"), { force: true });
  fs.rmSync(path.join(testDataDir, "uploads"), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(testDataDir, "llms.mock.yaml"), { force: true });
  initializeDatabase();
}

async function createCompanyCard() {
  const { upsertCompanyCard } = await import("../src/services/company-card.js");
  return upsertCompanyCard({
    legalName: "Northwind Robotics SL",
    displayName: "Northwind Robotics",
    taxId: "B12345678",
    address: {
      street1: "Calle de Alcala 42",
      city: "Madrid",
      postalCode: "28014",
      countryCode: "ES",
    },
    invoiceDefaults: {
      currency: "EUR",
      paymentTermsDays: 30,
      vatMode: "standard",
    },
  });
}

async function uploadTaxDocument(contents = "modelo 303") {
  const { uploadDocument } = await import("../src/services/documents.js");
  return uploadDocument(
    {
      fieldname: "file",
      originalname: "modelo-303.pdf",
      encoding: "7bit",
      mimetype: "application/pdf",
      size: contents.length,
      buffer: Buffer.from(contents),
      stream: undefined as never,
      destination: "",
      filename: "",
      path: "",
    },
    {
      kind: "tax_declaration",
      source: "accountant_upload",
    },
  );
}

function baseTaxReportInput(companyCardId: string, documentId: string) {
  return {
    companyCardId,
    documentId,
    countryCode: "ES",
    taxKind: "vat" as const,
    formCode: "303",
    formName: "Modelo 303",
    formVersion: null,
    fiscalYear: 2026,
    periodGranularity: "quarter" as const,
    periodLabel: "2026-Q1",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxpayerTaxId: "B12345678",
    authoritySubmissionId: "AEAT-303-Q1",
    authorityReceiptNumber: null,
    filedAt: "2026-04-15T10:30:00.000Z",
    dueDate: "2026-04-20",
    paymentDueDate: "2026-04-20",
    status: "filed" as const,
    result: "compensate" as const,
    paymentStatus: "not_required" as const,
    currency: "EUR",
    taxableBase: "12000",
    taxDue: "2520",
    taxDeductible: "2700",
    resultAmount: "-180",
    retainedAmount: null,
    profitOrLoss: null,
    confidence: "high" as const,
    extractedData: { casillas: { "71": "-180.00" } },
    warnings: ["period_confirmed"],
    correctionOfTaxReportId: null,
    facts: [
      {
        fieldCode: "71",
        fieldSystem: "casilla" as const,
        label: "Resultado",
        valueType: "money" as const,
        rawValue: "-180,00",
        normalizedValue: "-180",
        currency: "EUR",
        direction: "credit" as const,
        confidence: "high" as const,
      },
    ],
    carryforwards: [
      {
        kind: "vat_credit" as const,
        currency: "EUR",
        originalAmount: "180",
        usedAmount: "0",
        remainingAmount: "180",
        expiresAt: null,
        status: "active" as const,
        notes: "Modelo 303 compensation balance",
      },
    ],
  };
}

describe("tax report service flows", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  it("creates a tax report with facts, carryforwards, document linkage, and stable detail mapping", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument();
    const { createTaxReport, getTaxReport, listTaxCarryforwards } =
      await import("../src/services/tax-reports.js");
    const { getDocumentMeta } = await import("../src/services/documents.js");

    const created = createTaxReport(
      baseTaxReportInput(company.companyId, document.documentId),
    );

    expect(created.duplicate).toBe(false);
    expect(created.taxReport).toEqual(
      expect.objectContaining({
        countryCode: "ES",
        taxKind: "vat",
        formCode: "303",
        taxableBase: "12000.00",
        taxDue: "2520.00",
        taxDeductible: "2700.00",
        resultAmount: "-180.00",
      }),
    );
    expect(created.facts).toEqual([
      expect.objectContaining({
        fieldCode: "71",
        normalizedValue: "-180.00",
      }),
    ]);
    expect(created.carryforwards).toEqual([
      expect.objectContaining({
        kind: "vat_credit",
        remainingAmount: "180.00",
      }),
    ]);
    expect(
      getTaxReport(created.taxReport.taxReportId).document.documentId,
    ).toBe(document.documentId);
    expect(getDocumentMeta(document.documentId)).toEqual(
      expect.objectContaining({
        linkedEntityType: "tax_report",
        linkedEntityId: created.taxReport.taxReportId,
      }),
    );
    expect(listTaxCarryforwards()).toHaveLength(1);
  });

  it("returns an existing report for duplicate fingerprints without inserting another report", async () => {
    const company = await createCompanyCard();
    const firstDocument = await uploadTaxDocument("first declaration");
    const secondDocument = await uploadTaxDocument("duplicate declaration");
    const { getDocumentMeta } = await import("../src/services/documents.js");
    const { createTaxReport, listTaxReports } =
      await import("../src/services/tax-reports.js");

    const first = createTaxReport(
      baseTaxReportInput(company.companyId, firstDocument.documentId),
    );
    const second = createTaxReport(
      baseTaxReportInput(company.companyId, secondDocument.documentId),
    );

    expect(second.duplicate).toBe(true);
    expect(second.taxReport.taxReportId).toBe(first.taxReport.taxReportId);
    expect(await listTaxReports()).toHaveLength(1);
    expect(getDocumentMeta(secondDocument.documentId)).toEqual(
      expect.objectContaining({
        linkedEntityType: "tax_report",
        linkedEntityId: first.taxReport.taxReportId,
      }),
    );
  });

  it("creates corrective reports and supersedes old active carryforwards", async () => {
    const company = await createCompanyCard();
    const firstDocument = await uploadTaxDocument("original declaration");
    const secondDocument = await uploadTaxDocument("corrective declaration");
    const { createTaxReport, getTaxReport, listTaxCarryforwards } =
      await import("../src/services/tax-reports.js");

    const original = createTaxReport(
      baseTaxReportInput(company.companyId, firstDocument.documentId),
    );
    const corrective = createTaxReport({
      ...baseTaxReportInput(company.companyId, secondDocument.documentId),
      authoritySubmissionId: "AEAT-303-Q1-CORRECTIVE",
      correctionOfTaxReportId: original.taxReport.taxReportId,
      resultAmount: "-90",
      carryforwards: [
        {
          kind: "vat_credit",
          currency: "EUR",
          originalAmount: "90",
          usedAmount: "0",
          remainingAmount: "90",
          expiresAt: null,
          status: "active",
          notes: "Corrected compensation balance",
        },
      ],
    });

    expect(corrective.taxReport.status).toBe("amended");
    expect(getTaxReport(original.taxReport.taxReportId).taxReport.status).toBe(
      "superseded",
    );
    expect(listTaxCarryforwards()).toEqual([
      expect.objectContaining({
        originTaxReportId: corrective.taxReport.taxReportId,
        remainingAmount: "90.00",
        status: "active",
      }),
    ]);
    expect(listTaxCarryforwards({ includeSuperseded: true })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originTaxReportId: original.taxReport.taxReportId,
          status: "superseded",
        }),
        expect.objectContaining({
          originTaxReportId: corrective.taxReport.taxReportId,
          status: "active",
        }),
      ]),
    );
  });

  it("lists reports with filters, query search, limit, and soft delete exclusion", async () => {
    const company = await createCompanyCard();
    const firstDocument = await uploadTaxDocument("q1 declaration");
    const secondDocument = await uploadTaxDocument("q2 declaration");
    const { createTaxReport, listTaxReports, softDeleteTaxReport } =
      await import("../src/services/tax-reports.js");

    const first = createTaxReport(
      baseTaxReportInput(company.companyId, firstDocument.documentId),
    );
    const second = createTaxReport({
      ...baseTaxReportInput(company.companyId, secondDocument.documentId),
      periodLabel: "2026-Q2",
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      authoritySubmissionId: "AEAT-303-Q2",
      paymentStatus: "unpaid",
      result: "payable",
      resultAmount: "120",
      facts: [
        {
          fieldCode: "71",
          fieldSystem: "casilla",
          label: "Payable result",
          valueType: "money",
          rawValue: "120,00",
          normalizedValue: "120",
          currency: "EUR",
          direction: "payable",
          confidence: "high",
        },
      ],
      carryforwards: [],
    });

    expect(
      await listTaxReports({
        countryCode: "ES",
        taxKind: "vat",
        formCode: "303",
        fiscalYear: 2026,
        paymentStatus: "unpaid",
      }),
    ).toEqual([
      expect.objectContaining({ taxReportId: second.taxReport.taxReportId }),
    ]);
    expect(await listTaxReports({ query: "Payable result" })).toEqual([
      expect.objectContaining({ taxReportId: second.taxReport.taxReportId }),
    ]);
    expect(await listTaxReports({ limit: 1 })).toEqual([
      expect.objectContaining({ taxReportId: second.taxReport.taxReportId }),
    ]);

    softDeleteTaxReport(second.taxReport.taxReportId);
    expect(await listTaxReports()).toEqual([
      expect.objectContaining({ taxReportId: first.taxReport.taxReportId }),
    ]);
  });
});
