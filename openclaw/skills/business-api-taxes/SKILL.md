---
name: business-api-taxes
description: Workflows for ingesting filed tax declarations, reviewing tax reports, payment evidence, carryforwards, and country-module tax parsing behavior in the Warehouse Hub Business API.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["docker", "curl"], "env": ["WROBO_PYTHON3_PATH", "WROBO_BUSINESS_API_PATH", "WROBO_API_BASE_URL", "WROBO_API_TOKEN"], "config": [] }
      },
  }
---

# Business API Taxes Skill

Use this skill when an agent needs to:

- ingest a filed tax declaration PDF or image into Business API tax reports
- inspect tax reports, tax facts, carryforwards, and payment links
- attach or review tax payment receipts and authority notices
- read the Spanish tax position summary
- work on country-specific tax parser modules

Tax reports are audit snapshots of filed declarations. They are not tax calculations, filing submissions, or legal advice.

---

## Safety Rules

- Do not calculate, submit, or amend taxes automatically.
- Do not mutate invoices, expenses, payrolls, or bank transactions during tax declaration ingest.
- Treat declarations as authoritative historical records over operational accounting data.
- Use tax payment links for reconciliation; only confirmed links update a report's `paymentStatus`.
- Treat suggested payment links as reviewable evidence, never as proof of payment.
- Ask for human/accountant review when parser confidence is low, authority references are missing, or warnings mention ambiguity.

---

## Default Command Pattern

General pattern, when `wrobo-biz` is linked into PATH:

```bash
$WROBO_PYTHON3_PATH $WROBO_BUSINESS_API_PATH/bin/wrobo-biz <command> <subcommand> ...
```

Short form:

```bash
wrobo-biz <command> <subcommand> ...
```

Alternative modality when debugging inside the repo with local Docker running:

```bash
cd /Users/denis/src/warehouse-hub/business-api
./container.sh exec npm run cli -- <command> <subcommand> ...
```

Use `wrobo-biz` for:

- `tax-reports list`
- `tax-reports get`
- `tax-reports spain-position`
- `tax-reports suggest-payments`
- `tax-reports attach-receipt`
- `tax-report-payment-links list/create/update`
- `tax-carryforwards list`

There is no `wrobo-biz` declaration-ingest command yet. Use direct multipart HTTP for declaration ingest.

---

## Tax Report Ingest Workflow

Use this workflow for filed tax declaration PDFs or images, such as AEAT Modelo 303, 130, 200, or 390.

### 1. Select The Source File

Declaration ingest uploads the source PDF or image directly to the Business API as multipart form data. Use the path to the file you were given or downloaded, as long as it is readable by the agent process running `curl`.

```bash
test -f ./tax/modelo-303-2026-q1.pdf
```

Do not paste file contents into chat or shell arguments. Let the API receive the file through the multipart `file` field.

### 2. Resolve The Company Card

Fetch the owned company card and use the returned `companyId` as `companyCardId`:

```bash
wrobo-biz company-card get
```

If the company card is missing or the tax ID/country looks wrong for the declaration, stop and ask for review before ingesting.

### 3. Submit Multipart Ingest

Declaration ingest is HTTP-only in the current CLI surface:

```bash
curl -sS -X POST "${WROBO_API_BASE_URL%/}/api/v1/tax-reports/ingest" \
  -H "Authorization: Bearer $WROBO_API_TOKEN" \
  -F "file=@./tax/modelo-303-2026-q1.pdf" \
  -F "kind=tax_declaration" \
  -F "companyCardId=comp_000123" \
  -F "countryCode=ES" \
  -F "taxKind=vat" \
  -F "formCode=303" \
  -F "periodLabel=2026-Q1" \
  -F "source=authority_portal_download" \
  -F 'overrides={"periodStart":"2026-01-01","periodEnd":"2026-03-31"}'
```

Required field:

```yaml
companyCardId: company card id from company-card get
```

Recommended fields:

```yaml
kind: tax_declaration
countryCode: ES
taxKind: vat | corporate_income | personal_income | withholding | payroll_tax | local_business_tax | social_security | other
formCode: official form code, for example 303
periodLabel: human period label, for example 2026-Q1
source: api_upload | accountant_upload | authority_portal_download | manual_upload
```

Optional `overrides` JSON can correct or supplement OCR output:

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

Only override fields you know from the declaration or authority receipt. Overrides are applied field by field after parsing and appear as warnings like `override_applied:periodStart`.

### 4. Understand What The Service Does

The ingest service:

1. validates multipart metadata
2. stores the original file as a `tax_declaration` document
3. marks document OCR as `processing`
4. runs structured OCR through the `llms.structured_ocr` provider
5. selects a country module from explicit metadata/overrides first, then structured OCR signals
6. parses country, tax kind, form, period, taxpayer ID, authority references, amounts, facts, and carryforward candidates
7. normalizes into the shared tax report contract
8. applies overrides
9. validates correction targets
10. creates the tax report, facts, carryforwards, and document linkage
11. marks OCR as `completed` and returns the report, document, OCR metadata, and warnings

If country selection fails, unsupported explicit country returns `tax_country_not_supported`; undetected country returns `tax_country_not_detected`.

### 5. Handle Duplicates And Corrections Carefully

Tax report fingerprints use company, country, tax kind, form code, period, taxpayer ID, and authority references.

- Duplicate fingerprints return the existing report and a `duplicate_tax_report_fingerprint` warning.
- Do not assume a duplicate upload overwrote previous report data.
- A correction with `correctionOfTaxReportId` must match the same company, country, tax kind, form code, `periodStart`, and `periodEnd`.
- A mismatched correction returns `invalid_tax_report_correction`.

### 6. Handle Failures

On parser or extraction failure, the uploaded document is kept and marked failed. The structured error often includes `documentId` in `details`; preserve that ID in user-facing handoff notes so a human can inspect the failed evidence.

Do not retry blindly. Add explicit metadata or overrides only when they are grounded in the source document or accountant instructions.

### 7. Report The Result

After ingest, report:

- `taxReportId`
- `documentId`
- country, form, tax kind, period
- status, result, payment status, result amount, currency
- confidence and warnings
- whether the response was a duplicate
- carryforwards created or marked `needs_review`

If the result is payable or refund-related, propose payment-link review as a separate step.

---

## Tax Report Review Commands

List reports:

```bash
wrobo-biz tax-reports list --country-code ES --fiscal-year 2026
wrobo-biz tax-reports list --payment-status unpaid
wrobo-biz tax-reports list --country-code ES --tax-kind vat --form-code 303 --limit 20
```

Inspect a report:

```bash
wrobo-biz tax-reports get tr_000123
```

The response includes the tax report, source document, normalized facts, carryforwards, and payment links. For hydrated payment evidence, call the HTTP API with `include=paymentEvidence` if needed.

Read the Spanish tax position:

```bash
wrobo-biz tax-reports spain-position --company-card-id comp_000123 --fiscal-year 2026
```

Use this for declared Spanish VAT, Modelo 130 autonomo IRPF position, and Modelo 200 corporate income position. It is read-only and declaration-sourced.

---

## Payment Evidence Workflow

Suggest payment links from bank transactions:

```bash
wrobo-biz tax-reports suggest-payments tr_000123
```

Suggestions are stored as explicit `suggested` links and are not auto-confirmed.

Attach a payment receipt or authority notice:

```bash
wrobo-biz tax-reports attach-receipt tr_000123 ./tax/aeat-receipt.pdf '{
  "kind": "tax_payment_receipt",
  "source": "authority_portal_download",
  "link": {
    "amount": "1840.00",
    "currency": "EUR",
    "paidAt": "2026-04-20",
    "paymentReference": "AEAT-303-Q1",
    "status": "confirmed",
    "confidence": "high"
  }
}'
```

Review payment links:

```bash
wrobo-biz tax-report-payment-links list --tax-report-id tr_000123
```

Create a manual payment link:

```bash
wrobo-biz tax-report-payment-links create '{
  "taxReportId": "tr_000123",
  "bankTransactionId": "btx_000041",
  "amount": "1840.00",
  "currency": "EUR",
  "paidAt": "2026-04-20",
  "paymentReference": "AEAT-303-Q1",
  "status": "suggested",
  "confidence": "high",
  "reason": "Amount and tax reference matched"
}'
```

Confirm or reject after review:

```bash
wrobo-biz tax-report-payment-links update trpl_000123 '{"status":"confirmed","confidence":"high","reason":"Matched AEAT receipt"}'
wrobo-biz tax-report-payment-links update trpl_000124 '{"status":"rejected","reason":"Wrong declaration period"}'
```

Payment rules:

- `suggested` and `rejected` links do not change report payment status.
- Confirmed payable links recompute reports to `partially_paid` or `paid`.
- Confirmed refund links can recompute refund-requested reports to `refunded`.
- Reverting a confirmed link back to `rejected` recomputes payment status downward.

---

## Carryforwards

Carryforwards are derived from filed declarations and corrections, not recalculated from invoices, expenses, payroll, or bank movements.

List active carryforwards:

```bash
wrobo-biz tax-carryforwards list --country-code ES --status active
```

List superseded balances too:

```bash
wrobo-biz tax-carryforwards list --include-superseded
```

Useful filters:

```bash
wrobo-biz tax-carryforwards list --country-code ES --tax-kind vat --kind vat_credit
wrobo-biz tax-carryforwards list --country-code ES --tax-kind corporate_income --kind tax_loss --origin-fiscal-year 2025
```

Carryforward kinds include `tax_loss`, `profit_base`, `vat_credit`, `withholding_credit`, `installment_credit`, `refund_credit`, and `other`.

---

## Spain Guidance

Spain v1 uses AEAT declarations. Supported and expected forms:

```yaml
forms:
  "303": VAT self-assessment
  "130": IRPF fractional payment for autonomos in direct estimation
  "200": corporate income tax declaration
  "390": annual VAT summary
```

Spain-specific rules:

- Preserve `casilla` field codes exactly, including zero-padded codes such as `00552`.
- Modelo 303 VAT positions and VAT credits come from declared casillas, not invoice recalculation.
- Modelo 130 profit/loss and retentions are declaration-sourced.
- Modelo 200 corporate profit/loss and negative base compensation are declaration-sourced.
- Use the Spain position summary to answer declared VAT, autonomo IRPF, and corporate income position questions.
- Missing authority references should usually lower confidence or create warnings, not block ingest when the declaration is otherwise parseable.

Important Modelo 303 casillas:

```yaml
303:
  result_amount: "71"
  amount_to_compensate: "72"
  prior_credit_applied: "78"
  prior_credit_remaining: "87"
  prior_credit_available: "110"
```

Result meaning:

- `payable`: positive result presented as amount to pay
- `refund_requested`: negative result with refund requested
- `compensate`: negative result carried forward for compensation
- `zero`: zero result
- `no_activity`: declaration marks no VAT activity

---

## Country Module Development

Country-specific tax rules live in:

```text
business-api/src/services/tax-country-modules/*
```

Shared schemas live in:

```text
packages/business-schemas/src/tax-report.ts
```

Each country module follows:

```ts
type TaxCountryModule = {
  countryCode: string;
  detect(input: TaxCountryDetectionInput): TaxCountryDetectionResult;
  parse(input: TaxCountryParseInput): TaxCountryParseResult;
  normalize(input: TaxCountryParseResult): NormalizedTaxReportDraft;
  buildCarryforwards(input: NormalizedTaxReportDraft): TaxCarryforwardCreateInput[];
};
```

Country modules own:

- form aliases and official names
- period parsing and fiscal calendar assumptions
- field-code systems such as `casilla`, `campo`, `quadro`, `rigo`, `line`, or `box`
- result mapping into shared `TaxReportResult`
- carryforward interpretation
- country-specific warnings
- parser fixtures and tests

Module parse/detect inputs include rendered OCR text plus optional structured OCR payload. Prefer structured OCR fields when available, and keep text parsing as a fallback for resilience and parser tests.

Shared services own:

- upload and document storage
- OCR orchestration
- country module selection
- persistence of reports, facts, carryforwards, and payment links
- embeddings and search
- API responses and audit metadata

Do not put country-specific rules in the shared ingestion service.

Keep raw OCR text out of persisted `extractedData`. Persist normalized and country-specific parsed structures such as casillas, facts, references, and parser metadata instead.

When changing ingest behavior, add or update coverage for:

- parser module tests
- tax report ingestion service tests
- route validation tests for multipart ingest and malformed overrides
- duplicate, unsupported-country, failed-document, and correction-target scenarios

---

## Quick Reference

```yaml
ingest_declaration:
  surface: direct HTTP multipart
  route: POST /api/v1/tax-reports/ingest
  required: file, companyCardId
  default_kind: tax_declaration

inspect_reports:
  command: wrobo-biz tax-reports list|get

spain_position:
  command: wrobo-biz tax-reports spain-position --company-card-id <id> --fiscal-year <year>

payment_suggestions:
  command: wrobo-biz tax-reports suggest-payments <tax-report-id>
  rule: suggested links are reviewable and not proof of payment

receipt_upload:
  command: wrobo-biz tax-reports attach-receipt <tax-report-id> <file> <json>
  rule: receipt proves payment only when its link is confirmed

carryforwards:
  command: wrobo-biz tax-carryforwards list
  rule: declaration-derived balances only
```
