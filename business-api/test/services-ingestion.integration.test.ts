import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetTestState, restoreServiceTestEnvironment, waitFor } from "./helpers/services.js";

describe("business-api document ingestion service flows", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  afterEach(async () => {
    await restoreServiceTestEnvironment();
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
});
