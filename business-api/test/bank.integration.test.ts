import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { beforeEach, describe, expect, it } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");

async function resetTestState() {
  const { resetDatabase, initializeDatabase } = await import("../src/db/connection.js");
  resetDatabase();
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(path.join(testDataDir, "business-api.sqlite"), { force: true });
  fs.rmSync(path.join(testDataDir, "uploads"), { recursive: true, force: true });
  initializeDatabase();
}

async function setupCompany() {
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

describe("bank tracking", () => {
  beforeEach(async () => {
    await resetTestState();
    await setupCompany();
  });

  it("creates accounts, upserts duplicate transactions, records snapshots, and keeps rectifications visible", async () => {
    const {
      createBankAccount,
      createBankBalanceSnapshot,
      listBankBalanceSnapshots,
      listBankTransactions,
      upsertBankTransaction,
    } = await import("../src/services/bank.js");
    const { uploadDocument } = await import("../src/services/documents.js");

    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      ibanMasked: "ES76********1234",
      currency: "EUR",
      status: "active",
    });
    const screenshot = uploadDocument(
      {
        fieldname: "file",
        originalname: "bank-screenshot.png",
        encoding: "7bit",
        mimetype: "image/png",
        size: 10,
        buffer: Buffer.from("image-data"),
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      { kind: "bank_screenshot", source: "slack" },
    );

    const first = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-29",
      amount: "-340,01",
      currency: "EUR",
      description: "Adeudo A Su Cargo",
      reference: "N 2026119000849489 Gestalea Barcelona",
      runningBalance: "7.809,90",
      source: "slack_screenshot",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
      documentId: screenshot.documentId,
    });
    const second = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-29",
      amount: "-340.01",
      currency: "EUR",
      description: "Adeudo A Su Cargo",
      reference: "N 2026119000849489 Gestalea Barcelona",
      runningBalance: "7809.90",
      source: "slack_screenshot",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
      documentId: screenshot.documentId,
    });

    expect(first.action).toBe("created");
    expect(second.action).toBe("updated");
    expect(second.transaction.amount).toBe("-340.01");
    expect(second.transaction.runningBalance).toBe("7809.90");

    createBankBalanceSnapshot({
      bankAccountId: account.bankAccountId,
      observedAt: "2026-04-29T13:36:00+02:00",
      balance: "7.809,90",
      currency: "EUR",
      source: "slack_screenshot",
      confidence: "high",
      documentId: screenshot.documentId,
    });
    upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-01",
      amount: "1000",
      currency: "EUR",
      description: "Opening balance",
      source: "manual",
      confidence: "high",
      kind: "opening_balance",
      status: "recorded",
    });

    expect(listBankBalanceSnapshots({ bankAccountId: account.bankAccountId })).toHaveLength(1);
    await expect(listBankTransactions({ bankAccountId: account.bankAccountId })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "bank_transaction" }),
        expect.objectContaining({ kind: "opening_balance" }),
      ]),
    );
  });

  it("auto-confirms a single exact sales invoice match and marks the invoice paid", async () => {
    const { createContact } = await import("../src/services/contacts.js");
    const { importSalesInvoice, getSalesInvoice } = await import("../src/services/sales-invoices.js");
    const { createBankAccount, matchBankTransaction, upsertBankTransaction } = await import("../src/services/bank.js");

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
    });
    const invoice = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "2026-0041",
      issueDate: "2026-04-02",
      dueDate: "2026-04-29",
      currency: "EUR",
      totals: { net: "1000.00", tax: "210.00", gross: "1210.00" },
      status: "finalized",
    });
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const transaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-29",
      amount: "1210.00",
      currency: "EUR",
      description: "Transfer invoice 2026-0041",
      reference: "2026-0041",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    expect(matchBankTransaction(transaction.bankTransactionId)).toEqual(
      expect.objectContaining({
        autoConfirmed: true,
        matches: [expect.objectContaining({ targetId: invoice.salesInvoiceId, status: "confirmed" })],
      }),
    );
    expect(getSalesInvoice(invoice.salesInvoiceId).status).toBe("paid");
  });

  it("creates suggestions for ambiguous same-amount matches without mutating accounting records", async () => {
    const { createContact } = await import("../src/services/contacts.js");
    const { importSalesInvoice, getSalesInvoice } = await import("../src/services/sales-invoices.js");
    const { createBankAccount, matchBankTransaction, upsertBankTransaction } = await import("../src/services/bank.js");

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
    });
    const first = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "2026-0101",
      issueDate: "2026-04-01",
      dueDate: "2026-04-20",
      currency: "EUR",
      totals: { net: "100.00", tax: "21.00", gross: "121.00" },
      status: "finalized",
    });
    const second = importSalesInvoice({
      customerContactId: customer.contactId,
      invoiceNumber: "2026-0102",
      issueDate: "2026-04-01",
      dueDate: "2026-04-20",
      currency: "EUR",
      totals: { net: "100.00", tax: "21.00", gross: "121.00" },
      status: "finalized",
    });
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const transaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-21",
      amount: "121.00",
      currency: "EUR",
      description: "Card settlement",
      confidence: "medium",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    const result = matchBankTransaction(transaction.bankTransactionId);
    expect(result.autoConfirmed).toBe(false);
    expect(result.matches).toHaveLength(2);
    expect(result.matches).toEqual([
      expect.objectContaining({ status: "suggested" }),
      expect.objectContaining({ status: "suggested" }),
    ]);
    expect(getSalesInvoice(first.salesInvoiceId).status).toBe("finalized");
    expect(getSalesInvoice(second.salesInvoiceId).status).toBe("finalized");
  });

  it("matches outgoing expense and payroll debits using signed amounts", async () => {
    const { createContact } = await import("../src/services/contacts.js");
    const { createExpense, getExpense } = await import("../src/services/expenses.js");
    const { createPayroll, getPayroll } = await import("../src/services/payrolls.js");
    const { createBankAccount, matchBankTransaction, upsertBankTransaction } = await import("../src/services/bank.js");

    const supplier = createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
    });
    const employee = createContact({
      type: "person",
      status: "active",
      roles: ["employee"],
      displayName: "Marta Operator",
    });
    const expense = createExpense({
      supplierContactId: supplier.contactId,
      invoiceNumber: "FC-2026-0042",
      invoiceDate: "2026-04-20",
      currency: "EUR",
      totals: { net: "120.00", tax: "25.20", gross: "145.20" },
      status: "recorded",
    });
    const payroll = createPayroll({
      employeeContactId: employee.contactId,
      payrollNumber: "NOM-2026-04",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      paymentDate: "2026-04-29",
      currency: "EUR",
      grossSalary: "3000.00",
      netSalary: "2310.00",
      employeeTaxWithheld: "345.00",
      employeeSocialContributions: "210.00",
      employerSocialContributions: "690.00",
      otherDeductions: "135.00",
      otherEarnings: "0.00",
      status: "recorded",
    });
    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });

    const expenseTransaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-20",
      amount: "-145.20",
      currency: "EUR",
      description: "Pago factura FC-2026-0042",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;
    const payrollTransaction = upsertBankTransaction({
      bankAccountId: account.bankAccountId,
      transactionDate: "2026-04-29",
      amount: "-2310.00",
      currency: "EUR",
      description: "Nomina NOM-2026-04",
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
    }).transaction;

    expect(matchBankTransaction(expenseTransaction.bankTransactionId).autoConfirmed).toBe(true);
    expect(matchBankTransaction(payrollTransaction.bankTransactionId).autoConfirmed).toBe(true);
    expect(getExpense(expense.expenseId).status).toBe("paid");
    expect(getPayroll(payroll.payrollId).status).toBe("paid");
  });

  it("parses CSV exports and imports rows through idempotent upserts", async () => {
    const { parseBankCsvRows } = await import("../src/lib/bank-csv.js");
    const { createBankAccount, importBankTransactionsFromRows } = await import("../src/services/bank.js");

    const account = createBankAccount({
      bankName: "BBVA",
      displayName: "Main EUR account",
      currency: "EUR",
      status: "active",
    });
    const csv = [
      "Date,Amount,Description,Reference,Balance",
      "29/04/2026,\"-340,01\",Adeudo A Su Cargo,N 2026119000849489,\"7.809,90\"",
      "20/04/2026,\"-5.953,35\",Cargo Por Pago De Impuestos,Nrc. 1117658647630Ce3Eg367Y,\"8.149,91\"",
    ].join("\n");

    const rows = parseBankCsvRows(csv, {
      dateColumn: "Date",
      amountColumn: "Amount",
      descriptionColumn: "Description",
      referenceColumn: "Reference",
      balanceColumn: "Balance",
      defaultCurrency: "EUR",
      source: "bank_csv",
    });
    expect(rows).toEqual([
      expect.objectContaining({ transactionDate: "2026-04-29", amount: "-340.01", runningBalance: "7809.90" }),
      expect.objectContaining({ transactionDate: "2026-04-20", amount: "-5953.35", runningBalance: "8149.91" }),
    ]);

    const first = importBankTransactionsFromRows(account.bankAccountId, rows, { source: "bank_csv" });
    const second = importBankTransactionsFromRows(account.bankAccountId, rows, { source: "bank_csv" });
    expect(first.created).toBe(2);
    expect(second.updated).toBe(2);
  });

  it("supports CLI account, transaction, list, and CSV import smoke flows", () => {
    const account = JSON.parse(
      runCli([
        "bank-accounts",
        "create",
        '{"bankName":"BBVA","displayName":"Main EUR account","currency":"EUR"}',
      ]),
    ) as { bankAccountId: string };

    const upsert = JSON.parse(
      runCli([
        "bank-transactions",
        "upsert",
        `{"bankAccountId":"${account.bankAccountId}","transactionDate":"2026-04-29","amount":"-340,01","currency":"EUR","description":"Adeudo A Su Cargo","reference":"N 2026119000849489","confidence":"high","kind":"bank_transaction","status":"recorded"}`,
      ]),
    ) as { action: string; transaction: { bankTransactionId: string } };
    expect(upsert.action).toBe("created");

    const listed = JSON.parse(
      runCli(["bank-transactions", "list", "--bank-account-id", account.bankAccountId]),
    ) as Array<{ bankTransactionId: string }>;
    expect(listed).toEqual([expect.objectContaining({ bankTransactionId: upsert.transaction.bankTransactionId })]);

    const csvPath = path.join(testDataDir, "bank-cli.csv");
    fs.writeFileSync(csvPath, "Date,Amount,Description\n29/04/2026,\"-340,01\",Adeudo A Su Cargo\n");
    const imported = JSON.parse(
      runCli([
        "bank-imports",
        "csv",
        account.bankAccountId,
        csvPath,
        '{"dateColumn":"Date","amountColumn":"Amount","descriptionColumn":"Description","defaultCurrency":"EUR"}',
      ]),
    ) as { created: number; updated: number };
    expect(imported.created).toBe(1);
  });
});
