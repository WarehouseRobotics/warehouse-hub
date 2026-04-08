import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/lib/logger.js";

const testDataDir = path.resolve(process.cwd(), "test-data");
const llmConfigPath = path.join(testDataDir, "llms.mock.yaml");

async function resetTestState() {
  const { resetDatabase, initializeDatabase } = await import("../src/db/connection.js");
  resetDatabase();
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(path.join(testDataDir, "business-api.sqlite"), { force: true });
  fs.rmSync(path.join(testDataDir, "uploads"), { recursive: true, force: true });
  fs.rmSync(path.join(testDataDir, "llms.mock.yaml"), { force: true });
  initializeDatabase();
}

async function waitFor<T>(callback: () => Promise<T>, predicate: (value: T) => boolean, attempts = 20): Promise<T> {
  let lastValue = await callback();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    lastValue = await callback();
  }

  return lastValue;
}

describe("business-api service flows", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.LLMS_CONFIG_PATH = "./test-data/llms.mock.yaml";
    process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "true";
    const { resetEmbeddingProviderConfigCache } = await import("../src/lib/llm-config.js");
    resetEmbeddingProviderConfigCache();
  });

  it("creates the company card and default tasks project", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { listProjects } = await import("../src/services/projects.js");

    const company = upsertCompanyCard({
      legalName: "Northwind Robotics SL",
      displayName: "Northwind Robotics",
      taxId: "B12345678",
      email: "billing@northwind.example",
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

    expect(company.companyId).toMatch(/^comp_/);
    expect(listProjects()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerEntityId: company.companyId,
          name: "Tasks",
        }),
      ]),
    );
  });

  it("resolves an existing contact and auto-creates a missing one", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact, resolveContact, getContact } = await import("../src/services/contacts.js");

    upsertCompanyCard({
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

    const existing = createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
      legalName: "Papeleria Centro SL",
      taxId: "B87654321",
      email: "facturas@papeleriacentro.example",
    });

    expect(
      resolveContact({
        autoCreate: true,
        matchBy: ["taxId", "email", "legalName"],
        contact: {
          type: "company",
          status: "active",
          roles: ["supplier"],
          displayName: "Papeleria Centro SL",
          legalName: "Papeleria Centro SL",
          taxId: "B87654321",
          email: "facturas@papeleriacentro.example",
        },
      }),
    ).toEqual({
      contactId: existing.contactId,
      resolution: "matched",
        matchedBy: "taxId",
      });

    expect(
      resolveContact({
        autoCreate: true,
        matchBy: ["canonicalName"],
        contact: {
          type: "company",
          status: "active",
          roles: ["supplier"],
          displayName: "Papeleria Centro",
          legalName: "Papeleria Centro",
        },
      }),
    ).toEqual({
      contactId: existing.contactId,
      resolution: "matched",
      matchedBy: "canonicalName",
    });

    const created = resolveContact({
      autoCreate: true,
      matchBy: ["taxId", "email", "canonicalName", "legalName"],
      contact: {
        type: "company",
        status: "active",
        roles: ["customer"],
        displayName: "Acme Retail GmbH",
        legalName: "Acme Retail GmbH",
        taxId: "DE123456789",
        email: "ap@acme-retail.example",
      },
    });

    expect(created.resolution).toBe("created");
    expect(getContact(created.contactId)).toEqual(
      expect.objectContaining({
        displayName: "Acme Retail GmbH",
      }),
    );
  });

  it("fails contact resolution when canonicalized company names are ambiguous", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact, resolveContact } = await import("../src/services/contacts.js");

    upsertCompanyCard({
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

    createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
    });
    createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail SL",
      legalName: "Acme Retail SL",
    });

    expect(() =>
      resolveContact({
        autoCreate: true,
        matchBy: ["canonicalName"],
        contact: {
          type: "company",
          status: "active",
          roles: ["customer"],
          displayName: "Acme Retail",
          legalName: "Acme Retail",
        },
      }),
    ).toThrowError(/Contact resolution is ambiguous/);
  });

  it("uploads documents and records expenses with transitions", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { uploadDocument, getDocumentDownload } = await import("../src/services/documents.js");
    const { createExpense, updateExpense, listExpenses } = await import("../src/services/expenses.js");

    upsertCompanyCard({
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

    const supplier = createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
      legalName: "Papeleria Centro SL",
      taxId: "B87654321",
      email: "facturas@papeleriacentro.example",
    });

    const document = uploadDocument(
      {
        fieldname: "file",
        originalname: "invoice-2026-0042.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 9,
        buffer: Buffer.from("pdf-data-1"),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "expense_invoice",
        source: "email_forward",
      },
    );

    const expense = createExpense({
      supplierContactId: supplier.contactId,
      documentId: document.documentId,
      invoiceNumber: "FC-2026-0042",
      invoiceDate: "2026-03-25",
      dueDate: "2026-04-24",
      currency: "EUR",
      totals: {
        net: "120",
        tax: "25.2",
        gross: "145.2",
      },
      taxLines: [
        {
          name: "IVA",
          rate: "21",
          base: "120",
          amount: "25.2",
        },
      ],
      category: "office_supplies",
      notes: "Printer paper and toner.",
      status: "recorded",
    });

    expect(expense.totals).toEqual({
      net: "120.00",
      tax: "25.20",
      gross: "145.20",
    });
    expect(fs.existsSync(getDocumentDownload(document.documentId).path)).toBe(true);

    const paid = updateExpense(expense.expenseId, {
      status: "paid",
    });

    expect(paid.status).toBe("paid");
    expect(await listExpenses({ status: "paid" })).toHaveLength(1);
  });

  it("filters documents, expenses, and sales invoices by time range and similarity", async () => {
    const { resetEmbeddingProviderConfigCache } = await import("../src/lib/llm-config.js");
    process.env.LLMS_CONFIG_PATH = "./test-data/llms.mock.yaml";
    process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "false";
    fs.writeFileSync(
      llmConfigPath,
      [
        "llms:",
        "  embedding:",
        "    style: openai-compatible",
        "    endpoint: http://mocked-embeddings.local/v1",
        "    model_name: mocked-embedding-model",
        "    apiKey: mocked-key",
        "    default_dims: 768",
        "",
      ].join("\n"),
    );
    resetEmbeddingProviderConfigCache();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { input: string[] };
        const vectorForAxis = (axis: 0 | 1 | 2): number[] => {
          const vector = new Array<number>(768).fill(0);
          vector[axis] = 1;
          return vector;
        };
        const vectors = body.input.map((value) => {
          const normalized = value.toLowerCase();
          if (normalized.includes("toner") || normalized.includes("fc-toner-001")) {
            return vectorForAxis(0);
          }
          if (normalized.includes("consulting") || normalized.includes("svc-2026-001")) {
            return vectorForAxis(1);
          }
          return vectorForAxis(2);
        });

        return new Response(
          JSON.stringify({
            data: vectors.map((embedding, index) => ({ index, embedding })),
            model: "mocked-embedding-model",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { uploadDocument, listDocuments, updateDocumentProcessing } = await import("../src/services/documents.js");
    const { createExpense, listExpenses, updateExpense } = await import("../src/services/expenses.js");
    const { importSalesInvoice, listSalesInvoices } = await import("../src/services/sales-invoices.js");

    upsertCompanyCard({
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

    const supplier = createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
      legalName: "Papeleria Centro SL",
      taxId: "B87654321",
      email: "facturas@papeleriacentro.example",
    });

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
      taxId: "DE123456789",
      email: "ap@acme-retail.example",
    });

    const tonerDocument = uploadDocument(
      {
        fieldname: "file",
        originalname: "toner-invoice.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 8,
        buffer: Buffer.from("pdf-a"),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      { kind: "expense_invoice", source: "email_forward" },
    );
    updateDocumentProcessing(tonerDocument.documentId, {
      ocrStatus: "completed",
      ocrText: "toner shipment fc-toner-001",
    });

    const consultingDocument = uploadDocument(
      {
        fieldname: "file",
        originalname: "consulting-invoice.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 8,
        buffer: Buffer.from("pdf-b"),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      { kind: "sales_invoice", source: "manual_upload" },
    );
    updateDocumentProcessing(consultingDocument.documentId, {
      ocrStatus: "completed",
      ocrText: "consulting statement svc-2026-001",
    });

    const tonerExpense = createExpense({
      supplierContactId: supplier.contactId,
      documentId: tonerDocument.documentId,
      invoiceNumber: "FC-TONER-001",
      invoiceDate: "2026-04-05",
      currency: "EUR",
      totals: {
        net: "120.00",
        tax: "25.20",
        gross: "145.20",
      },
      category: "office_supplies",
      notes: "toner cartridge shipment",
      status: "recorded",
    });

    const undatedExpense = createExpense({
      supplierContactId: supplier.contactId,
      invoiceNumber: "FC-NODATE-002",
      currency: "EUR",
      totals: {
        net: "20.00",
        tax: "4.20",
        gross: "24.20",
      },
      category: "office_supplies",
      notes: "fallback created-at expense",
      status: "recorded",
    });

    updateExpense(tonerExpense.expenseId, {
      notes: "toner cartridge shipment updated",
    });

    importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "SVC-2026-001",
      issueDate: "2026-04-06",
      serviceDate: "2026-04-04",
      currency: "EUR",
      lineItems: [{ description: "Consulting sprint", quantity: "1", unitPrice: "1000.00" }],
      totals: {
        net: "1000.00",
        tax: "210.00",
        gross: "1210.00",
      },
      status: "finalized",
      pdfDocumentId: consultingDocument.documentId,
    });

    const documentMatches = await waitFor(
      () => listDocuments({ after: "2000-01-01", before: "2100-01-01" }),
      (items) => items.some((item) => item.documentId === tonerDocument.documentId),
    );
    expect(documentMatches.map((item) => item.documentId)).toContain(tonerDocument.documentId);

    const expenseMatches = await listExpenses({
      similar: "toner",
      limit: 1,
      status: "recorded",
      after: "2026-04-01",
      before: "2026-04-06",
    });
    expect(expenseMatches.map((item) => item.expenseId)).toEqual([tonerExpense.expenseId]);

    const createdAtFallbackMatches = await listExpenses({
      after: "2000-01-01",
      before: "2100-01-01",
      similar: "fallback",
      limit: 5,
    });
    expect(createdAtFallbackMatches.some((item) => item.expenseId === undatedExpense.expenseId)).toBe(true);

    const invoiceMatches = await listSalesInvoices({
      similar: "consulting",
      limit: 1,
      status: "finalized",
      after: "2026-04-01",
      before: "2026-04-07",
    });
    expect(invoiceMatches.map((item) => item.invoiceNumber)).toEqual(["SVC-2026-001"]);
  });

  it("ingests an expense invoice image with overrides and searchable OCR content", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact, listContacts } = await import("../src/services/contacts.js");
    const { ingestDocument } = await import("../src/services/document-ingestion.js");
    const { findSimilar } = await import("../src/lib/embeddings.js");

    upsertCompanyCard({
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

    createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
      legalName: "Papeleria Centro SL",
      taxId: "B87654321",
      email: "facturas@papeleriacentro.example",
    });

    const result = await ingestDocument(
      {
        fieldname: "file",
        originalname: "invoice.png",
        encoding: "7bit",
        mimetype: "image/png",
        size: 400,
        buffer: Buffer.from(
          [
            "supplier: Papeleria Centro SL",
            "supplier tax id: B87654321",
            "supplier email: facturas@papeleriacentro.example",
            "invoice number: FC-2026-0042",
            "invoice date: 2026-03-25",
            "due date: 2026-04-24",
            "currency: EUR",
            "net: 120.00",
            "tax: 25.20",
            "gross: 145.20",
            "category: office_supplies",
            "notes: Printer paper and toner.",
            "tax line: name=IVA; rate=21; base=120.00; amount=25.20",
          ].join("\n"),
        ),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "expense_invoice",
        overrides: {
          invoiceDate: "2026-03-26",
        },
      },
    );

    expect(result.document.ocrStatus).toBe("completed");
    expect(result.document.ocrEngine).toBe("structured-stub-ocr");
    expect(result.appliedOverrides).toContain("invoiceDate");
    expect(result.linkedEntity?.type).toBe("expense");
    expect(result.extracted.structuredData?.schemaVersion).toBe("invoice.v1");
    expect(result.linkedEntity?.data).toEqual(
      expect.objectContaining({
        invoiceDate: "2026-03-26",
        supplierContactId: expect.stringMatching(/^ct_/),
      }),
    );

    const similarDocuments = await waitFor(
      () => findSimilar("document", "toner invoice papeleria", 3),
      (items) => items.some((item) => item.entityId === result.document.documentId),
    );
    expect(similarDocuments.some((match) => match.entityId === result.document.documentId)).toBe(true);
    expect(listContacts({ role: "supplier" })).toHaveLength(1);
  });

  it("ingests sales invoice PDFs, creates contacts, and attaches to an existing invoice on re-import", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { ingestDocument } = await import("../src/services/document-ingestion.js");

    upsertCompanyCard({
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

    const first = await ingestDocument(
      {
        fieldname: "file",
        originalname: "sales.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 300,
        buffer: Buffer.from(
          [
            "customer: Acme Retail GmbH",
            "customer tax id: DE123456789",
            "customer email: ap@acme-retail.example",
            "invoice number: 2026-0041",
            "issue date: 2026-04-02",
            "service date: 2026-04-01",
            "currency: EUR",
            "payment terms days: 21",
            "net: 1000.00",
            "tax: 210.00",
            "gross: 1210.00",
          ].join("\n"),
        ),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "sales_invoice",
      },
    );

    expect(first.linkedEntity?.type).toBe("sales_invoice");
    const createdInvoice = first.linkedEntity?.type === "sales_invoice" ? first.linkedEntity.data : null;
    expect(createdInvoice?.invoiceNumber).toBe("2026-0041");

    const second = await ingestDocument(
      {
        fieldname: "file",
        originalname: "sales-updated.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 320,
        buffer: Buffer.from(
          [
            "customer: Acme Retail GmbH",
            "invoice number: 2026-0041",
            "issue date: 2026-04-02",
            "currency: EUR",
            "net: 1000.00",
            "tax: 210.00",
            "gross: 1210.00",
          ].join("\n"),
        ),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "sales_invoice",
        targetSalesInvoiceId: createdInvoice?.salesInvoiceId,
        overrides: {
          status: "finalized",
          lineItems: [{ description: "Warehouse audit", quantity: "1", unitPrice: "1000.00" }],
        },
      },
    );

    expect(second.linkedEntity?.type).toBe("sales_invoice");
    if (second.linkedEntity?.type !== "sales_invoice" || !createdInvoice) {
      throw new Error("Expected a linked sales invoice");
    }
    expect(second.linkedEntity.data.salesInvoiceId).toBe(createdInvoice.salesInvoiceId);
    expect(second.linkedEntity.data.status).toBe("finalized");
    expect(second.linkedEntity.data.pdfDocumentId).toBe(second.document.documentId);
  });

  it("fails ambiguous invoice contact matching instead of auto-creating a duplicate", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact, listContacts } = await import("../src/services/contacts.js");
    const { ingestDocument } = await import("../src/services/document-ingestion.js");
    const { getDocumentMeta } = await import("../src/services/documents.js");

    upsertCompanyCard({
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

    createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Acme Supplies GmbH",
      legalName: "Acme Supplies GmbH",
    });
    createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Acme Supplies SL",
      legalName: "Acme Supplies SL",
    });

    let failedDocumentId = "";
    try {
      await ingestDocument(
        {
          fieldname: "file",
          originalname: "ambiguous.png",
          encoding: "7bit",
          mimetype: "image/png",
          size: 200,
          buffer: Buffer.from(
            [
              "supplier: Acme Supplies",
              "invoice number: FC-2026-0043",
              "invoice date: 2026-03-25",
              "currency: EUR",
              "net: 10.00",
              "tax: 2.10",
              "gross: 12.10",
            ].join("\n"),
          ),
          stream: undefined as never,
          destination: "",
          filename: "",
          path: "",
        },
        {
          kind: "expense_invoice",
        },
      );
      throw new Error("Expected ambiguous contact resolution");
    } catch (error) {
      expect(error).toMatchObject({
        code: "contact_resolution_ambiguous",
      });
      failedDocumentId = (error as { details?: { documentId?: string } }).details?.documentId ?? "";
    }

    expect(listContacts({ role: "supplier" })).toHaveLength(2);
    expect(getDocumentMeta(failedDocumentId).ocrStatus).toBe("failed");
  });

  it("ingests contracts and keeps failed OCR documents without linked entities", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { ingestDocument } = await import("../src/services/document-ingestion.js");
    const { getDocumentMeta } = await import("../src/services/documents.js");

    upsertCompanyCard({
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

    const contract = await ingestDocument(
      {
        fieldname: "file",
        originalname: "contract.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 250,
        buffer: Buffer.from(
          [
            "contract title: Master Services Agreement",
            "effective date: 2026-04-03",
            "counterparty: Acme Retail GmbH",
            "counterparty email: legal@acme-retail.example",
          ].join("\n"),
        ),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "contract",
      },
    );

    expect(contract.document.linkedEntityType).toBe("contact");
    expect(contract.extracted.title).toBe("Master Services Agreement");

    let failedDocumentId = "";
    try {
      await ingestDocument(
        {
          fieldname: "file",
          originalname: "broken.pdf",
          encoding: "7bit",
          mimetype: "application/pdf",
          size: 40,
          buffer: Buffer.from("OCR_ERROR: broken sample"),
          stream: undefined as never,
          destination: "",
          filename: "",
          path: "",
        },
        {
          kind: "contract",
        },
      );
      throw new Error("Expected OCR failure");
    } catch (error) {
      expect(error).toMatchObject({
        code: "ocr_failed",
      });
      failedDocumentId = (error as { details?: { documentId?: string } }).details?.documentId ?? "";
    }

    const failedDocument = getDocumentMeta(failedDocumentId);
    expect(failedDocument.ocrStatus).toBe("failed");
    expect(failedDocument.linkedEntityId).toBeNull();
  });

  it("computes deal totals, generates invoice numbers, and manages task hierarchies", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { createDeal } = await import("../src/services/deals.js");
    const { generateSalesInvoice, updateSalesInvoice } = await import("../src/services/sales-invoices.js");
    const { createProject } = await import("../src/services/projects.js");
    const { createTask, getTask } = await import("../src/services/tasks.js");
    const { findSimilar } = await import("../src/lib/embeddings.js");

    const company = upsertCompanyCard({
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

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
      taxId: "DE123456789",
      email: "ap@acme-retail.example",
    });

    const deal = createDeal({
      customerContactId: customer.contactId,
      title: "Warehouse audit and automation proposal",
      stage: "won",
      currency: "EUR",
      expectedCloseDate: "2026-04-02",
      lineItems: [
        {
          description: "Warehouse operations audit",
          quantity: "1",
          unitPrice: "900.00",
          taxRate: "21.00",
        },
        {
          description: "Automation recommendations workshop",
          quantity: 1,
          unitPrice: "600.00",
          taxRate: "21.00",
        },
      ],
      notes: "Approved by procurement.",
    });

    expect(deal.totals).toEqual({
      net: "1500.00",
      tax: "315.00",
      gross: "1815.00",
    });

    const invoice = generateSalesInvoice({
      customerContactId: customer.contactId,
      dealId: deal.dealId,
      issueDate: "2026-04-02",
      serviceDate: "2026-03-31",
      paymentTermsDays: 30,
      invoiceNumberStrategy: "next",
    });

    expect(invoice.invoiceNumber).toBe("2026-0001");
    expect(invoice.totals.gross).toBe("1815.00");
    expect(invoice.customerDisplayName).toBe("Acme Retail GmbH");
    expect(updateSalesInvoice(invoice.salesInvoiceId, { status: "finalized" }).status).toBe("finalized");

    await new Promise((resolve) => setTimeout(resolve, 25));
    const similarInvoices = await findSimilar("sales_invoice", "Acme warehouse audit proposal", 2);
    expect(similarInvoices[0]?.entityId).toBe(invoice.salesInvoiceId);

    const project = createProject({
      ownerEntityId: company.companyId,
      ownerEntityType: "company_card",
      name: "Implementation",
      status: "active",
    });
    const task = createTask({
      projectId: project.projectId,
      title: "Prepare rollout",
      status: "open",
      priority: "medium",
    });
    createTask({
      projectId: project.projectId,
      parentTaskId: task.taskId,
      title: "Collect signoff",
      status: "open",
      priority: "medium",
    });

    expect(getTask(task.taskId).subtasks).toHaveLength(1);
  });
});
