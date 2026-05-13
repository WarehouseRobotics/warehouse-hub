import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { AppError } from "../src/lib/errors.js";

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

function uploadFile(text: string, name = "modelo-303.pdf"): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: name,
    encoding: "7bit",
    mimetype: "application/pdf",
    size: text.length,
    buffer: Buffer.from(text),
    stream: undefined as never,
    destination: "",
    filename: "",
    path: "",
  };
}

function modelo303Text(reference = "AEAT303Q1") {
  return `
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q1
NIF: B12345678
Presentacion id: ${reference}
Casilla 07: 12000,00
Casilla 28: 2520,00
Casilla 45: 680,00
Casilla 71: -180,00
Casilla 87: 180,00
`;
}

describe("tax report ingestion service", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  it("ingests a Spanish Modelo 303 into document OCR, report, facts, and carryforwards", async () => {
    const company = await createCompanyCard();
    const { getDocumentMeta } = await import("../src/services/documents.js");
    const { ingestTaxReport } =
      await import("../src/services/tax-report-ingestion.js");

    const ingested = await ingestTaxReport(uploadFile(modelo303Text()), {
      kind: "tax_declaration",
      companyCardId: company.companyId,
      countryCode: "ES",
      source: "accountant_upload",
    });

    expect(ingested.duplicate).toBe(false);
    expect(ingested.taxReport).toEqual(
      expect.objectContaining({
        countryCode: "ES",
        formCode: "303",
        result: "compensate",
        paymentStatus: "not_required",
        resultAmount: "-180.00",
        extractedData: expect.objectContaining({
          casillas: expect.objectContaining({
            "07": "12000,00",
            "71": "-180,00",
          }),
          normalizedBy: "ES",
          appliedOverrides: [],
        }),
      }),
    );
    expect(ingested.document).toEqual(
      expect.objectContaining({
        kind: "tax_declaration",
        ocrStatus: "completed",
        linkedEntityType: "tax_report",
        linkedEntityId: ingested.taxReport.taxReportId,
      }),
    );
    expect(ingested.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldCode: "71",
          normalizedValue: "-180.00",
        }),
      ]),
    );
    expect(ingested.carryforwards).toEqual([
      expect.objectContaining({
        kind: "vat_credit",
        remainingAmount: "180.00",
      }),
    ]);
    expect(getDocumentMeta(ingested.document.documentId).ocrText).toContain(
      "Modelo 303",
    );
  });

  it("returns the existing report for duplicate fingerprints and links the new document", async () => {
    const company = await createCompanyCard();
    const { getDocumentMeta } = await import("../src/services/documents.js");
    const { ingestTaxReport } =
      await import("../src/services/tax-report-ingestion.js");
    const { listTaxReports } = await import("../src/services/tax-reports.js");

    const first = await ingestTaxReport(uploadFile(modelo303Text()), {
      kind: "tax_declaration",
      companyCardId: company.companyId,
      countryCode: "ES",
    });
    const second = await ingestTaxReport(
      uploadFile(modelo303Text(), "modelo-303-copy.pdf"),
      {
        kind: "tax_declaration",
        companyCardId: company.companyId,
        countryCode: "ES",
      },
    );

    expect(second.duplicate).toBe(true);
    expect(second.taxReport.taxReportId).toBe(first.taxReport.taxReportId);
    expect(second.warnings).toContain("duplicate_tax_report_fingerprint");
    expect(await listTaxReports()).toHaveLength(1);
    expect(getDocumentMeta(second.document.documentId)).toEqual(
      expect.objectContaining({
        linkedEntityType: "tax_report",
        linkedEntityId: first.taxReport.taxReportId,
      }),
    );
  });

  it("stores needs-review reports when authority references are missing", async () => {
    const company = await createCompanyCard();
    const { ingestTaxReport } =
      await import("../src/services/tax-report-ingestion.js");

    const ingested = await ingestTaxReport(
      uploadFile(`
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q3
NIF: B12345678
Casilla 71: 0,00
`),
      {
        kind: "tax_declaration",
        companyCardId: company.companyId,
        countryCode: "ES",
      },
    );

    expect(ingested.taxReport.status).toBe("needs_review");
    expect(ingested.taxReport.confidence).toBe("medium");
    expect(ingested.taxReport.warnings).toContain("missing_authority_reference");
  });

  it("marks the document failed and creates no report when parsing fails", async () => {
    const company = await createCompanyCard();
    const { getDocumentMeta } = await import("../src/services/documents.js");
    const { ingestTaxReport } =
      await import("../src/services/tax-report-ingestion.js");
    const { listTaxReports } = await import("../src/services/tax-reports.js");

    let documentId = "";
    try {
      await ingestTaxReport(uploadFile("VAT return from another country"), {
        kind: "tax_declaration",
        companyCardId: company.companyId,
        countryCode: "FR",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      documentId = (error as AppError).details
        ? ((error as AppError).details as { documentId: string }).documentId
        : "";
    }

    expect(documentId).toMatch(/^doc_/);
    expect(getDocumentMeta(documentId)).toEqual(
      expect.objectContaining({
        ocrStatus: "failed",
        linkedEntityType: null,
      }),
    );
    expect(await listTaxReports()).toEqual([]);
  });

  it("rejects correction targets that do not match the declaration scope", async () => {
    const company = await createCompanyCard();
    const { ingestTaxReport } =
      await import("../src/services/tax-report-ingestion.js");
    const { getTaxReport, listTaxReports } =
      await import("../src/services/tax-reports.js");

    const original = await ingestTaxReport(uploadFile(modelo303Text()), {
      kind: "tax_declaration",
      companyCardId: company.companyId,
      countryCode: "ES",
    });

    await expect(
      ingestTaxReport(uploadFile(modelo303Text("AEAT303Q2")), {
        kind: "tax_declaration",
        companyCardId: company.companyId,
        countryCode: "ES",
        periodLabel: "2026-Q2",
        overrides: {
          correctionOfTaxReportId: original.taxReport.taxReportId,
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_tax_report_correction",
    });

    expect(getTaxReport(original.taxReport.taxReportId).taxReport.status).toBe(
      original.taxReport.status,
    );
    expect(await listTaxReports()).toHaveLength(1);
  });
});
