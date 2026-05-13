import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

async function uploadTaxDocument() {
  const { uploadDocument } = await import("../src/services/documents.js");
  return uploadDocument(
    {
      fieldname: "file",
      originalname: "modelo-303.pdf",
      encoding: "7bit",
      mimetype: "application/pdf",
      size: 10,
      buffer: Buffer.from("modelo 303"),
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

function createRequestBody(companyCardId: string, documentId: string) {
  return {
    companyCardId,
    documentId,
    countryCode: "ES",
    taxKind: "vat",
    formCode: "303",
    formName: "Modelo 303",
    fiscalYear: 2026,
    periodGranularity: "quarter",
    periodLabel: "2026-Q1",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxpayerTaxId: "B12345678",
    authoritySubmissionId: "AEAT-303-Q1",
    filedAt: "2026-04-15T10:30:00.000Z",
    result: "compensate",
    paymentStatus: "not_required",
    currency: "EUR",
    resultAmount: "-180.00",
    facts: [
      {
        fieldCode: "71",
        fieldSystem: "casilla",
        label: "Resultado",
        valueType: "money",
        rawValue: "-180,00",
        normalizedValue: "-180.00",
        currency: "EUR",
        direction: "credit",
      },
    ],
    carryforwards: [
      {
        kind: "vat_credit",
        currency: "EUR",
        originalAmount: "180.00",
        usedAmount: "0.00",
        remainingAmount: "180.00",
        notes: "Modelo 303 compensation balance",
      },
    ],
  };
}

describe("tax report HTTP routes", () => {
  let server: Server | undefined;
  let baseUrl = "";

  beforeEach(async () => {
    await resetTestState();

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });

    const address = server!.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error: Error | undefined) =>
          error ? reject(error) : resolve(),
        );
      });
    }
    server = undefined;
  });

  it("creates, lists, and gets tax reports through the HTTP API", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument();

    const createResponse = await fetch(`${baseUrl}/api/v1/tax-reports`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify(
        createRequestBody(company.companyId, document.documentId),
      ),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      taxReport: { taxReportId: string; slug: string; formCode: string };
      facts: Array<{ fieldCode: string }>;
    };
    expect(created.taxReport.formCode).toBe("303");
    expect(created.facts).toHaveLength(1);

    const listResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports?countryCode=ES&taxKind=vat&formCode=303&fiscalYear=2026&paymentStatus=not_required&query=Resultado`,
      {
        headers: {
          authorization: "Bearer test-api-key",
        },
      },
    );
    expect(listResponse.status).toBe(200);
    expect(
      (await listResponse.json()) as Array<{ taxReportId: string }>,
    ).toEqual([
      expect.objectContaining({ taxReportId: created.taxReport.taxReportId }),
    ]);

    const getResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports/${created.taxReport.slug}`,
      {
        headers: {
          authorization: "Bearer test-api-key",
        },
      },
    );
    expect(getResponse.status).toBe(200);
    expect(
      (await getResponse.json()) as {
        taxReport: { taxReportId: string };
        carryforwards: unknown[];
      },
    ).toEqual(
      expect.objectContaining({
        taxReport: expect.objectContaining({
          taxReportId: created.taxReport.taxReportId,
        }),
        carryforwards: [expect.objectContaining({ kind: "vat_credit" })],
      }),
    );

    const deleteResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports/${created.taxReport.taxReportId}`,
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer test-api-key",
        },
      },
    );
    expect(deleteResponse.status).toBe(204);

    const deletedListResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports?countryCode=ES&fiscalYear=2026`,
      {
        headers: {
          authorization: "Bearer test-api-key",
        },
      },
    );
    expect(deletedListResponse.status).toBe(200);
    expect((await deletedListResponse.json()) as unknown[]).toEqual([]);
  });

  it("lists carryforwards with active default and superseded opt-in", async () => {
    const company = await createCompanyCard();
    const firstDocument = await uploadTaxDocument();
    const secondDocument = await uploadTaxDocument();
    const { createTaxReport } = await import("../src/services/tax-reports.js");
    const { taxReportCreateRequestSchema } =
      await import("@warehouse-hub/business-schemas");

    const original = createTaxReport(
      taxReportCreateRequestSchema.parse(
        createRequestBody(company.companyId, firstDocument.documentId),
      ),
    );
    createTaxReport(
      taxReportCreateRequestSchema.parse({
        ...createRequestBody(company.companyId, secondDocument.documentId),
        authoritySubmissionId: "AEAT-303-Q1-CORRECTIVE",
        correctionOfTaxReportId: original.taxReport.taxReportId,
        resultAmount: "-90.00",
        carryforwards: [
          {
            kind: "vat_credit",
            currency: "EUR",
            originalAmount: "90.00",
            usedAmount: "0.00",
            remainingAmount: "90.00",
            notes: "Corrected balance",
          },
        ],
      }),
    );

    const activeResponse = await fetch(
      `${baseUrl}/api/v1/tax-carryforwards?countryCode=ES&kind=vat_credit`,
      {
        headers: {
          authorization: "Bearer test-api-key",
        },
      },
    );
    expect(activeResponse.status).toBe(200);
    expect(
      (await activeResponse.json()) as Array<{
        status: string;
        remainingAmount: string;
      }>,
    ).toEqual([
      expect.objectContaining({ status: "active", remainingAmount: "90.00" }),
    ]);

    const allResponse = await fetch(
      `${baseUrl}/api/v1/tax-carryforwards?includeSuperseded=true`,
      {
        headers: {
          authorization: "Bearer test-api-key",
        },
      },
    );
    expect(allResponse.status).toBe(200);
    expect((await allResponse.json()) as Array<{ status: string }>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "active" }),
        expect.objectContaining({ status: "superseded" }),
      ]),
    );
  });

  it("rejects zero-valued year filters", async () => {
    const reportResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports?fiscalYear=0`,
      {
        headers: {
          authorization: "Bearer test-api-key",
        },
      },
    );
    expect(reportResponse.status).toBe(400);

    const carryforwardResponse = await fetch(
      `${baseUrl}/api/v1/tax-carryforwards?originFiscalYear=0`,
      {
        headers: {
          authorization: "Bearer test-api-key",
        },
      },
    );
    expect(carryforwardResponse.status).toBe(400);
  });
});
