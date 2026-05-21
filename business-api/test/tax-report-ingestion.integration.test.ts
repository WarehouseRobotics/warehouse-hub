import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { AppError } from "../src/lib/errors.js";
import { realAeatModelo303Text } from "./helpers/spain-fixtures.js";

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

function uploadFile(
  text: string,
  name = "modelo-303.pdf",
): Express.Multer.File {
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

function modelo130Text(reference = "AEAT130Q3CREDIT") {
  return `
AEAT Modelo 130
Ejercicio: 2026
Periodo: Q3
NIF: 12345678Z
Presentacion id: ${reference}
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
`;
}

function modelo200Text(reference = "202420067210082L") {
  return `
INFORMACIÓN DE LA PRESENTACIÓN DE LA DECLARACIÓN
Modelo 200
Presentación realizada el: 21-07-2025 a las 10:32:02
Expediente/Referencia (nº registro asignado): ${reference}
Número de justificante: 2005683250690
Ejercicio: 2024
NIF: B02672152
Casilla 00500: -4.688,48
Casilla 00501: -4.638,22
Casilla 00550: 218,51
Casilla 00547: 218,51
Detalle de la compensación de bases imponibles negativas
Compensación de base año 2022 00896 20.087,97 00897 218,51 00898 19.869,46
Compensación de base año 2023 00009 19.593,97 00010 00020 19.593,97
Total 00670 39.681,94 00547 218,51 00671 39.463,43
Resultado cero
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

  it("persists Modelo 303 AEAT-layout facts and VAT credit carryforwards", async () => {
    const company = await createCompanyCard();
    const { ingestTaxReport } =
      await import("../src/services/tax-report-ingestion.js");

    const ingested = await ingestTaxReport(
      uploadFile(realAeatModelo303Text, "modelo_303_T3_2025.pdf"),
      {
        kind: "tax_declaration",
        companyCardId: company.companyId,
        countryCode: "ES",
        source: "accountant_upload",
      },
    );

    expect(ingested.taxReport).toEqual(
      expect.objectContaining({
        countryCode: "ES",
        formCode: "303",
        fiscalYear: 2025,
        periodLabel: "2025-Q3",
        taxpayerTaxId: "B02672152",
        authorityReceiptNumber: "3036662516571",
        result: "compensate",
        resultAmount: "-169.41",
        paymentStatus: "not_required",
      }),
    );
    expect(ingested.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldCode: "71",
          fieldSystem: "casilla",
          normalizedValue: "-169.41",
        }),
        expect.objectContaining({
          fieldCode: "72",
          fieldSystem: "casilla",
          normalizedValue: "169.41",
        }),
        expect.objectContaining({
          fieldCode: "87",
          fieldSystem: "casilla",
          normalizedValue: "7648.17",
        }),
        expect.objectContaining({
          fieldCode: "110",
          fieldSystem: "casilla",
          normalizedValue: "7648.17",
        }),
      ]),
    );
    expect(ingested.carryforwards).toHaveLength(2);
    expect(ingested.carryforwards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "vat_credit",
          originalAmount: "7648.17",
          remainingAmount: "7648.17",
          status: "active",
          notes: expect.stringContaining("casilla 87"),
        }),
        expect.objectContaining({
          kind: "vat_credit",
          originalAmount: "169.41",
          remainingAmount: "169.41",
          status: "active",
          notes: expect.stringContaining("casilla 72"),
        }),
      ]),
    );
  });

  it("ingests a Spanish Modelo 130 into report facts and same-year installment credit", async () => {
    const company = await createCompanyCard();
    const { getDocumentMeta } = await import("../src/services/documents.js");
    const { ingestTaxReport } =
      await import("../src/services/tax-report-ingestion.js");

    const ingested = await ingestTaxReport(
      uploadFile(modelo130Text(), "modelo-130-q3.pdf"),
      {
        kind: "tax_declaration",
        companyCardId: company.companyId,
        countryCode: "ES",
        source: "accountant_upload",
      },
    );

    expect(ingested.duplicate).toBe(false);
    expect(ingested.taxReport).toEqual(
      expect.objectContaining({
        countryCode: "ES",
        taxKind: "personal_income",
        formCode: "130",
        formName: "Modelo 130",
        periodLabel: "2026-Q3",
        result: "compensate",
        paymentStatus: "not_required",
        resultAmount: "-75.00",
        retainedAmount: "100.00",
        profitOrLoss: "5000.00",
        extractedData: expect.objectContaining({
          casillas: expect.objectContaining({
            "03": "5000,00",
            "19": "-75,00",
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
          fieldCode: "01",
          normalizedValue: "20000.00",
        }),
        expect.objectContaining({
          fieldCode: "02",
          direction: "deductible",
          normalizedValue: "15000.00",
        }),
        expect.objectContaining({
          fieldCode: "19",
          direction: "credit",
          normalizedValue: "-75.00",
        }),
      ]),
    );
    expect(ingested.carryforwards).toEqual([
      expect.objectContaining({
        kind: "installment_credit",
        originalAmount: "75.00",
        remainingAmount: "75.00",
        expiresAt: "2026-12-31",
      }),
    ]);
    expect(getDocumentMeta(ingested.document.documentId).ocrText).toContain(
      "Modelo 130",
    );
  });

  it("ingests a Spanish Modelo 200 into corporate facts and tax-loss carryforwards", async () => {
    const company = await createCompanyCard();
    const { getDocumentMeta } = await import("../src/services/documents.js");
    const { ingestTaxReport } =
      await import("../src/services/tax-report-ingestion.js");

    const ingested = await ingestTaxReport(
      uploadFile(modelo200Text(), "modelo-200-2024.pdf"),
      {
        kind: "tax_declaration",
        companyCardId: company.companyId,
        countryCode: "ES",
        source: "accountant_upload",
      },
    );

    expect(ingested.duplicate).toBe(false);
    expect(ingested.taxReport).toEqual(
      expect.objectContaining({
        countryCode: "ES",
        taxKind: "corporate_income",
        formCode: "200",
        formName: "Modelo 200",
        fiscalYear: 2024,
        periodGranularity: "year",
        periodLabel: "2024",
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        taxpayerTaxId: "B02672152",
        authoritySubmissionId: "202420067210082L",
        authorityReceiptNumber: "2005683250690",
        result: "zero",
        paymentStatus: "not_required",
        taxableBase: "0.00",
        profitOrLoss: "0.00",
        extractedData: expect.objectContaining({
          casillas: expect.objectContaining({
            "00500": "-4.688,48",
            "00547": "218,51",
            "00550": "218,51",
          }),
          modelo200NegativeBaseDetail: [
            expect.objectContaining({
              originFiscalYear: 2022,
              pendingAtStartOrGenerated: "20087.97",
              appliedThisReturn: "218.51",
              pendingForFuture: "19869.46",
            }),
            expect.objectContaining({
              originFiscalYear: 2023,
              pendingAtStartOrGenerated: "19593.97",
              appliedThisReturn: "0.00",
              pendingForFuture: "19593.97",
            }),
          ],
          normalizedBy: "ES",
          appliedOverrides: [],
        }),
      }),
    );
    expect(ingested.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldCode: "00500",
          normalizedValue: "-4688.48",
        }),
        expect.objectContaining({
          fieldCode: "00547",
          direction: "credit",
          normalizedValue: "218.51",
        }),
        expect.objectContaining({
          fieldCode: "00550",
          normalizedValue: "218.51",
        }),
      ]),
    );
    expect(ingested.carryforwards).toEqual([
      expect.objectContaining({
        kind: "tax_loss",
        originalAmount: "20087.97",
        usedAmount: "218.51",
        remainingAmount: "19869.46",
        status: "active",
      }),
      expect.objectContaining({
        kind: "tax_loss",
        originalAmount: "19593.97",
        usedAmount: "0.00",
        remainingAmount: "19593.97",
        status: "active",
      }),
    ]);
    expect(getDocumentMeta(ingested.document.documentId).ocrText).toContain(
      "Modelo 200",
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
    expect(ingested.taxReport.warnings).toContain(
      "missing_authority_reference",
    );
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
