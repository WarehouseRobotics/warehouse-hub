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

  it("updates contact channel identifiers and notification preferences", async () => {
    const { createContact, updateContact, getContact } = await import("../src/services/contacts.js");

    const contact = createContact({
      type: "person",
      status: "active",
      roles: ["contact"],
      displayName: "Marta Slack",
      email: "marta@example.com",
    });

    const updated = updateContact(contact.contactId, {
      slackUserId: "U123456",
      discordUserId: "9988776655",
      whatsappUserId: "34600111222",
      telegramUserId: "marta_ops",
      notificationPreferences: {
        preferredNotificationSchedule: "weekdays 09:00-17:00 Europe/Madrid",
        doNotDisturb: true,
        channelRooms: {
          slack: ["C-ops", "C-support"],
          discord: ["operations"],
          telegram: ["ops-alerts"],
        },
      },
    });

    expect(updated).toEqual(
      expect.objectContaining({
        slackUserId: "U123456",
        discordUserId: "9988776655",
        whatsappUserId: "34600111222",
        telegramUserId: "marta_ops",
        notificationPreferences: {
          preferredNotificationSchedule: "weekdays 09:00-17:00 Europe/Madrid",
          doNotDisturb: true,
          channelRooms: {
            slack: ["C-ops", "C-support"],
            discord: ["operations"],
            telegram: ["ops-alerts"],
          },
        },
      }),
    );

    const cleared = updateContact(contact.contactId, {
      slackUserId: null,
      notificationPreferences: null,
    });

    expect(cleared.slackUserId).toBeNull();
    expect(cleared.notificationPreferences).toBeNull();
    expect(getContact(contact.contactId)).toEqual(
      expect.objectContaining({
        discordUserId: "9988776655",
        slackUserId: null,
        notificationPreferences: null,
      }),
    );
  });

  it("creates, validates, and revokes contact auth tokens", async () => {
    const { createContact } = await import("../src/services/contacts.js");
    const {
      createContactAuthToken,
      requireActiveContactAuthToken,
      revokeContactAuthToken,
    } = await import("../src/services/contact-auth-tokens.js");

    const contact = createContact({
      type: "person",
      status: "active",
      roles: ["employee"],
      displayName: "Diego Ops",
      email: "diego@example.com",
    });

    const authToken = createContactAuthToken(contact.contactId, {
      ttlMs: 60_000,
    });

    expect(authToken).toEqual(
      expect.objectContaining({
        authTokenId: expect.stringMatching(/^ctauth_/),
        contactId: contact.contactId,
        token: expect.stringMatching(/^ctok_/),
      }),
    );

    expect(requireActiveContactAuthToken(authToken.token)).toEqual(
      expect.objectContaining({
        authTokenId: authToken.authTokenId,
        contactId: contact.contactId,
        revokedAt: null,
      }),
    );

    const expiredToken = createContactAuthToken(contact.contactId, {
      ttlMs: -1,
    });
    expect(() => requireActiveContactAuthToken(expiredToken.token)).toThrowError(
      /invalid or expired/,
    );

    revokeContactAuthToken(authToken.authTokenId);
    expect(() => requireActiveContactAuthToken(authToken.token)).toThrowError(
      /invalid or expired/,
    );
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
      lineItems: [
        {
          description: "Printer paper and toner",
          quantity: "1",
          unitPrice: "120.00",
          taxRate: "21.00",
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
    expect(expense.supplierDisplayName).toBe("Papeleria Centro SL");
    expect(expense.supplierLegalName).toBe("Papeleria Centro SL");
    expect(expense.supplierEmail).toBe("facturas@papeleriacentro.example");
    expect(expense.lineItems).toEqual([
      {
        description: "Printer paper and toner",
        quantity: "1",
        unitPrice: "120.00",
        taxRate: "21.00",
      },
    ]);
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

  it("reimports the same sales invoice number by updating the existing invoice record", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { uploadDocument } = await import("../src/services/documents.js");
    const { importSalesInvoice } = await import("../src/services/sales-invoices.js");

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

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
      taxId: "DE123456789",
      email: "ap@acme-retail.example",
    });

    const originalPdf = uploadDocument(
      {
        fieldname: "file",
        originalname: "svc-2026-001.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 9,
        buffer: Buffer.from("pdf-original"),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      { kind: "sales_invoice", source: "manual_upload" },
    );

    const firstImport = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "SVC-2026-001",
      issueDate: "2026-04-06",
      currency: "EUR",
      lineItems: [{ description: "Consulting sprint", quantity: "1", unitPrice: "1000.00" }],
      totals: {
        net: "1000.00",
        tax: "210.00",
        gross: "1210.00",
      },
      status: "finalized",
      pdfDocumentId: originalPdf.documentId,
    });

    const reimportedPdf = uploadDocument(
      {
        fieldname: "file",
        originalname: "svc-2026-001-copy.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 10,
        buffer: Buffer.from("pdf-reimport"),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      { kind: "sales_invoice", source: "manual_upload" },
    );

    const secondImport = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "SVC-2026-001",
      issueDate: "2026-04-06",
      currency: "EUR",
      lineItems: [{ description: "Consulting sprint", quantity: "1", unitPrice: "1000.00" }],
      totals: {
        net: "1000.00",
        tax: "210.00",
        gross: "1210.00",
      },
      status: "finalized",
      pdfDocumentId: reimportedPdf.documentId,
    });

    expect(secondImport.salesInvoiceId).toBe(firstImport.salesInvoiceId);
    expect(secondImport.pdfDocumentId).toBe(reimportedPdf.documentId);
  });

  it("surfaces a field-aware duplicate error when an import tries to reuse another sales invoice number", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { importSalesInvoice } = await import("../src/services/sales-invoices.js");

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

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
      taxId: "DE123456789",
      email: "ap@acme-retail.example",
    });

    const firstInvoice = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "SVC-2026-001",
      issueDate: "2026-04-06",
      currency: "EUR",
      totals: {
        net: "1000.00",
        tax: "210.00",
        gross: "1210.00",
      },
    });

    importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "SVC-2026-002",
      issueDate: "2026-04-07",
      currency: "EUR",
      totals: {
        net: "500.00",
        tax: "105.00",
        gross: "605.00",
      },
    });

    expect(() =>
      importSalesInvoice({
        targetSalesInvoiceId: firstInvoice.salesInvoiceId,
        customerContactId: customer.contactId,
        invoiceNumber: "SVC-2026-002",
        issueDate: "2026-04-06",
        currency: "EUR",
        totals: {
          net: "1000.00",
          tax: "210.00",
          gross: "1210.00",
        },
        overrideFields: ["invoiceNumber"],
      }),
    ).toThrowError("Sales invoice with invoiceNumber = SVC-2026-002 already exists");
  });

  it("lists accounting records by descending document date with deterministic fallbacks", async () => {
    const { eq } = await import("drizzle-orm");
    const { getOrm } = await import("../src/db/connection.js");
    const { expenses } = await import("../src/db/schema/expenses.js");
    const { payrolls } = await import("../src/db/schema/payrolls.js");
    const { salesInvoices } = await import("../src/db/schema/sales-invoices.js");
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { createExpense, listExpenses } = await import("../src/services/expenses.js");
    const { createPayroll, listPayrolls } = await import("../src/services/payrolls.js");
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
    });

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
    });

    const employee = createContact({
      type: "person",
      status: "active",
      roles: ["employee"],
      displayName: "Marta Payroll",
      legalName: "Marta Payroll",
    });

    const salesInvoiceA = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "2026-0040",
      issueDate: "2026-04-02",
      currency: "EUR",
      totals: {
        net: "100.00",
        tax: "21.00",
        gross: "121.00",
      },
      status: "finalized",
    });
    const salesInvoiceB = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "2026-0041",
      issueDate: "2026-04-02",
      currency: "EUR",
      totals: {
        net: "120.00",
        tax: "25.20",
        gross: "145.20",
      },
      status: "finalized",
    });
    const salesInvoiceC = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "2026-0042",
      issueDate: "2026-04-03",
      currency: "EUR",
      totals: {
        net: "140.00",
        tax: "29.40",
        gross: "169.40",
      },
      status: "finalized",
    });

    const expenseA = createExpense({
      supplierContactId: supplier.contactId,
      invoiceNumber: "EXP-001",
      invoiceDate: "2026-03-05",
      dueDate: "2026-04-05",
      currency: "EUR",
      totals: {
        net: "50.00",
        tax: "10.50",
        gross: "60.50",
      },
      category: "office_supplies",
      status: "recorded",
    });
    const expenseB = createExpense({
      supplierContactId: supplier.contactId,
      invoiceNumber: "EXP-002",
      currency: "EUR",
      totals: {
        net: "60.00",
        tax: "12.60",
        gross: "72.60",
      },
      category: "office_supplies",
      status: "recorded",
    });
    const expenseC = createExpense({
      supplierContactId: supplier.contactId,
      invoiceNumber: "EXP-003",
      invoiceDate: "2026-04-01",
      dueDate: "2026-05-01",
      currency: "EUR",
      totals: {
        net: "70.00",
        tax: "14.70",
        gross: "84.70",
      },
      category: "office_supplies",
      status: "recorded",
    });
    const expenseD = createExpense({
      supplierContactId: supplier.contactId,
      invoiceNumber: "EXP-004",
      currency: "EUR",
      totals: {
        net: "80.00",
        tax: "16.80",
        gross: "96.80",
      },
      category: "office_supplies",
      status: "recorded",
    });

    const payrollA = createPayroll({
      employeeContactId: employee.contactId,
      payrollNumber: "PAY-001",
      countryCode: "ES",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      paymentDate: "2026-02-05",
      currency: "EUR",
      grossSalary: "2000.00",
      netSalary: "1500.00",
      status: "recorded",
    });
    const payrollB = createPayroll({
      employeeContactId: employee.contactId,
      payrollNumber: "PAY-002",
      countryCode: "ES",
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      currency: "EUR",
      grossSalary: "2000.00",
      netSalary: "1500.00",
      status: "recorded",
    });
    const payrollC = createPayroll({
      employeeContactId: employee.contactId,
      payrollNumber: "PAY-003",
      countryCode: "ES",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      paymentDate: "2026-04-05",
      currency: "EUR",
      grossSalary: "2000.00",
      netSalary: "1500.00",
      status: "recorded",
    });

    getOrm()
      .update(salesInvoices)
      .set({ createdAt: "2026-04-02T09:00:00.000Z", updatedAt: "2026-04-02T09:00:00.000Z" })
      .where(eq(salesInvoices.id, salesInvoiceA.salesInvoiceId))
      .run();
    getOrm()
      .update(salesInvoices)
      .set({ createdAt: "2026-04-02T10:00:00.000Z", updatedAt: "2026-04-02T10:00:00.000Z" })
      .where(eq(salesInvoices.id, salesInvoiceB.salesInvoiceId))
      .run();
    getOrm()
      .update(salesInvoices)
      .set({ createdAt: "2026-04-03T11:00:00.000Z", updatedAt: "2026-04-03T11:00:00.000Z" })
      .where(eq(salesInvoices.id, salesInvoiceC.salesInvoiceId))
      .run();

    getOrm()
      .update(expenses)
      .set({ createdAt: "2026-03-05T09:00:00.000Z", updatedAt: "2026-03-05T09:00:00.000Z" })
      .where(eq(expenses.id, expenseA.expenseId))
      .run();
    getOrm()
      .update(expenses)
      .set({ createdAt: "2026-03-10T09:00:00.000Z", updatedAt: "2026-03-10T09:00:00.000Z" })
      .where(eq(expenses.id, expenseB.expenseId))
      .run();
    getOrm()
      .update(expenses)
      .set({ createdAt: "2026-04-01T09:00:00.000Z", updatedAt: "2026-04-01T09:00:00.000Z" })
      .where(eq(expenses.id, expenseC.expenseId))
      .run();
    getOrm()
      .update(expenses)
      .set({ createdAt: "2026-03-15T09:00:00.000Z", updatedAt: "2026-03-15T09:00:00.000Z" })
      .where(eq(expenses.id, expenseD.expenseId))
      .run();

    getOrm()
      .update(payrolls)
      .set({ createdAt: "2026-02-05T09:00:00.000Z", updatedAt: "2026-02-05T09:00:00.000Z" })
      .where(eq(payrolls.id, payrollA.payrollId))
      .run();
    getOrm()
      .update(payrolls)
      .set({ createdAt: "2026-03-01T09:00:00.000Z", updatedAt: "2026-03-01T09:00:00.000Z" })
      .where(eq(payrolls.id, payrollB.payrollId))
      .run();
    getOrm()
      .update(payrolls)
      .set({ createdAt: "2026-04-05T09:00:00.000Z", updatedAt: "2026-04-05T09:00:00.000Z" })
      .where(eq(payrolls.id, payrollC.payrollId))
      .run();

    expect((await listSalesInvoices()).map((invoice) => invoice.invoiceNumber)).toEqual([
      "2026-0042",
      "2026-0041",
      "2026-0040",
    ]);

    expect((await listExpenses()).map((expense) => expense.invoiceNumber)).toEqual([
      "EXP-003",
      "EXP-001",
      "EXP-004",
      "EXP-002",
    ]);

    expect((await listPayrolls()).map((payroll) => payroll.payrollNumber)).toEqual([
      "PAY-003",
      "PAY-001",
      "PAY-002",
    ]);
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
            "line item: description=Laser toner cartridge; quantity=2; unitPrice=60.00; taxRate=21.00; total=120.00",
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
        lineItems: [
          {
            description: "Laser toner cartridge",
            quantity: "2",
            unitPrice: "60.00",
            taxRate: "21.00",
            total: "120.00",
          },
        ],
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

  it("ingests payroll slips, creates employee contacts, and stores normalized payroll amounts", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { ingestDocument } = await import("../src/services/document-ingestion.js");
    const { listContacts } = await import("../src/services/contacts.js");

    upsertCompanyCard({
      legalName: "Warehouse Robotics SL",
      displayName: "Warehouse Robotics",
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

    const result = await ingestDocument(
      {
        fieldname: "file",
        originalname: "test_nomina.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 500,
        buffer: Buffer.from(
          [
            "employer: Warehouse Robotics SL",
            "employee: Denis K",
            "employee email: denis@example.com",
            "country: ES",
            "payroll number: NOM-2026-03-01",
            "period start: 2026-03-01",
            "period end: 2026-03-31",
            "payment date: 2026-03-31",
            "currency: EUR",
            "gross salary: 3000.00",
            "net salary: 2310.00",
            "employee tax withheld: 345.00",
            "employee social contributions: 210.00",
            "employer social contributions: 690.00",
            "other deductions: 135.00",
            "other earnings: 0.00",
            "payroll line: label=Salario base; category=earning; amount=3000.00",
            "payroll line: label=IRPF; category=withholding; amount=345.00",
            "payroll line: label=Seguridad Social Trabajador; category=employee_contribution; amount=210.00",
          ].join("\n"),
        ),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "payroll",
      },
    );

    expect(result.document.ocrStatus).toBe("completed");
    expect(result.document.ocrEngine).toBe("structured-stub-ocr");
    expect(result.linkedEntity?.type).toBe("payroll");
    expect(result.extracted.structuredPayrollData?.schemaVersion).toBe("payroll.v1");
    expect(result.linkedEntity?.data).toEqual(
      expect.objectContaining({
        payrollNumber: "NOM-2026-03-01",
        grossSalary: "3000.00",
        netSalary: "2310.00",
        employeeTaxWithheld: "345.00",
        employeeSocialContributions: "210.00",
        employerSocialContributions: "690.00",
        status: "recorded",
      }),
    );
    expect(listContacts({ role: "employee" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "person",
          displayName: "Denis K",
        }),
      ]),
    );
  });

  it("reimports duplicate payroll slips by updating the same payroll and replacing the document", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { ingestDocument } = await import("../src/services/document-ingestion.js");
    const { getDocumentMeta } = await import("../src/services/documents.js");

    upsertCompanyCard({
      legalName: "Warehouse Robotics SL",
      displayName: "Warehouse Robotics",
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
        originalname: "test_nomina.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 500,
        buffer: Buffer.from(
          [
            "employee: Denis K",
            "payroll number: NOM-2026-03-01",
            "period start: 2026-03-01",
            "period end: 2026-03-31",
            "payment date: 2026-03-31",
            "currency: EUR",
            "gross salary: 3000.00",
            "net salary: 2310.00",
            "employee tax withheld: 345.00",
            "employee social contributions: 210.00",
            "employer social contributions: 690.00",
            "other deductions: 135.00",
            "other earnings: 0.00",
            "payroll line: label=Salario base; category=earning; amount=3000.00",
          ].join("\n"),
        ),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      { kind: "payroll" },
    );

    const second = await ingestDocument(
      {
        fieldname: "file",
        originalname: "test_nomina_corrected.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 520,
        buffer: Buffer.from(
          [
            "employee: Denis K",
            "payroll number: NOM-2026-03-01",
            "period start: 2026-03-01",
            "period end: 2026-03-31",
            "payment date: 2026-03-31",
            "currency: EUR",
            "gross salary: 3000.00",
            "net salary: 2345.00",
            "employee tax withheld: 345.00",
            "employee social contributions: 210.00",
            "employer social contributions: 690.00",
            "other deductions: 100.00",
            "other earnings: 0.00",
            "notes: Corrected payroll slip",
            "payroll line: label=Salario base; category=earning; amount=3000.00",
          ].join("\n"),
        ),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      { kind: "payroll" },
    );

    expect(first.linkedEntity?.type).toBe("payroll");
    expect(second.linkedEntity?.type).toBe("payroll");
    if (first.linkedEntity?.type !== "payroll" || second.linkedEntity?.type !== "payroll") {
      throw new Error("Expected linked payroll records");
    }

    expect(second.linkedEntity.data.payrollId).toBe(first.linkedEntity.data.payrollId);
    expect(second.document.documentId).toBe(first.document.documentId);
    expect(second.linkedEntity.data.netSalary).toBe("2345.00");
    expect(second.linkedEntity.data.otherDeductions).toBe("100.00");
    expect(getDocumentMeta(first.document.documentId).filename).toBe("test_nomina_corrected.pdf");
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
    const { createTask, getTask, updateTask } = await import("../src/services/tasks.js");
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
    expect(updateTask(task.taskId, { status: "done" }).status).toBe("done");
    expect(updateTask(task.taskId, { status: "open" }).status).toBe("open");
  });

  it("creates, lists, updates, and deletes generic comments without changing entity payloads", async () => {
    const { upsertCompanyCard, getCompanyCard } = await import("../src/services/company-card.js");
    const { createComment, getComment, listComments, softDeleteComment, updateComment } = await import("../src/services/comments.js");
    const { createContact, getContact } = await import("../src/services/contacts.js");
    const { createDeal } = await import("../src/services/deals.js");
    const { uploadDocument, getDocumentMeta } = await import("../src/services/documents.js");
    const { createExpense } = await import("../src/services/expenses.js");
    const { createPayroll } = await import("../src/services/payrolls.js");
    const { createProject, getProject } = await import("../src/services/projects.js");
    const { generateSalesInvoice } = await import("../src/services/sales-invoices.js");
    const { createTask, getTask } = await import("../src/services/tasks.js");

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

    const supplier = createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
      legalName: "Papeleria Centro SL",
      email: "orders@papeleria.example",
    });

    const employee = createContact({
      type: "person",
      status: "active",
      parentContactId: supplier.contactId,
      roles: ["employee"],
      displayName: "Lucia Perez",
      email: "lucia@papeleria.example",
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

    const document = uploadDocument(
      {
        fieldname: "file",
        originalname: "invoice.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 8,
        buffer: Buffer.from("pdf-data"),
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
        net: "120.00",
        tax: "25.20",
        gross: "145.20",
      },
      category: "office_supplies",
      status: "recorded",
    });

    const payroll = createPayroll({
      employeeContactId: employee.contactId,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      paymentDate: "2026-03-31",
      countryCode: "ES",
      currency: "EUR",
      grossSalary: "3000.00",
      netSalary: "2310.00",
      employeeTaxWithheld: "390.00",
      employeeSocialContributions: "180.00",
      employerSocialContributions: "900.00",
      otherDeductions: "120.00",
      otherEarnings: "0.00",
      rawLines: [],
      notes: "March payroll",
      status: "recorded",
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
      ],
      notes: "Approved by procurement.",
    });

    const salesInvoice = generateSalesInvoice({
      customerContactId: customer.contactId,
      dealId: deal.dealId,
      issueDate: "2026-04-02",
      paymentTermsDays: 30,
      invoiceNumberStrategy: "next",
    });

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

    const representativeComment = createComment({
      commentableType: "task",
      commentableSlug: task.slug,
      body: "Customer asked to delay by one week.",
      authorName: "Hub developer",
      authorContactSlug: customer.slug,
    });

    expect(representativeComment.commentableId).toBe(task.taskId);
    expect(representativeComment.commentableSlug).toBe(task.slug);
    expect(representativeComment.authorContactId).toBe(customer.contactId);
    expect(getComment(representativeComment.slug).commentId).toBe(representativeComment.commentId);

    const createdPerType = [
      createComment({
        commentableType: "company_card",
        commentableId: company.companyId,
        body: "Owned company profile reviewed.",
        authorName: "Ops lead",
      }),
      createComment({
        commentableType: "contact",
        commentableSlug: customer.slug,
        body: "Key customer stakeholder confirmed.",
        authorName: "Sales agent",
      }),
      createComment({
        commentableType: "document",
        commentableId: document.documentId,
        body: "OCR looked clean on first pass.",
        authorName: "Doc bot",
      }),
      createComment({
        commentableType: "expense",
        commentableSlug: expense.slug,
        body: "Need supplier clarification on VAT line.",
        authorName: "Accounting agent",
      }),
      createComment({
        commentableType: "payroll",
        commentableId: payroll.payrollId,
        body: "Employee confirmed receipt.",
        authorName: "Payroll bot",
      }),
      createComment({
        commentableType: "deal",
        commentableSlug: deal.slug,
        body: "Procurement approved the proposal.",
        authorName: "Sales agent",
      }),
      createComment({
        commentableType: "sales_invoice",
        commentableId: salesInvoice.salesInvoiceId,
        body: "Invoice ready for sending.",
        authorName: "Billing agent",
      }),
      createComment({
        commentableType: "project",
        commentableSlug: project.slug,
        body: "Implementation kickoff booked.",
        authorName: "PM bot",
      }),
    ];

    expect(createdPerType).toHaveLength(8);
    expect(listComments({ commentableType: "task", commentableSlug: task.slug })).toEqual([
      expect.objectContaining({ commentId: representativeComment.commentId }),
    ]);
    expect(listComments({ authorContactId: customer.contactId })).toEqual([
      expect.objectContaining({ commentId: representativeComment.commentId }),
    ]);

    const updated = updateComment(representativeComment.commentId, {
      body: "Customer asked to delay by two weeks.",
      authorName: "Hub developer agent",
      authorContactId: null,
    });
    expect(updated.body).toBe("Customer asked to delay by two weeks.");
    expect(updated.authorName).toBe("Hub developer agent");
    expect(updated.authorContactId).toBeNull();

    softDeleteComment(representativeComment.commentId);
    expect(listComments({ commentableType: "task", commentableId: task.taskId })).toEqual([]);

    expect(getTask(task.taskId)).not.toHaveProperty("comments");
    expect(getContact(customer.contactId)).not.toHaveProperty("comments");
    expect(getDocumentMeta(document.documentId)).not.toHaveProperty("comments");
    expect(getProject(project.projectId)).not.toHaveProperty("comments");
    expect(getCompanyCard()).not.toHaveProperty("comments");

    expect(() => listComments({ commentableId: task.taskId })).toThrow(/commentableType is required/i);
    expect(() =>
      createComment({
        commentableType: "task",
        commentableId: "task_missing",
        body: "Missing task target.",
        authorName: "Hub developer",
      }),
    ).toThrow(/Task not found/i);
    expect(() =>
      createComment({
        commentableType: "task",
        commentableId: task.taskId,
        body: "Invalid author contact.",
        authorName: "Hub developer",
        authorContactSlug: "missing-contact",
      }),
    ).toThrow(/Contact not found/i);
    expect(() =>
      createComment({
        commentableType: "unknown" as never,
        commentableId: task.taskId,
        body: "Unsupported type.",
        authorName: "Hub developer",
      }),
    ).toThrow(/Unsupported commentable type/i);
  });
});
