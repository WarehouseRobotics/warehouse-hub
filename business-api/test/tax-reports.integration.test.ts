import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { beforeEach, describe, expect, it } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");

function runCli(args: string[]): string {
  const tsxPath = path.resolve(process.cwd(), "node_modules/.bin/tsx");
  return execFileSync(tsxPath, ["src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "3199",
      API_KEY: "test-api-key",
      DATABASE_PATH: "./test-data/business-api.sqlite",
      UPLOAD_DIR: "./test-data/uploads",
      OCR_STUB_MODE: "true",
      EMBEDDING_ALLOW_STUB_FALLBACK: "true",
    },
    encoding: "utf8",
  });
}

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

async function uploadTaxReceipt(contents = "AEAT payment receipt") {
  const { uploadDocument } = await import("../src/services/documents.js");
  return uploadDocument(
    {
      fieldname: "file",
      originalname: "aeat-payment-receipt.pdf",
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
      kind: "tax_payment_receipt",
      source: "authority_portal_download",
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

function payableTaxReportInput(companyCardId: string, documentId: string) {
  return {
    ...baseTaxReportInput(companyCardId, documentId),
    result: "payable" as const,
    paymentStatus: "unpaid" as const,
    taxDue: "2520",
    taxDeductible: "2400",
    resultAmount: "120",
    authoritySubmissionId: `AEAT-303-Q1-${documentId}`,
    facts: [
      {
        fieldCode: "71",
        fieldSystem: "casilla" as const,
        label: "Payable result",
        valueType: "money" as const,
        rawValue: "120,00",
        normalizedValue: "120",
        currency: "EUR",
        direction: "payable" as const,
        confidence: "high" as const,
      },
    ],
    carryforwards: [],
  };
}

describe("tax report service flows", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  it("creates a tax report with facts, carryforwards, document linkage, and stable detail mapping", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument();
    const {
      buildTaxReportEmbeddingPayload,
      createTaxReport,
      getTaxReport,
      listTaxCarryforwards,
    } = await import("../src/services/tax-reports.js");
    const { getDocumentMeta } = await import("../src/services/documents.js");
    const { computeEmbeddingText } = await import("../src/lib/embeddings.js");

    const created = createTaxReport(
      baseTaxReportInput(company.companyId, document.documentId),
    );
    const detail = getTaxReport(created.taxReport.taxReportId);
    const embeddingPayload = buildTaxReportEmbeddingPayload(
      created.taxReport.taxReportId,
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
    expect(detail.document.documentId).toBe(document.documentId);
    expect(getDocumentMeta(document.documentId)).toEqual(
      expect.objectContaining({
        linkedEntityType: "tax_report",
        linkedEntityId: created.taxReport.taxReportId,
      }),
    );
    expect(embeddingPayload).toEqual(detail);
    expect(embeddingPayload.facts[0]).toEqual(
      expect.objectContaining({
        taxReportFactId: expect.stringMatching(/^trf_/),
      }),
    );
    expect(computeEmbeddingText("tax_report", embeddingPayload)).toEqual(
      computeEmbeddingText("tax_report", detail),
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

  it("recomputes payable payment status from confirmed payment links only", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("payable declaration");
    const {
      createTaxReport,
      createTaxReportPaymentLink,
      getTaxReport,
      updateTaxReportPaymentLink,
    } = await import("../src/services/tax-reports.js");
    const { createBankAccount, upsertBankTransaction } = await import("../src/services/bank.js");

    const report = createTaxReport(payableTaxReportInput(company.companyId, document.documentId));
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
      reference: "AEAT-303-Q1",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    const suggested = createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: transaction.bankTransactionId,
      amount: "120.00",
      currency: "EUR",
      paidAt: transaction.transactionDate,
      paymentReference: transaction.reference ?? undefined,
      status: "suggested",
      confidence: "high",
    });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("unpaid");

    updateTaxReportPaymentLink(suggested.taxReportPaymentLinkId, { status: "confirmed" });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("paid");

    updateTaxReportPaymentLink(suggested.taxReportPaymentLinkId, { status: "rejected" });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("unpaid");
  });

  it("does not downgrade an existing confirmed payment link from an idempotent create", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("payable idempotent declaration");
    const {
      createTaxReport,
      createTaxReportPaymentLink,
      getTaxReport,
    } = await import("../src/services/tax-reports.js");
    const { createBankAccount, upsertBankTransaction } = await import("../src/services/bank.js");

    const report = createTaxReport(payableTaxReportInput(company.companyId, document.documentId));
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
      reference: "AEAT-303-Q1-IDEMPOTENT",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    const confirmed = createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: transaction.bankTransactionId,
      amount: "120.00",
      currency: "EUR",
      paidAt: transaction.transactionDate,
      paymentReference: transaction.reference ?? undefined,
      status: "confirmed",
      confidence: "high",
    });

    const duplicate = createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: transaction.bankTransactionId,
      amount: "120.00",
      currency: "EUR",
      paidAt: transaction.transactionDate,
      paymentReference: transaction.reference ?? undefined,
      status: "suggested",
      confidence: "medium",
      reason: "Duplicate suggestion",
    });

    expect(duplicate).toEqual(
      expect.objectContaining({
        taxReportPaymentLinkId: confirmed.taxReportPaymentLinkId,
        status: "confirmed",
      }),
    );
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("paid");
  });

  it("supports partial payable payments and confirmed receipt evidence", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("partial payable declaration");
    const { uploadDocument } = await import("../src/services/documents.js");
    const receipt = uploadDocument(
      {
        fieldname: "file",
        originalname: "aeat-payment-receipt.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 20,
        buffer: Buffer.from("AEAT payment receipt"),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "tax_payment_receipt",
        companyCardId: company.companyId,
        source: "authority_portal_download",
      },
    );
    const {
      createTaxReport,
      createTaxReportPaymentLink,
      getTaxReport,
    } = await import("../src/services/tax-reports.js");
    const { createBankAccount, upsertBankTransaction } = await import("../src/services/bank.js");

    const report = createTaxReport(payableTaxReportInput(company.companyId, document.documentId));
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const firstTransaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-20",
      amount: "-80.00",
      currency: "EUR",
      description: "AEAT Modelo 303 partial",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: firstTransaction.bankTransactionId,
      amount: "80.00",
      currency: "EUR",
      paidAt: firstTransaction.transactionDate,
      status: "confirmed",
      confidence: "high",
    });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("partially_paid");

    createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      documentId: receipt.documentId,
      amount: "40.00",
      currency: "EUR",
      paidAt: "2026-04-20",
      paymentReference: "AEAT-303-Q1-RECEIPT",
      status: "confirmed",
      confidence: "high",
    });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("paid");
  });

  it("does not double-count receipt evidence that duplicates bank evidence", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("dedupe payable declaration");
    const receipt = await uploadTaxReceipt("AEAT payment receipt for first debit");
    const {
      createTaxReport,
      createTaxReportPaymentLink,
      getTaxReport,
    } = await import("../src/services/tax-reports.js");
    const { createBankAccount, upsertBankTransaction } = await import("../src/services/bank.js");

    const report = createTaxReport({
      ...payableTaxReportInput(company.companyId, document.documentId),
      resultAmount: "240.00",
      authoritySubmissionId: `AEAT-303-Q1-DEDUPE-${document.documentId}`,
    });
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const firstTransaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-20",
      amount: "-120.00",
      currency: "EUR",
      description: "AEAT Modelo 303 first partial",
      reference: "AEAT-303-Q1-FIRST",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;
    const secondTransaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-05-20",
      amount: "-120.00",
      currency: "EUR",
      description: "AEAT Modelo 303 second partial",
      reference: "AEAT-303-Q1-SECOND",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: firstTransaction.bankTransactionId,
      amount: "120.00",
      currency: "EUR",
      paidAt: firstTransaction.transactionDate,
      paymentReference: firstTransaction.reference ?? undefined,
      status: "confirmed",
      confidence: "high",
    });
    createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      documentId: receipt.documentId,
      amount: "120.00",
      currency: "EUR",
      paidAt: firstTransaction.transactionDate,
      paymentReference: firstTransaction.reference ?? undefined,
      status: "confirmed",
      confidence: "high",
    });

    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("partially_paid");

    createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: secondTransaction.bankTransactionId,
      amount: "120.00",
      currency: "EUR",
      paidAt: secondTransaction.transactionDate,
      paymentReference: secondTransaction.reference ?? undefined,
      status: "confirmed",
      confidence: "high",
    });

    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("paid");
  });

  it("marks refund-requested reports as refunded only after confirmed refund bank evidence", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("refund declaration");
    const {
      createTaxReport,
      createTaxReportPaymentLink,
      getTaxReport,
    } = await import("../src/services/tax-reports.js");
    const { createBankAccount, upsertBankTransaction } = await import("../src/services/bank.js");

    const report = createTaxReport({
      ...baseTaxReportInput(company.companyId, document.documentId),
      result: "refund_requested",
      paymentStatus: "refund_pending",
      resultAmount: "-90.00",
      authoritySubmissionId: `AEAT-303-REFUND-${document.documentId}`,
      carryforwards: [],
    });
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const refundTransaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-05-04",
      amount: "90.00",
      currency: "EUR",
      description: "AEAT refund Modelo 303 2026-Q1",
      reference: "AEAT-303-Q1",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: refundTransaction.bankTransactionId,
      amount: "90.00",
      currency: "EUR",
      paidAt: refundTransaction.transactionDate,
      status: "confirmed",
      confidence: "high",
    });

    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("refunded");
  });

  it("requires confirmed refund bank evidence to cover the requested refund amount", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("refund amount declaration");
    const {
      createTaxReport,
      createTaxReportPaymentLink,
      getTaxReport,
      updateTaxReportPaymentLink,
    } = await import("../src/services/tax-reports.js");
    const {
      createBankAccount,
      softDeleteBankTransaction,
      upsertBankTransaction,
    } = await import("../src/services/bank.js");

    const report = createTaxReport({
      ...baseTaxReportInput(company.companyId, document.documentId),
      result: "refund_requested",
      paymentStatus: "refund_pending",
      resultAmount: "-90.00",
      authoritySubmissionId: `AEAT-303-REFUND-AMOUNT-${document.documentId}`,
      carryforwards: [],
    });
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const unrelatedCredit = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-05-04",
      amount: "12.50",
      currency: "EUR",
      description: "Unrelated customer payment",
      reference: "CUSTOMER-12-50",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;
    const remainingRefund = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-05-05",
      amount: "77.50",
      currency: "EUR",
      description: "AEAT refund Modelo 303 remainder",
      reference: "AEAT-303-Q1-REFUND-REMAINDER",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: unrelatedCredit.bankTransactionId,
      amount: "12.50",
      currency: "EUR",
      paidAt: unrelatedCredit.transactionDate,
      status: "confirmed",
      confidence: "high",
    });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("refund_pending");

    const remainingRefundLink = createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: remainingRefund.bankTransactionId,
      amount: "77.50",
      currency: "EUR",
      paidAt: remainingRefund.transactionDate,
      status: "confirmed",
      confidence: "high",
    });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("refunded");

    softDeleteBankTransaction(remainingRefund.bankTransactionId);
    updateTaxReportPaymentLink(remainingRefundLink.taxReportPaymentLinkId, {
      status: "rejected",
    });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("refund_pending");
  });

  it("skips soft-deleted payment evidence during recompute and payment evidence hydration", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("deleted evidence declaration");
    const receipt = await uploadTaxReceipt("receipt to delete");
    const {
      createTaxReport,
      createTaxReportPaymentLink,
      getTaxReport,
      updateTaxReportPaymentLink,
    } = await import("../src/services/tax-reports.js");
    const {
      createBankAccount,
      softDeleteBankTransaction,
      upsertBankTransaction,
    } = await import("../src/services/bank.js");
    const { softDeleteDocument } = await import("../src/services/documents.js");

    const report = createTaxReport(payableTaxReportInput(company.companyId, document.documentId));
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const transaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-20",
      amount: "-80.00",
      currency: "EUR",
      description: "AEAT Modelo 303 partial",
      reference: "AEAT-303-Q1-DELETED",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    const bankLink = createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      bankTransactionId: transaction.bankTransactionId,
      amount: "80.00",
      currency: "EUR",
      paidAt: transaction.transactionDate,
      paymentReference: transaction.reference ?? undefined,
      status: "confirmed",
      confidence: "high",
    });
    const receiptLink = createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      documentId: receipt.documentId,
      amount: "40.00",
      currency: "EUR",
      paidAt: "2026-04-20",
      paymentReference: "AEAT-303-Q1-DELETED-RECEIPT",
      status: "confirmed",
      confidence: "high",
    });
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("paid");

    softDeleteBankTransaction(transaction.bankTransactionId);
    softDeleteDocument(receipt.documentId);
    updateTaxReportPaymentLink(receiptLink.taxReportPaymentLinkId, { status: "rejected" });
    updateTaxReportPaymentLink(bankLink.taxReportPaymentLinkId, { status: "confirmed" });

    const hydrated = getTaxReport(report.taxReport.taxReportId, {
      includePaymentEvidence: true,
    }) as ReturnType<typeof getTaxReport> & {
      paymentEvidence: { bankTransactions: unknown[]; documents: unknown[] };
    };
    expect(hydrated.taxReport.paymentStatus).toBe("unpaid");
    expect(hydrated.paymentEvidence).toEqual({
      bankTransactions: [],
      documents: [],
    });
  });

  it("keeps a shared receipt document linked to its first tax report", async () => {
    const company = await createCompanyCard();
    const firstDocument = await uploadTaxDocument("first shared receipt declaration");
    const secondDocument = await uploadTaxDocument("second shared receipt declaration");
    const receipt = await uploadTaxReceipt("single AEAT receipt covering two taxes");
    const {
      createTaxReport,
      createTaxReportPaymentLink,
    } = await import("../src/services/tax-reports.js");
    const { getDocumentMeta } = await import("../src/services/documents.js");

    const firstReport = createTaxReport(
      payableTaxReportInput(company.companyId, firstDocument.documentId),
    );
    const secondReport = createTaxReport({
      ...payableTaxReportInput(company.companyId, secondDocument.documentId),
      authoritySubmissionId: `AEAT-303-Q1-SHARED-${secondDocument.documentId}`,
    });

    createTaxReportPaymentLink({
      taxReportId: firstReport.taxReport.taxReportId,
      documentId: receipt.documentId,
      amount: "120.00",
      currency: "EUR",
      paidAt: "2026-04-20",
      paymentReference: "AEAT-SHARED-RECEIPT-FIRST",
      status: "confirmed",
      confidence: "high",
    });
    createTaxReportPaymentLink({
      taxReportId: secondReport.taxReport.taxReportId,
      documentId: receipt.documentId,
      amount: "120.00",
      currency: "EUR",
      paidAt: "2026-04-20",
      paymentReference: "AEAT-SHARED-RECEIPT-SECOND",
      status: "confirmed",
      confidence: "high",
    });

    expect(getDocumentMeta(receipt.documentId)).toEqual(
      expect.objectContaining({
        linkedEntityType: "tax_report",
        linkedEntityId: firstReport.taxReport.taxReportId,
      }),
    );
  });

  it("uploads receipt evidence through one document-linking path", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("upload receipt declaration");
    const {
      createTaxReport,
      uploadTaxReportPaymentReceipt,
    } = await import("../src/services/tax-reports.js");
    const { getDocumentMeta } = await import("../src/services/documents.js");

    const report = createTaxReport(payableTaxReportInput(company.companyId, document.documentId));
    const result = uploadTaxReportPaymentReceipt(
      report.taxReport.taxReportId,
      {
        fieldname: "file",
        originalname: "receipt-upload.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 20,
        buffer: Buffer.from("AEAT payment receipt"),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "tax_payment_receipt",
        source: "authority_portal_download",
        link: {
          amount: "120.00",
          currency: "EUR",
          paidAt: "2026-04-20",
          paymentReference: "AEAT-303-Q1-UPLOAD-RECEIPT",
          status: "confirmed",
          confidence: "high",
        },
      },
    );

    expect(result.taxReport.paymentStatus).toBe("paid");
    expect(getDocumentMeta(result.document.documentId)).toEqual(
      expect.objectContaining({
        linkedEntityType: "tax_report",
        linkedEntityId: report.taxReport.taxReportId,
      }),
    );
  });

  it("suggests matching bank transactions idempotently without auto-confirming", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("suggestion declaration");
    const {
      createTaxReport,
      getTaxReport,
      suggestTaxReportPaymentLinks,
    } = await import("../src/services/tax-reports.js");
    const { createBankAccount, upsertBankTransaction } = await import("../src/services/bank.js");

    const report = createTaxReport(payableTaxReportInput(company.companyId, document.documentId));
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-20",
      amount: "-120.00",
      currency: "EUR",
      description: "AEAT Modelo 303 2026-Q1",
      reference: "AEAT-303-Q1",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    });

    const first = suggestTaxReportPaymentLinks(report.taxReport.taxReportId);
    const second = suggestTaxReportPaymentLinks(report.taxReport.taxReportId);

    expect(first.autoConfirmed).toBe(false);
    expect(first.matches).toEqual([
      expect.objectContaining({ status: "suggested", confidence: "high" }),
    ]);
    expect(second.matches).toEqual([
      expect.objectContaining({
        taxReportPaymentLinkId: first.matches[0]?.taxReportPaymentLinkId,
        status: "suggested",
      }),
    ]);
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("unpaid");
  });

  it("supports CLI suggestion, payment-link update, list, and receipt upload flows", { timeout: 15000 }, async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("cli payable declaration");
    const {
      createTaxReport,
      getTaxReport,
    } = await import("../src/services/tax-reports.js");
    const { createBankAccount, upsertBankTransaction } = await import("../src/services/bank.js");

    const report = createTaxReport(payableTaxReportInput(company.companyId, document.documentId));
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-20",
      amount: "-120.00",
      currency: "EUR",
      description: "AEAT Modelo 303 2026-Q1",
      reference: "AEAT-303-Q1",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    });

    const suggested = JSON.parse(
      runCli(["tax-reports", "suggest-payments", report.taxReport.taxReportId]),
    ) as { matches: Array<{ taxReportPaymentLinkId: string; status: string }> };
    expect(suggested.matches).toEqual([
      expect.objectContaining({ status: "suggested" }),
    ]);

    const confirmed = JSON.parse(
      runCli([
        "tax-report-payment-links",
        "update",
        suggested.matches[0]!.taxReportPaymentLinkId,
        '{"status":"confirmed"}',
      ]),
    ) as { status: string };
    expect(confirmed.status).toBe("confirmed");
    expect(getTaxReport(report.taxReport.taxReportId).taxReport.paymentStatus).toBe("paid");

    const listed = JSON.parse(
      runCli([
        "tax-report-payment-links",
        "list",
        "--tax-report-id",
        report.taxReport.taxReportId,
      ]),
    ) as Array<{ taxReportPaymentLinkId: string }>;
    expect(listed).toEqual([
      expect.objectContaining({
        taxReportPaymentLinkId: suggested.matches[0]!.taxReportPaymentLinkId,
      }),
    ]);

    const receiptPath = path.join(testDataDir, "tax-cli-receipt.pdf");
    fs.writeFileSync(receiptPath, "AEAT payment receipt");
    const receipt = JSON.parse(
      runCli([
        "tax-reports",
        "attach-receipt",
        report.taxReport.taxReportId,
        receiptPath,
        '{"kind":"tax_payment_receipt","source":"authority_portal_download","link":{"amount":"120.00","currency":"EUR","paymentReference":"AEAT-303-Q1-CLI-RECEIPT","status":"suggested"}}',
      ]),
    ) as { document: { kind: string }; paymentLink: { status: string } };
    expect(receipt).toEqual(
      expect.objectContaining({
        document: expect.objectContaining({ kind: "tax_payment_receipt" }),
        paymentLink: expect.objectContaining({ status: "suggested" }),
      }),
    );
  });
});
