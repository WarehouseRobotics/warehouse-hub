---
type: feature-spec
description: Tax declaration ingestion, indexing, payment linking, and carry-forward tracking for the Business API
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/apps/business-api/banking.md
  - docs/apps/business-api/runs/2026-04-07 Expense and Sales Invoices Upload.plan.md
  - docs/tax-reports/spain.md
  - docs/tax-reports/portugal.md
  - docs/tax-reports/germany.md
  - docs/tax-reports/italy.md
  - packages/business-schemas/src/document.ts
---

# Tax Reports and Declarations Ingest

## Purpose

Tax reports support filed tax declaration tracking for the Business API accounting stack.

The goal is not to calculate or submit taxes automatically. The goal is to ingest filed declarations and official payment evidence, store them as audit records, extract normalized facts, index the OCR text, and expose enough structured state for accounting agents to answer questions such as:

* what was declared for a tax period
* whether the declaration was payable, refundable, compensable, zero, or no-activity
* which bank transactions or receipts prove payment
* which losses, profits, retentions, VAT credits, or other balances carry forward into future periods

Tax declarations are authoritative historical snapshots over operational records such as sales invoices, expenses, payrolls, bank transactions, and documents. They do not replace those records and must not mutate them during ingest.

Spain is the first implementation target. Portugal, Germany, and Italy shape the shared model so the first schema does not become Spain-only.

## Scope

Implemented v1 should cover:

* uploading and ingesting tax declaration PDFs or images
* uploading tax payment receipts and authority notices as evidence
* OCR and extracted metadata storage through the existing document ingestion pattern
* deterministic tax report fingerprinting for idempotent retries
* tax report create/list/get/search APIs
* normalized form facts for authority field codes and labels
* carry-forward records for declared losses, profits, credits, and retentions
* payment links to bank transactions and tax payment receipt documents
* CLI support for agent workflows

Out of scope for v1:

* electronic tax filing
* tax authority API integrations
* legal tax calculation or advisory rules
* automatic amendment submission
* automatic changes to expenses, sales invoices, payrolls, or bank transactions
* dashboard UI
* MCP tools

## Country Specs

Country-specific rules must live in separate specs and implementation modules:

* Spain: [docs/tax-reports/spain.md](/Users/denis/src/warehouse-hub/docs/tax-reports/spain.md)
* Portugal: [docs/tax-reports/portugal.md](/Users/denis/src/warehouse-hub/docs/tax-reports/portugal.md)
* Germany: [docs/tax-reports/germany.md](/Users/denis/src/warehouse-hub/docs/tax-reports/germany.md)
* Italy: [docs/tax-reports/italy.md](/Users/denis/src/warehouse-hub/docs/tax-reports/italy.md)

The top-level spec defines shared contracts and orchestration only. Country specs define official source anchors, form codes, period rules, extraction targets, result mapping, field-code systems, and carry-forward rules.

## Domain Model

### Document Kinds

Extend `document.kind` with tax-specific evidence kinds:

```ts
type TaxDocumentKind =
  | "tax_declaration"
  | "tax_payment_receipt"
  | "tax_authority_notice";
```

`tax_declaration` is the filed declaration or official return PDF.
`tax_payment_receipt` is proof of payment, such as AEAT payment confirmation, Portal das Finanças receipt, ELSTER payment/receipt evidence, Italian F24 receipt, or bank debit evidence.
`tax_authority_notice` is an official letter, correction notice, refund notice, or assessment notice.

All three kinds use the existing `documents` table for binary storage, checksum, OCR status, OCR text, extraction JSON, linked entity type, and linked entity ID.

### Tax Reports

Add a `tax_reports` table for one filed declaration snapshot.

```ts
type TaxKind =
  | "vat"
  | "corporate_income"
  | "personal_income"
  | "withholding"
  | "payroll_tax"
  | "local_business_tax"
  | "social_security"
  | "other";

type TaxReportStatus =
  | "draft_extracted"
  | "filed"
  | "amended"
  | "superseded"
  | "void"
  | "needs_review";

type TaxReportResult =
  | "payable"
  | "refund_requested"
  | "compensate"
  | "zero"
  | "no_activity"
  | "informational"
  | "unknown";

type TaxReportPaymentStatus =
  | "not_required"
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "refund_pending"
  | "refunded"
  | "unknown";

type TaxReport = {
  taxReportId: string;
  slug: string;
  companyCardId: string;
  documentId: string;
  countryCode: "ES" | "PT" | "DE" | "IT" | string;
  jurisdiction?: string | null;
  taxKind: TaxKind;
  formCode: string;
  formName?: string | null;
  formVersion?: string | null;
  fiscalYear: number;
  periodGranularity: "month" | "quarter" | "year" | "custom";
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  taxpayerTaxId?: string | null;
  authoritySubmissionId?: string | null;
  authorityReceiptNumber?: string | null;
  filedAt?: string | null;
  dueDate?: string | null;
  paymentDueDate?: string | null;
  status: TaxReportStatus;
  result: TaxReportResult;
  paymentStatus: TaxReportPaymentStatus;
  currency: string;
  taxableBase?: string | null;
  taxDue?: string | null;
  taxDeductible?: string | null;
  resultAmount?: string | null;
  retainedAmount?: string | null;
  profitOrLoss?: string | null;
  confidence: "low" | "medium" | "high";
  fingerprint: string;
  extractedData: unknown;
  warnings: string[];
  correctionOfTaxReportId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};
```

Rules:

* `countryCode`, `taxKind`, `formCode`, `periodStart`, `periodEnd`, and `currency` are required after ingest normalization.
* `jurisdiction` stores sub-country routing only when relevant, such as Spanish foral territory, German state, Italian region, or Portuguese mainland/autonomous-region context.
* `resultAmount` is signed from the company perspective: positive means payable, negative means refund or credit, zero means no net amount.
* `profitOrLoss` is signed from business profit perspective: positive means profit, negative means loss.
* `extractedData` keeps country-specific raw parse output and full OCR-derived fields.
* `warnings` capture parser uncertainty, missing authority references, period ambiguity, and country-specific unsupported sections.

### Tax Report Facts

Add `tax_report_facts` for normalized authority fields.

```ts
type TaxReportFact = {
  taxReportFactId: string;
  taxReportId: string;
  countryCode: string;
  formCode: string;
  fieldCode: string;
  fieldSystem: "box" | "casilla" | "campo" | "quadro" | "rigo" | "line" | "other";
  label?: string | null;
  valueType: "money" | "number" | "percent" | "date" | "text" | "boolean";
  rawValue: string;
  normalizedValue?: string | null;
  currency?: string | null;
  rate?: string | null;
  direction?: "payable" | "deductible" | "credit" | "refund" | "informational" | null;
  confidence: "low" | "medium" | "high";
  createdAt: string;
};
```

This table lets agents query and compare field-level declarations without knowing every country's full form schema. For Spain, `fieldSystem` should usually be `casilla`. For Portugal use `campo` or `quadro`. For Italy use `rigo` where the official form uses row identifiers. For Germany use `line`, `box`, or `other` depending on the ELSTER output.

### Tax Carryforwards

Add `tax_carryforwards` for balances that affect future declarations.

```ts
type TaxCarryforwardKind =
  | "tax_loss"
  | "profit_base"
  | "vat_credit"
  | "withholding_credit"
  | "installment_credit"
  | "refund_credit"
  | "other";

type TaxCarryforward = {
  taxCarryforwardId: string;
  companyCardId: string;
  countryCode: string;
  jurisdiction?: string | null;
  taxKind: TaxKind;
  kind: TaxCarryforwardKind;
  originTaxReportId: string;
  originFiscalYear: number;
  originPeriodLabel: string;
  currency: string;
  originalAmount: string;
  usedAmount: string;
  remainingAmount: string;
  expiresAt?: string | null;
  status: "active" | "used" | "expired" | "superseded" | "needs_review";
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Carryforwards are derived from declarations and corrections, not from operational invoice totals. If a corrective declaration supersedes a report, active carryforwards from the old report must be marked `superseded` and replaced by carryforwards derived from the corrective report.

### Payment Links

Add `tax_report_payment_links` to connect tax declarations to payment proof.

```ts
type TaxReportPaymentLink = {
  taxReportPaymentLinkId: string;
  taxReportId: string;
  bankTransactionId?: string | null;
  documentId?: string | null;
  amount: string;
  currency: string;
  paidAt?: string | null;
  paymentReference?: string | null;
  status: "suggested" | "confirmed" | "rejected";
  confidence: "low" | "medium" | "high";
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

The payment link table should follow the existing bank transaction matching pattern: suggestions are explicit records, humans or agents can confirm/reject them, and only confirmed links should drive `tax_reports.paymentStatus`.

## Ingestion Behavior

`POST /api/v1/tax-reports/ingest` should be a higher-level multipart workflow, parallel to document ingest.

The shared ingestion service must delegate country-specific parsing and normalization to a country module selected from `countryCode`, explicit form metadata, or OCR signals. Country modules should return the same normalized output contract, but own their local form names, field-code mappings, result states, and carry-forward interpretation.

Pipeline:

1. Validate multipart payload and JSON metadata.
2. Store the original file as `document.kind = "tax_declaration"` unless the caller supplies `tax_payment_receipt` or `tax_authority_notice`.
3. Set document OCR state to `processing`.
4. OCR image or PDF using the existing document ingestion engine.
5. Select the parser country module from explicit metadata first, otherwise from OCR signals.
6. Extract country, tax kind, form code, period, taxpayer tax ID, authority submission/reference number, result amounts, field facts, and carry-forward candidates.
7. Apply explicit overrides last, field by field.
8. Compute the report fingerprint.
9. If the fingerprint matches an existing tax report, do not overwrite the existing report. Link the newly uploaded document to the existing report as duplicate evidence and return the existing report with a duplicate warning.
10. If the metadata marks the declaration as corrective or amended, create a new tax report with `correctionOfTaxReportId` and mark the previous report `superseded` only when the caller identifies the previous report or the authority reference clearly proves replacement.
11. Persist tax report, facts, carryforwards, and document linkage in one service transaction after OCR/extraction succeeds.
12. Mark document OCR state as `completed`; on extraction failure keep the document with `ocrStatus = "failed"` and return a structured 422.
13. Schedule document and tax report embeddings from OCR text, normalized fields, form metadata, period, result, and authority reference.

Fingerprint inputs:

```ts
type TaxReportFingerprintInput = {
  companyCardId: string;
  countryCode: string;
  taxKind: TaxKind;
  formCode: string;
  periodStart: string;
  periodEnd: string;
  taxpayerTaxId?: string | null;
  authoritySubmissionId?: string | null;
  authorityReceiptNumber?: string | null;
};
```

If no authority submission or receipt reference can be extracted, the report should still be accepted but marked `needs_review`, with `confidence = "low"` or `medium`. The fingerprint may use the document checksum as a fallback only for idempotent retry protection; it must not be treated as legal proof that two filings are the same declaration.

## API

### Ingest Tax Report

`POST /api/v1/tax-reports/ingest`

Multipart fields:

* `file`: required image or PDF
* `kind`: optional document kind, default `tax_declaration`
* `countryCode`: optional but recommended; Spain v1 uses `ES`
* `taxKind`: optional
* `formCode`: optional
* `fiscalYear`: optional
* `periodLabel`: optional, for example `2026-Q1`, `2026-01`, or `2026`
* `source`: optional, for example `accountant_upload`, `slack_upload`, `authority_portal_download`
* `overrides`: optional JSON object

Override shape:

```json
{
  "countryCode": "ES",
  "taxKind": "vat",
  "formCode": "303",
  "periodGranularity": "quarter",
  "periodLabel": "2026-Q1",
  "periodStart": "2026-01-01",
  "periodEnd": "2026-03-31",
  "taxpayerTaxId": "B12345678",
  "authoritySubmissionId": "3032026Q1ABC123",
  "filedAt": "2026-04-15T10:30:00+02:00",
  "result": "payable",
  "currency": "EUR",
  "resultAmount": "1840.00",
  "correctionOfTaxReportId": "tr_000012"
}
```

Example response:

```json
{
  "taxReport": {
    "taxReportId": "tr_000123",
    "countryCode": "ES",
    "taxKind": "vat",
    "formCode": "303",
    "periodLabel": "2026-Q1",
    "status": "filed",
    "result": "payable",
    "paymentStatus": "unpaid",
    "currency": "EUR",
    "taxableBase": "12000.00",
    "taxDue": "2520.00",
    "taxDeductible": "680.00",
    "resultAmount": "1840.00",
    "confidence": "high"
  },
  "document": {
    "documentId": "doc_000456",
    "kind": "tax_declaration",
    "ocrStatus": "completed"
  },
  "facts": [
    {
      "fieldCode": "07",
      "fieldSystem": "casilla",
      "label": "Base imponible IVA general",
      "valueType": "money",
      "normalizedValue": "12000.00",
      "currency": "EUR"
    }
  ],
  "carryforwards": [],
  "warnings": []
}
```

### List Tax Reports

`GET /api/v1/tax-reports`

Supported query params:

* `countryCode`
* `taxKind`
* `formCode`
* `fiscalYear`
* `periodStart`
* `periodEnd`
* `status`
* `paymentStatus`
* `query`
* `similar`
* `limit`

List results should exclude soft-deleted reports and sort newest period first, then newest filing date.

### Get Tax Report

`GET /api/v1/tax-reports/:idOrSlug`

Returns:

* `taxReport`
* source `document`
* normalized `facts`
* `carryforwards`
* payment links
* linked bank transactions and payment receipt documents when requested by include params

Use `GET /api/v1/tax-reports/:idOrSlug?include=paymentEvidence` to hydrate linked bank transactions and receipt document metadata under `paymentEvidence`.

### Tax Report Payment Links

`GET /api/v1/tax-report-payment-links`

Supported query params:

* `taxReportId`
* `status`

`POST /api/v1/tax-report-payment-links`

Creates or updates an explicit payment evidence link. At least one evidence field is required: `bankTransactionId`, `documentId`, or `paymentReference`.

```json
{
  "taxReportId": "tr_000123",
  "bankTransactionId": "btx_000041",
  "amount": "1840.00",
  "currency": "EUR",
  "paidAt": "2026-04-20",
  "paymentReference": "AEAT-303-Q1",
  "status": "suggested",
  "confidence": "high",
  "reason": "Amount and tax reference matched"
}
```

`PATCH /api/v1/tax-report-payment-links/:idOrSlug`

Updates review state and reviewer notes:

```json
{
  "status": "confirmed",
  "confidence": "high",
  "reason": "Matched against AEAT payment receipt"
}
```

Payment link rules:

* suggested and rejected links never change `tax_reports.paymentStatus`
* confirmed links recompute payable reports to `partially_paid` or `paid`
* confirmed refund bank transactions recompute refund-requested reports to `refunded`
* changing a confirmed link back to `rejected` recomputes the report status downward

### Suggest Payment Links

`POST /api/v1/tax-reports/:idOrSlug/payment-links/suggest`

Scans recorded bank transactions for same-company tax payment or refund candidates by amount, currency, date window, authority/form/period text, and payment reference. Suggestions are stored as explicit `suggested` payment links and are not auto-confirmed.

### Upload Payment Receipt

`POST /api/v1/tax-reports/:idOrSlug/payment-receipts`

Multipart fields:

* `file`: required receipt or notice file
* `kind`: optional, `tax_payment_receipt` by default; `tax_authority_notice` is also accepted
* `source`: optional, for example `authority_portal_download` or `accountant_upload`
* `link`: required JSON payment-link payload without `taxReportId` or `documentId`

Example `link` field:

```json
{
  "amount": "1840.00",
  "currency": "EUR",
  "paidAt": "2026-04-20",
  "paymentReference": "AEAT-303-Q1",
  "status": "confirmed",
  "confidence": "high"
}
```

Receipt documents are stored as tax evidence and linked to the report. They prove payment only after the associated payment link is confirmed.

### List Carryforwards

`GET /api/v1/tax-carryforwards`

Supported query params:

* `countryCode`
* `taxKind`
* `kind`
* `status`
* `originFiscalYear`
* `includeSuperseded`

Default behavior should return active carryforwards only.

## CLI

Implemented tax report commands:

```bash
wrobo-biz tax-reports ingest ./tax/modelo-303-q4.pdf '{"kind":"tax_declaration","companyCardId":"comp_000123","countryCode":"ES","source":"accountant_upload","overrides":{"periodLabel":"2026-Q4"}}'
wrobo-biz tax-reports list --country-code ES --fiscal-year 2026
wrobo-biz tax-reports get tr_000123
wrobo-biz tax-reports suggest-payments tr_000123
wrobo-biz tax-reports attach-receipt tr_000123 ./tax/aeat-receipt.pdf '{"kind":"tax_payment_receipt","link":{"amount":"1840.00","currency":"EUR","paymentReference":"AEAT-303-Q1","status":"confirmed"}}'
wrobo-biz tax-report-payment-links list --tax-report-id tr_000123
wrobo-biz tax-report-payment-links create '{"taxReportId":"tr_000123","bankTransactionId":"btx_000041","amount":"1840.00","currency":"EUR","status":"suggested"}'
wrobo-biz tax-report-payment-links update trpl_000123 '{"status":"confirmed"}'
wrobo-biz tax-carryforwards list --country-code ES --status active
```

CLI output is JSON by default and includes stable IDs needed by agents.

`tax-reports ingest` is implemented in the remote `wrobo-biz` HTTP wrapper and uploads the file path from the host running the wrapper directly to `POST /api/v1/tax-reports/ingest`. It does not stage files into a Docker container tmp directory, and the raw in-container TypeScript CLI remains limited to report inspection and payment evidence workflows.

## Country Module Design

Do not mix country rules into the shared tax report service. Implement each country as an isolated module with the same interface, for example:

```ts
type TaxCountryModule = {
  countryCode: string;
  detect(input: TaxCountryDetectionInput): TaxCountryDetectionResult;
  parse(input: TaxCountryParseInput): TaxCountryParseResult;
  normalize(input: TaxCountryParseResult): NormalizedTaxReportDraft;
  buildCarryforwards(input: NormalizedTaxReportDraft): TaxCarryforwardDraft[];
};
```

Shared code may handle upload, OCR orchestration, persistence, embeddings, idempotency, search, and payment linking. Country modules own:

* form aliases and official form names
* period label parsing and fiscal calendar assumptions
* field-code systems such as `casilla`, `campo`, `quadro`, `rigo`, `line`, or `box`
* result mapping into shared `TaxReportResult`
* carry-forward interpretation
* country-specific warnings
* country-specific parser tests and fixtures

The implementation should support multiple company cards in different countries over time. Every tax report, carryforward, fact, and payment link must stay scoped by `companyCardId` and `countryCode`; never assume the workspace has only one tax jurisdiction. One company may also have cross-border evidence, so country detection should be per document/report, not global application state.

## Matching and Reconciliation

Tax report payment linking should reuse the bank matching philosophy:

* suggest matches by amount, currency, payment date, authority name, payment reference, and period
* keep suggestions explicit and reviewable
* only confirmed links should change `paymentStatus`
* one declaration can have multiple payments
* one payment receipt document can support one or more payment links when the authority receipt covers multiple taxes

Payment status rules:

* `not_required` when the declaration is informational, zero, no-activity, refund-only, or compensation-only
* `unpaid` when payable amount has no confirmed payment links
* `partially_paid` when confirmed payments are lower than payable result
* `paid` when confirmed payments cover the payable amount
* `refund_pending` for refund-requested reports without confirmed refund bank transaction
* `refunded` when a confirmed bank transaction proves refund receipt

## Position Summaries

Country-specific summary endpoints may aggregate declared reports, facts, and carryforwards for agent workflows without recalculating taxes from operational records.

Implemented summary:

* Spain: `GET /api/v1/tax-reports/positions/spain?companyCardId=<id-or-slug>&fiscalYear=<year>`
* CLI: `tax-reports spain-position --company-card-id <id-or-slug> --fiscal-year <year>`

The Spanish summary is scoped by `companyCardId` and `countryCode = "ES"`. It derives VAT from the latest `303`, autónomo YTD profit/loss from the latest `130`, corporate taxable-base position from the latest `200`, and future-effect balances from `tax_carryforwards`.

## Service Boundaries

Keep routes thin:

* parse params
* validate payloads with shared schemas
* call tax report services
* return mapped JSON

Put business behavior in services:

* document storage and OCR orchestration
* parser country module selection
* normalization
* fingerprinting
* idempotency and correction handling
* carryforward replacement
* payment status recomputation
* mapping from DB rows to stable API shapes

Shared Zod schemas should live in `packages/business-schemas`, with backend-only persistence details inside `business-api`.

## Test Scenarios

Add route and service integration coverage for:

* Spain Modelo 303 PDF ingest extracts country, form code, quarter/month, VAT bases, VAT due, VAT deductible, result amount, and result status.
* Spain Modelo 390 annual summary ingest stores annual facts without rewriting underlying `303` reports.
* Spain Modelo 130 or Modelo 200 ingest creates or updates profit/loss carryforward records without changing invoices or expenses.
* Re-ingesting the same declaration returns the existing tax report by fingerprint and records the new document as duplicate evidence.
* Corrective declaration ingest creates a new tax report linked to the original and supersedes affected active carryforwards.
* Payment receipt ingest links to an existing tax report and updates payment status only after confirmation.
* Bank transaction match confirmation updates a payable report from `unpaid` to `paid`.
* Parser failure stores the document with failed OCR or extraction state and does not create a tax report.
* List filters work for country, form, fiscal year, status, payment status, and tax kind.
* Search finds reports by OCR text, authority reference, form code, taxpayer tax ID, period label, and normalized fact labels.

## Implementation Defaults

* Spain is the first parser pack implemented.
* Country rules live in country modules and country docs; the shared tax report service must not hard-code Spain, Portugal, Germany, or Italy-specific field maps.
* Unknown country sections should be stored in `extractedData` and surfaced as warnings instead of discarded.
* Money values are stored as normalized decimal strings in the report currency.
* Dates use ISO strings; period boundaries use `YYYY-MM-DD`.
* Soft delete is used for reports and carryforwards.
* OCR and extraction confidence must be visible to agents.
* This feature creates audit records; it does not provide legal tax advice.
