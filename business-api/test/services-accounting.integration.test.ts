import fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { llmConfigPath, mockUploadFile, resetTestState, restoreServiceTestEnvironment, waitFor } from "./helpers/services.js";

describe("business-api accounting service flows", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  afterEach(async () => {
    await restoreServiceTestEnvironment();
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
    const { eq } = await import("drizzle-orm");
    const { getOrm } = await import("../src/db/connection.js");
    const { documents } = await import("../src/db/schema/documents.js");

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
      mockUploadFile("toner-invoice.pdf", "application/pdf", "pdf-a", 8),
      { kind: "expense_invoice", source: "email_forward" },
    );
    updateDocumentProcessing(tonerDocument.documentId, {
      ocrStatus: "completed",
      ocrText: "toner shipment fc-toner-001",
    });

    const consultingDocument = uploadDocument(
      mockUploadFile("consulting-invoice.pdf", "application/pdf", "pdf-b", 8),
      { kind: "sales_invoice", source: "manual_upload" },
    );
    updateDocumentProcessing(consultingDocument.documentId, {
      ocrStatus: "completed",
      ocrText: "consulting statement svc-2026-001",
    });

    getOrm()
      .update(documents)
      .set({ createdAt: "2026-04-02T09:00:00.000Z" })
      .where(eq(documents.id, tonerDocument.documentId))
      .run();
    getOrm()
      .update(documents)
      .set({ createdAt: "2026-04-03T09:00:00.000Z" })
      .where(eq(documents.id, consultingDocument.documentId))
      .run();

    const latestDocument = await waitFor(
      () => listDocuments({ limit: 1 }),
      (items) => items.length === 1,
    );
    expect(latestDocument.map((item) => item.documentId)).toEqual([consultingDocument.documentId]);

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
      mockUploadFile("svc-2026-001.pdf", "application/pdf", "pdf-original", 9),
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
      mockUploadFile("svc-2026-001-copy.pdf", "application/pdf", "pdf-reimport", 10),
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
      employeeTaxWithheld: "0.00",
      employeeSocialContributions: "0.00",
      employerSocialContributions: "0.00",
      otherDeductions: "0.00",
      otherEarnings: "0.00",
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
      employeeTaxWithheld: "0.00",
      employeeSocialContributions: "0.00",
      employerSocialContributions: "0.00",
      otherDeductions: "0.00",
      otherEarnings: "0.00",
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
      employeeTaxWithheld: "0.00",
      employeeSocialContributions: "0.00",
      employerSocialContributions: "0.00",
      otherDeductions: "0.00",
      otherEarnings: "0.00",
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
});
