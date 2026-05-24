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

  it("creates, suggests, confirms, and hydrates tax payment links through HTTP", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument();
    const createResponse = await fetch(`${baseUrl}/api/v1/tax-reports`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...createRequestBody(company.companyId, document.documentId),
        result: "payable",
        paymentStatus: "unpaid",
        resultAmount: "120.00",
        authoritySubmissionId: "AEAT-303-Q1-PAYABLE",
        carryforwards: [],
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      taxReport: { taxReportId: string };
    };
    const { createBankAccount, upsertBankTransaction } =
      await import("../src/services/bank.js");
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const transaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-20",
      amount: "-120.00",
      currency: "EUR",
      description: "AEAT Modelo 303 2026-Q1",
      reference: "AEAT-303-Q1-PAYABLE",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    const suggestResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports/${created.taxReport.taxReportId}/payment-links/suggest`,
      {
        method: "POST",
        headers: { authorization: "Bearer test-api-key" },
      },
    );
    expect(suggestResponse.status).toBe(200);
    const suggested = (await suggestResponse.json()) as {
      matches: Array<{ taxReportPaymentLinkId: string; status: string }>;
    };
    expect(suggested.matches).toEqual([
      expect.objectContaining({ status: "suggested" }),
    ]);

    const listResponse = await fetch(
      `${baseUrl}/api/v1/tax-report-payment-links?taxReportId=${created.taxReport.taxReportId}&status=suggested`,
      { headers: { authorization: "Bearer test-api-key" } },
    );
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()) as unknown[]).toHaveLength(1);

    const patchResponse = await fetch(
      `${baseUrl}/api/v1/tax-report-payment-links/${suggested.matches[0]?.taxReportPaymentLinkId}`,
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer test-api-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "confirmed" }),
      },
    );
    expect(patchResponse.status).toBe(200);

    const getResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports/${created.taxReport.taxReportId}?include=paymentEvidence`,
      { headers: { authorization: "Bearer test-api-key" } },
    );
    expect(getResponse.status).toBe(200);
    expect(
      (await getResponse.json()) as {
        taxReport: { paymentStatus: string };
        paymentEvidence: { bankTransactions: Array<{ bankTransactionId: string }> };
      },
    ).toEqual(
      expect.objectContaining({
        taxReport: expect.objectContaining({ paymentStatus: "paid" }),
        paymentEvidence: expect.objectContaining({
          bankTransactions: [
            expect.objectContaining({
              bankTransactionId: transaction.bankTransactionId,
            }),
          ],
        }),
      }),
    );

    const { softDeleteBankTransaction } = await import("../src/services/bank.js");
    softDeleteBankTransaction(transaction.bankTransactionId);
    const deletedEvidenceResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports/${created.taxReport.taxReportId}?include=paymentEvidence`,
      { headers: { authorization: "Bearer test-api-key" } },
    );
    expect(deletedEvidenceResponse.status).toBe(200);
    expect(
      (await deletedEvidenceResponse.json()) as {
        paymentEvidence: { bankTransactions: Array<{ bankTransactionId: string }> };
      },
    ).toEqual(
      expect.objectContaining({
        paymentEvidence: expect.objectContaining({
          bankTransactions: [],
        }),
      }),
    );
  });

  it("uploads tax payment receipt evidence through HTTP", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument();
    const createResponse = await fetch(`${baseUrl}/api/v1/tax-reports`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...createRequestBody(company.companyId, document.documentId),
        result: "payable",
        paymentStatus: "unpaid",
        resultAmount: "50.00",
        authoritySubmissionId: "AEAT-303-Q1-RECEIPT-ONLY",
        carryforwards: [],
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      taxReport: { taxReportId: string };
    };

    const formData = new FormData();
    formData.set("kind", "tax_payment_receipt");
    formData.set("source", "authority_portal_download");
    formData.set(
      "link",
      JSON.stringify({
        amount: "50.00",
        currency: "EUR",
        paidAt: "2026-04-20",
        paymentReference: "AEAT-303-Q1-RECEIPT-ONLY",
        status: "confirmed",
        confidence: "high",
      }),
    );
    formData.set(
      "file",
      new File([Buffer.from("AEAT tax payment receipt")], "receipt.pdf", {
        type: "application/pdf",
      }),
    );

    const receiptResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports/${created.taxReport.taxReportId}/payment-receipts`,
      {
        method: "POST",
        headers: { authorization: "Bearer test-api-key" },
        body: formData,
      },
    );
    expect(receiptResponse.status).toBe(201);
    const receipt = (await receiptResponse.json()) as {
      document: { documentId: string; kind: string };
      paymentLink: { status: string };
      taxReport: { paymentStatus: string };
    };
    expect(receipt).toEqual(
      expect.objectContaining({
        document: expect.objectContaining({ kind: "tax_payment_receipt" }),
        paymentLink: expect.objectContaining({ status: "confirmed" }),
        taxReport: expect.objectContaining({ paymentStatus: "paid" }),
      }),
    );

    const getResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports/${created.taxReport.taxReportId}?include=paymentEvidence`,
      { headers: { authorization: "Bearer test-api-key" } },
    );
    expect(getResponse.status).toBe(200);
    expect(
      (await getResponse.json()) as {
        paymentEvidence: { documents: Array<{ documentId: string }> };
      },
    ).toEqual(
      expect.objectContaining({
        paymentEvidence: expect.objectContaining({
          documents: [
            expect.objectContaining({ documentId: receipt.document.documentId }),
          ],
        }),
      }),
    );

    const { softDeleteDocument } = await import("../src/services/documents.js");
    softDeleteDocument(receipt.document.documentId);
    const deletedEvidenceResponse = await fetch(
      `${baseUrl}/api/v1/tax-reports/${created.taxReport.taxReportId}?include=paymentEvidence`,
      { headers: { authorization: "Bearer test-api-key" } },
    );
    expect(deletedEvidenceResponse.status).toBe(200);
    expect(
      (await deletedEvidenceResponse.json()) as {
        paymentEvidence: { documents: Array<{ documentId: string }> };
      },
    ).toEqual(
      expect.objectContaining({
        paymentEvidence: expect.objectContaining({
          documents: [],
        }),
      }),
    );
  });

  it("ingests tax reports through the multipart HTTP API", async () => {
    const company = await createCompanyCard();
    const formData = new FormData();
    formData.set("kind", "tax_declaration");
    formData.set("companyCardId", company.companyId);
    formData.set("countryCode", "ES");
    formData.set("source", "accountant_upload");
    formData.set(
      "file",
      new File(
        [
          Buffer.from(`
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q4
NIF: B12345678
Presentacion id: AEAT303Q4
Casilla 71: 250,00
`),
        ],
        "modelo-303-q4.pdf",
        { type: "application/pdf" },
      ),
    );

    const response = await fetch(`${baseUrl}/api/v1/tax-reports/ingest`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
      },
      body: formData,
    });

    expect(response.status).toBe(201);
    expect(
      (await response.json()) as {
        taxReport: { formCode: string; result: string };
        document: { ocrStatus: string; linkedEntityType: string };
        facts: Array<{ fieldCode: string }>;
      },
    ).toEqual(
      expect.objectContaining({
        taxReport: expect.objectContaining({
          formCode: "303",
          result: "payable",
        }),
        document: expect.objectContaining({
          ocrStatus: "completed",
          linkedEntityType: "tax_report",
        }),
        facts: [expect.objectContaining({ fieldCode: "71" })],
      }),
    );
  });

  it("rejects tax report ingest requests without a file", async () => {
    const formData = new FormData();
    formData.set("kind", "tax_declaration");
    const response = await fetch(`${baseUrl}/api/v1/tax-reports/ingest`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
      },
      body: formData,
    });

    expect(response.status).toBe(400);
  });

  it("rejects tax report ingest requests without company scope", async () => {
    const formData = new FormData();
    formData.set("kind", "tax_declaration");
    formData.set("countryCode", "ES");
    formData.set(
      "file",
      new File([Buffer.from("AEAT Modelo 303")], "modelo-303.pdf", {
        type: "application/pdf",
      }),
    );

    const response = await fetch(`${baseUrl}/api/v1/tax-reports/ingest`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
      },
      body: formData,
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: { code: string } }).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "validation_error" }),
      }),
    );
  });

  it("rejects malformed tax report ingest overrides as validation errors", async () => {
    const company = await createCompanyCard();
    const formData = new FormData();
    formData.set("kind", "tax_declaration");
    formData.set("companyCardId", company.companyId);
    formData.set("overrides", "{not-json");
    formData.set(
      "file",
      new File([Buffer.from("AEAT Modelo 303")], "modelo-303.pdf", {
        type: "application/pdf",
      }),
    );

    const response = await fetch(`${baseUrl}/api/v1/tax-reports/ingest`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
      },
      body: formData,
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: { code: string } }).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "validation_error" }),
      }),
    );
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
