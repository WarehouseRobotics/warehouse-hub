import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { and, eq } from "drizzle-orm";
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

async function uploadTaxDocument(contents = "modelo 303", companyCardId?: string) {
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
      companyCardId,
      source: "accountant_upload",
    },
  );
}

async function createAdditionalCompanyCard() {
  const { getOrm } = await import("../src/db/connection.js");
  const { companyCard } = await import("../src/db/schema/index.js");
  const now = new Date().toISOString();
  getOrm()
    .insert(companyCard)
    .values({
      id: "comp_other_001",
      slug: "other-company-card",
      legalName: "Other Robotics SL",
      displayName: "Other Robotics",
      taxId: "B87654321",
      vatId: null,
      email: null,
      phone: null,
      website: null,
      addressStreet1: "Calle Mayor 1",
      addressStreet2: null,
      addressCity: "Madrid",
      addressPostalCode: "28013",
      addressCountryCode: "ES",
      currency: "EUR",
      paymentTermsDays: 30,
      vatMode: "standard",
      bankIbanMasked: null,
      bankBic: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return { companyId: "comp_other_001" };
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

function fact(fieldCode: string, rawValue: string, direction = "informational") {
  return {
    fieldCode,
    fieldSystem: "casilla" as const,
    label: `Casilla ${fieldCode}`,
    valueType: "money" as const,
    rawValue,
    normalizedValue: rawValue,
    currency: "EUR",
    direction: direction as
      | "payable"
      | "deductible"
      | "credit"
      | "refund"
      | "informational",
    confidence: "high" as const,
  };
}

function modelo130TaxReportInput(
  companyCardId: string,
  documentId: string,
  options: {
    periodLabel?: string;
    periodStart?: string;
    periodEnd?: string;
    fiscalYear?: number;
    income?: string;
    expenses?: string;
    net?: string;
    retentions?: string;
    resultAmount?: string;
    carryforwardAmount?: string;
  } = {},
) {
  const periodLabel = options.periodLabel ?? "2026-Q2";
  const resultAmount = options.resultAmount ?? "1200.00";

  return {
    companyCardId,
    documentId,
    countryCode: "ES",
    taxKind: "personal_income" as const,
    formCode: "130",
    formName: "Modelo 130",
    formVersion: null,
    fiscalYear: options.fiscalYear ?? 2026,
    periodGranularity: "quarter" as const,
    periodLabel,
    periodStart: options.periodStart ?? "2026-04-01",
    periodEnd: options.periodEnd ?? "2026-06-30",
    taxpayerTaxId: "B12345678",
    authoritySubmissionId: `AEAT-130-${periodLabel}-${documentId}`,
    authorityReceiptNumber: null,
    filedAt: "2026-07-15T10:30:00.000Z",
    dueDate: "2026-07-20",
    paymentDueDate: "2026-07-20",
    status: "filed" as const,
    result: Number.parseFloat(resultAmount) > 0 ? "payable" as const : "compensate" as const,
    paymentStatus: Number.parseFloat(resultAmount) > 0 ? "unpaid" as const : "not_required" as const,
    currency: "EUR",
    taxableBase: null,
    taxDue: null,
    taxDeductible: null,
    resultAmount,
    retainedAmount: options.retentions ?? "400.00",
    profitOrLoss: options.net ?? "8000.00",
    confidence: "high" as const,
    extractedData: {
      casillas: {
        "01": options.income ?? "24000.00",
        "02": options.expenses ?? "16000.00",
        "03": options.net ?? "8000.00",
        "06": options.retentions ?? "400.00",
        "19": resultAmount,
      },
    },
    warnings: [],
    correctionOfTaxReportId: null,
    facts: [
      fact("01", options.income ?? "24000.00"),
      fact("02", options.expenses ?? "16000.00", "deductible"),
      fact("03", options.net ?? "8000.00"),
      fact("06", options.retentions ?? "400.00", "credit"),
      fact("19", resultAmount, Number.parseFloat(resultAmount) > 0 ? "payable" : "credit"),
    ],
    carryforwards: options.carryforwardAmount
      ? [
          {
            kind: "installment_credit" as const,
            currency: "EUR",
            originalAmount: options.carryforwardAmount,
            usedAmount: "0.00",
            remainingAmount: options.carryforwardAmount,
            expiresAt: "2026-12-31",
            status: "active" as const,
            notes: "Modelo 130 same-year negative payment result to deduct",
          },
        ]
      : [],
  };
}

function modelo200TaxReportInput(
  companyCardId: string,
  documentId: string,
  options: {
    accountingResult?: string;
    preCompensationTaxableBase?: string;
    priorNegativeBaseApplied?: string;
    taxableBase?: string;
    resultAmount?: string;
    taxLossRemaining?: string;
    fiscalYear?: number;
    status?: "filed" | "needs_review";
  } = {},
) {
  const fiscalYear = options.fiscalYear ?? 2026;
  const taxableBase = options.taxableBase ?? "9000.00";
  const resultAmount = options.resultAmount ?? "1800.00";

  return {
    companyCardId,
    documentId,
    countryCode: "ES",
    taxKind: "corporate_income" as const,
    formCode: "200",
    formName: "Modelo 200",
    formVersion: null,
    fiscalYear,
    periodGranularity: "year" as const,
    periodLabel: String(fiscalYear),
    periodStart: `${fiscalYear}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    taxpayerTaxId: "B12345678",
    authoritySubmissionId: `AEAT-200-${fiscalYear}-${documentId}`,
    authorityReceiptNumber: null,
    filedAt: `${fiscalYear + 1}-07-15T10:30:00.000Z`,
    dueDate: `${fiscalYear + 1}-07-25`,
    paymentDueDate: `${fiscalYear + 1}-07-25`,
    status: options.status ?? "filed",
    result: Number.parseFloat(resultAmount) > 0 ? "payable" as const : "zero" as const,
    paymentStatus: Number.parseFloat(resultAmount) > 0 ? "unpaid" as const : "not_required" as const,
    currency: "EUR",
    taxableBase,
    taxDue: null,
    taxDeductible: null,
    resultAmount,
    retainedAmount: null,
    profitOrLoss: taxableBase,
    confidence: options.status === "needs_review" ? "medium" as const : "high" as const,
    extractedData: {
      casillas: {
        "00500": options.accountingResult ?? "10000.00",
        "00550": options.preCompensationTaxableBase ?? "10000.00",
        "00547": options.priorNegativeBaseApplied ?? "1000.00",
        "00552": taxableBase,
        "01586": resultAmount,
      },
    },
    warnings: options.status === "needs_review" ? ["model_200_negative_base_detail_missing"] : [],
    correctionOfTaxReportId: null,
    facts: [
      fact("00500", options.accountingResult ?? "10000.00"),
      fact("00550", options.preCompensationTaxableBase ?? "10000.00"),
      fact("00547", options.priorNegativeBaseApplied ?? "1000.00", "credit"),
      fact("00552", taxableBase),
      fact("01586", resultAmount, Number.parseFloat(resultAmount) > 0 ? "payable" : "informational"),
    ],
    carryforwards: options.taxLossRemaining
      ? [
          {
            kind: "tax_loss" as const,
            currency: "EUR",
            originalAmount: options.taxLossRemaining,
            usedAmount: options.priorNegativeBaseApplied ?? "0.00",
            remainingAmount: options.taxLossRemaining,
            expiresAt: null,
            status: options.status === "needs_review" ? "needs_review" as const : "active" as const,
            notes: "Modelo 200 negative taxable base detail",
          },
        ]
      : [],
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

  it("soft deletes report-owned artifacts while preserving source and evidence documents", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("deletable declaration");
    const receipt = await uploadTaxReceipt("preserved payment receipt");
    const {
      createTaxReport,
      createTaxReportPaymentLink,
      listTaxCarryforwards,
      listTaxReportPaymentLinks,
      listTaxReports,
      softDeleteTaxReport,
    } = await import("../src/services/tax-reports.js");
    const { getDocumentMeta } = await import("../src/services/documents.js");
    const { getOrm } = await import("../src/db/connection.js");
    const { taxCarryforwards, taxReportPaymentLinks, taxReports } =
      await import("../src/db/schema/index.js");

    const report = createTaxReport(
      baseTaxReportInput(company.companyId, document.documentId),
    );
    const paymentLink = createTaxReportPaymentLink({
      taxReportId: report.taxReport.taxReportId,
      documentId: receipt.documentId,
      amount: "10.00",
      currency: "EUR",
      paidAt: "2026-04-20",
      paymentReference: "AEAT-303-Q1-DELETE",
      status: "suggested",
      confidence: "high",
    });

    expect(listTaxCarryforwards({ includeSuperseded: true })).toEqual([
      expect.objectContaining({ originTaxReportId: report.taxReport.taxReportId }),
    ]);
    expect(listTaxReportPaymentLinks()).toEqual([
      expect.objectContaining({
        taxReportPaymentLinkId: paymentLink.taxReportPaymentLinkId,
      }),
    ]);

    softDeleteTaxReport(report.taxReport.taxReportId);

    expect(await listTaxReports()).toEqual([]);
    expect(listTaxCarryforwards({ includeSuperseded: true })).toEqual([]);
    expect(listTaxReportPaymentLinks()).toEqual([]);
    expect(getDocumentMeta(document.documentId).documentId).toBe(document.documentId);
    expect(getDocumentMeta(receipt.documentId).documentId).toBe(receipt.documentId);

    const reportRow = getOrm()
      .select()
      .from(taxReports)
      .where(eq(taxReports.id, report.taxReport.taxReportId))
      .get();
    const carryforwardRow = getOrm()
      .select()
      .from(taxCarryforwards)
      .where(
        eq(taxCarryforwards.originTaxReportId, report.taxReport.taxReportId),
      )
      .get();
    const paymentLinkRow = getOrm()
      .select()
      .from(taxReportPaymentLinks)
      .where(
        eq(
          taxReportPaymentLinks.id,
          paymentLink.taxReportPaymentLinkId,
        ),
      )
      .get();

    expect(reportRow?.deletedAt).toBeTruthy();
    expect(carryforwardRow?.deletedAt).toBe(reportRow?.deletedAt);
    expect(paymentLinkRow?.deletedAt).toBe(reportRow?.deletedAt);
  });

  it("builds the latest Spanish VAT position without summing stale period carryforwards", async () => {
    const company = await createCompanyCard();
    const q1Document = await uploadTaxDocument("q1 vat position");
    const q2Document = await uploadTaxDocument("q2 vat position");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    createTaxReport(
      baseTaxReportInput(company.companyId, q1Document.documentId),
    );
    const q2 = createTaxReport({
      ...baseTaxReportInput(company.companyId, q2Document.documentId),
      periodLabel: "2026-Q2",
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      authoritySubmissionId: "AEAT-303-Q2-POSITION",
      resultAmount: "-220.00",
      carryforwards: [
        {
          kind: "vat_credit",
          currency: "EUR",
          originalAmount: "220.00",
          usedAmount: "0.00",
          remainingAmount: "220.00",
          expiresAt: null,
          status: "active",
          notes: "Latest Modelo 303 compensation balance",
        },
      ],
    });

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }),
    ).toEqual(
      expect.objectContaining({
        vat: expect.objectContaining({
          latestPeriodLabel: "2026-Q2",
          latestTaxReportId: q2.taxReport.taxReportId,
          remainingVatCredit: "220.00",
        }),
        warnings: [],
        confidence: "high",
      }),
    );
  });

  it("does not expose a zero refund request as pending Spanish VAT money", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("zero refund vat position");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    const report = createTaxReport({
      ...baseTaxReportInput(company.companyId, document.documentId),
      result: "refund_requested",
      paymentStatus: "not_required",
      resultAmount: "0.00",
      authoritySubmissionId: "AEAT-303-Q1-ZERO-REFUND",
      carryforwards: [],
    });

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }).vat,
    ).toEqual(
      expect.objectContaining({
        latestTaxReportId: report.taxReport.taxReportId,
        refundRequested: null,
      }),
    );
  });

  it("includes draft extracted Spanish VAT reports with reduced confidence", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("draft extracted vat position");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    const report = createTaxReport({
      ...baseTaxReportInput(company.companyId, document.documentId),
      status: "draft_extracted",
      confidence: "medium",
      authoritySubmissionId: "AEAT-303-Q1-DRAFT-EXTRACTED",
    });
    const position = getSpainTaxPosition({
      companyCardId: company.companyId,
      fiscalYear: 2026,
    });

    expect(position.vat).toEqual(
      expect.objectContaining({
        latestTaxReportId: report.taxReport.taxReportId,
      }),
    );
    expect(position.warnings).not.toContain("missing_model_303_for_vat_position");
    expect(position.confidence).toEqual("medium");
  });

  it("ignores same-form Spanish reports with the wrong tax kind", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("misclassified 303 position");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    createTaxReport({
      ...baseTaxReportInput(company.companyId, document.documentId),
      taxKind: "other",
      authoritySubmissionId: "AEAT-303-Q1-MISCLASSIFIED",
    });
    const position = getSpainTaxPosition({
      companyCardId: company.companyId,
      fiscalYear: 2026,
    });

    expect(position.vat).toBeUndefined();
    expect(position.warnings).toContain("missing_model_303_for_vat_position");
  });

  it("prints the Spanish tax-position summary from the CLI", { timeout: 15000 }, async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("cli spain position");
    const { createTaxReport } = await import("../src/services/tax-reports.js");

    const report = createTaxReport(
      payableTaxReportInput(company.companyId, document.documentId),
    );
    const position = JSON.parse(
      runCli([
        "tax-reports",
        "spain-position",
        "--company-card-id",
        company.companyId,
        "--fiscal-year",
        "2026",
      ]),
    ) as { vat: { latestTaxReportId: string; resultAmount: string } };

    expect(position.vat).toEqual(
      expect.objectContaining({
        latestTaxReportId: report.taxReport.taxReportId,
        resultAmount: "120.00",
      }),
    );
  });

  it("summarizes Modelo 130 profit/loss without creating future-year tax loss carryforwards", async () => {
    const company = await createCompanyCard();
    const positiveDocument = await uploadTaxDocument("modelo 130 positive result");
    const negativeDocument = await uploadTaxDocument("modelo 130 negative result");
    const { createTaxReport, getSpainTaxPosition, listTaxCarryforwards } =
      await import("../src/services/tax-reports.js");

    createTaxReport(
      modelo130TaxReportInput(company.companyId, positiveDocument.documentId, {
        periodLabel: "2026-Q1",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
      }),
    );
    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }).autonomoIrpf,
    ).toEqual(
      expect.objectContaining({
        ytdNetProfitOrLoss: "8000.00",
        installmentResult: "1200.00",
        negativeToDeductSameYear: null,
      }),
    );

    const report = createTaxReport(
      modelo130TaxReportInput(company.companyId, negativeDocument.documentId, {
        income: "9000.00",
        expenses: "10500.00",
        net: "-1500.00",
        retentions: "300.00",
        resultAmount: "-300.00",
        carryforwardAmount: "300.00",
      }),
    );
    const position = getSpainTaxPosition({
      companyCardId: company.companyId,
      fiscalYear: 2026,
    });

    expect(position.autonomoIrpf).toEqual(
      expect.objectContaining({
        latestTaxReportId: report.taxReport.taxReportId,
        ytdIncome: "9000.00",
        ytdExpenses: "10500.00",
        ytdNetProfitOrLoss: "-1500.00",
        retentions: "300.00",
        installmentResult: "-300.00",
        negativeToDeductSameYear: "300.00",
      }),
    );
    expect(listTaxCarryforwards({ kind: "tax_loss" })).toEqual([]);
  });

  it("keeps earlier same-year Modelo 130 installment credits visible", async () => {
    const company = await createCompanyCard();
    const q1Document = await uploadTaxDocument("modelo 130 q1 credit");
    const q2Document = await uploadTaxDocument("modelo 130 q2 payable");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    createTaxReport(
      modelo130TaxReportInput(company.companyId, q1Document.documentId, {
        periodLabel: "2026-Q1",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        income: "9000.00",
        expenses: "10500.00",
        net: "-1500.00",
        resultAmount: "-300.00",
        carryforwardAmount: "300.00",
      }),
    );
    const q2 = createTaxReport(
      modelo130TaxReportInput(company.companyId, q2Document.documentId, {
        periodLabel: "2026-Q2",
        periodStart: "2026-04-01",
        periodEnd: "2026-06-30",
        resultAmount: "500.00",
      }),
    );

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }).autonomoIrpf,
    ).toEqual(
      expect.objectContaining({
        latestTaxReportId: q2.taxReport.taxReportId,
        installmentResult: "500.00",
        negativeToDeductSameYear: "300.00",
      }),
    );
  });

  it("falls back to raw money facts when legacy normalized values are empty", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("modelo 130 legacy empty fact");
    const { getOrm } = await import("../src/db/connection.js");
    const { taxReportFacts } = await import("../src/db/schema/index.js");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    const report = createTaxReport(
      modelo130TaxReportInput(company.companyId, document.documentId),
    );
    getOrm()
      .update(taxReportFacts)
      .set({ normalizedValue: "" })
      .where(
        and(
          eq(taxReportFacts.taxReportId, report.taxReport.taxReportId),
          eq(taxReportFacts.fieldCode, "01"),
        ),
      )
      .run();

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }).autonomoIrpf,
    ).toEqual(
      expect.objectContaining({
        ytdIncome: "24000.00",
      }),
    );
  });

  it("warns when Spanish personal and corporate income profiles coexist in the same year", async () => {
    const company = await createCompanyCard();
    const modelo130Document = await uploadTaxDocument("modelo 130 mixed");
    const modelo200Document = await uploadTaxDocument("modelo 200 mixed");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    createTaxReport(
      modelo130TaxReportInput(company.companyId, modelo130Document.documentId),
    );
    createTaxReport(
      modelo200TaxReportInput(company.companyId, modelo200Document.documentId),
    );

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }).warnings,
    ).toContain("mixed_spanish_income_tax_profiles");
  });

  it("summarizes Modelo 200 taxable-base position and compensable tax losses", async () => {
    const company = await createCompanyCard();
    const document = await uploadTaxDocument("modelo 200 corporate position");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    const report = createTaxReport(
      modelo200TaxReportInput(company.companyId, document.documentId, {
        accountingResult: "12000.00",
        preCompensationTaxableBase: "11000.00",
        priorNegativeBaseApplied: "2000.00",
        taxableBase: "9000.00",
        taxLossRemaining: "4000.00",
      }),
    );

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }).corporateIncome,
    ).toEqual(
      expect.objectContaining({
        latestFiscalYear: 2026,
        latestTaxReportId: report.taxReport.taxReportId,
        accountingResult: "12000.00",
        preCompensationTaxableBase: "11000.00",
        priorNegativeBaseApplied: "2000.00",
        taxableBase: "9000.00",
        currentYearProfitOrLoss: "12000.00",
        remainingCompensableNegativeBase: "4000.00",
      }),
    );
  });

  it("carries prior-year Modelo 200 tax losses into later Spanish positions", async () => {
    const company = await createCompanyCard();
    const lossDocument = await uploadTaxDocument("modelo 200 prior loss");
    const profitDocument = await uploadTaxDocument("modelo 200 later profit");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    createTaxReport(
      modelo200TaxReportInput(company.companyId, lossDocument.documentId, {
        fiscalYear: 2024,
        accountingResult: "-10000.00",
        preCompensationTaxableBase: "-10000.00",
        priorNegativeBaseApplied: "0.00",
        taxableBase: "-10000.00",
        resultAmount: "0.00",
        taxLossRemaining: "10000.00",
      }),
    );
    const profitReport = createTaxReport(
      modelo200TaxReportInput(company.companyId, profitDocument.documentId, {
        fiscalYear: 2025,
        accountingResult: "12000.00",
        preCompensationTaxableBase: "12000.00",
        priorNegativeBaseApplied: "0.00",
        taxableBase: "12000.00",
      }),
    );

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2025,
      }).corporateIncome,
    ).toEqual(
      expect.objectContaining({
        latestTaxReportId: profitReport.taxReport.taxReportId,
        currentYearProfitOrLoss: "12000.00",
        remainingCompensableNegativeBase: "10000.00",
      }),
    );
  });

  it("reports evidence-based Spanish tax-position warnings and confidence", async () => {
    const company = await createCompanyCard();
    const modelo130Document = await uploadTaxDocument("modelo 130 history");
    const modelo200Document = await uploadTaxDocument("modelo 200 current");
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    createTaxReport(
      modelo130TaxReportInput(company.companyId, modelo130Document.documentId, {
        periodLabel: "2025-Q4",
        periodStart: "2025-10-01",
        periodEnd: "2025-12-31",
        fiscalYear: 2025,
      }),
    );
    createTaxReport(
      modelo200TaxReportInput(company.companyId, modelo200Document.documentId, {
        taxableBase: "-5000.00",
        resultAmount: "0.00",
        taxLossRemaining: "5000.00",
        status: "needs_review",
      }),
    );

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }),
    ).toEqual(
      expect.objectContaining({
        corporateIncome: expect.objectContaining({
          taxableBase: "-5000.00",
          remainingCompensableNegativeBase: "5000.00",
        }),
        warnings: [
          "missing_model_303_for_vat_position",
          "missing_model_130_for_autonomo_profile",
        ],
        confidence: "medium",
      }),
    );
  });

  it("keeps Spanish tax positions scoped to the requested company card", async () => {
    const company = await createCompanyCard();
    const otherCompany = await createAdditionalCompanyCard();
    const companyDocument = await uploadTaxDocument("company q1", company.companyId);
    const otherDocument = await uploadTaxDocument("other q4", otherCompany.companyId);
    const { createTaxReport, getSpainTaxPosition } =
      await import("../src/services/tax-reports.js");

    const companyReport = createTaxReport(
      baseTaxReportInput(company.companyId, companyDocument.documentId),
    );
    createTaxReport({
      ...baseTaxReportInput(otherCompany.companyId, otherDocument.documentId),
      periodLabel: "2026-Q4",
      periodStart: "2026-10-01",
      periodEnd: "2026-12-31",
      taxpayerTaxId: "B87654321",
      authoritySubmissionId: "AEAT-303-Q4-OTHER-COMPANY",
      resultAmount: "-999.00",
      carryforwards: [
        {
          kind: "vat_credit",
          currency: "EUR",
          originalAmount: "999.00",
          usedAmount: "0.00",
          remainingAmount: "999.00",
          expiresAt: null,
          status: "active",
          notes: "Other company balance",
        },
      ],
    });

    expect(
      getSpainTaxPosition({
        companyCardId: company.companyId,
        fiscalYear: 2026,
      }).vat,
    ).toEqual(
      expect.objectContaining({
        latestTaxReportId: companyReport.taxReport.taxReportId,
        remainingVatCredit: "180.00",
      }),
    );
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
