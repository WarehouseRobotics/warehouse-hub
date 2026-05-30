---
name: business-api-banking
description: Workflows for ingesting company bank account evidence from banking app screenshots and CSV exports, recording bank transactions and bank balance snapshots, and matching bank movements to Business API accounting records.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["docker"], "env": ["HUB_TMP_DIR", "WROBO_PYTHON3_PATH", "WROBO_BUSINESS_API_PATH", "WROBO_API_BASE_URL", "WROBO_API_TOKEN"], "config": [] }
      },
  }
---


# Bank Tracking Skill

Use this skill when a user or another agent needs to:

- Record or update company bank accounts
- Ingest banking app screenshots sent through Slack, email, or another agent channel
- Import bank CSV exports
- Record balance snapshots shown in screenshots or statements
- Create explicit opening balance or rectification transactions
- Match bank movements to expenses, payrolls, or sales invoices

Primary CLI modality:

```bash
$WROBO_PYTHON3_PATH $WROBO_BUSINESS_API_PATH/bin/wrobo-biz <command> <subcommand> ...
```

Alternative modality when debugging inside the repo with local Docker running:

```bash
cd /Users/denis/src/warehouse-hub/business-api
./container.sh exec npm run cli -- <command> <subcommand> ...
```

Banking support is manual and evidence-oriented. Bank screenshots, statements, and CSV files are stored as documents. Structured bank accounts, transactions, balances, and matches are created through explicit CLI calls.

Do not use `documents ingest` for banking screenshots. The Business API does not perform bank screenshot OCR in this MVP. Upload the screenshot as evidence, extract visible fields yourself, and pass the extracted data as JSON.

---

## Banking Concepts

Bank account records represent owned company bank accounts. A bank account should normally be created once per real account or card feed.

```yaml
bank_account_statuses:
  - active
  - archived
```

Bank transaction amounts are signed strings:

```yaml
amount_signs:
  income_or_credit: positive
  expense_debit_tax_payroll_fee: negative
```

Allowed bank transaction kinds:

```yaml
bank_transaction_kinds:
  - bank_transaction
  - opening_balance
  - balance_adjustment
  - transfer
```

Allowed bank transaction statuses:

```yaml
bank_transaction_statuses:
  - recorded
  - needs_review
  - void
```

Allowed confidence values:

```yaml
confidence:
  - low
  - medium
  - high
```

Evidence document kinds:

```yaml
document_kinds:
  - bank_screenshot
  - bank_statement
  - bank_csv
```

---

## Before Writing Bank Data

Step 1: Inspect existing active bank accounts:

```bash
wrobo-biz bank-accounts list --status active
```

Step 2: If no suitable account exists, create one:

```bash
wrobo-biz bank-accounts create '{"bankName":"BBVA","displayName":"Main EUR account","ibanMasked":"ES76********1234","currency":"EUR","status":"active"}'
```

Use a masked identifier or masked IBAN only. Never ask the user for a full card number, full account number, full IBAN, PIN, password, or one-time code.

If the uploaded screenshot does not make the account unambiguous and multiple accounts exist, ask the user which account it belongs to before importing transactions.

---

## Screenshot Workflow

Use this path when a user sends a screenshot of recent bank movements from a banking app.

### 1. Stage The File

Files received through Slack or another messaging channel must be available to the Business API container. Save the uploaded file into `$HUB_TMP_DIR` on the host, then pass only the filename or a container-visible path to the CLI.

```yaml
file_staging:
  host_path: $HUB_TMP_DIR
  common_source: slack_upload
  use_for:
    - banking app screenshots
    - statement PDFs/images
    - bank CSV exports
```

### 2. Upload Screenshot Evidence

```bash
wrobo-biz documents upload bbva-movements-2026-04-29.png '{"kind":"bank_screenshot","source":"slack_upload"}'
```

Keep the returned `documentId`. Attach that ID to every transaction and balance snapshot extracted from the screenshot.

### 3. Extract Visible Fields

For each visible movement, extract only what is actually visible or strongly implied by the screen:

```yaml
required_transaction_fields:
  - bankAccountId
  - transactionDate
  - amount
  - currency
  - description

optional_but_useful_fields:
  - reference
  - counterpartyName
  - runningBalance
  - postedAt
  - documentId
  - source
  - confidence
  - kind
  - status
```

For localized European money strings, preserve the visible value format if needed. The CLI accepts values such as `-340,01` and `7.809,90`.

Extraction rules:

- Use the date section label as `transactionDate`, for example `2026-04-29`.
- Use the card title as `description`.
- Use smaller reference text as `reference`.
- Use the signed amount line as `amount`.
- Use the visible running balance line as `runningBalance` when present.
- Use `source: "slack_screenshot"` for Slack screenshots.
- Use `confidence: "high"` only when date, amount, and description are clear.
- Use `status: "needs_review"` when the screenshot is cropped, blurry, partially hidden, or internally inconsistent.

### 4. Upsert Each Transaction

Use `bank-transactions upsert`, not `create`, for screenshot-derived movements. Upsert is idempotent and protects against agent retries or duplicate screenshots.

```bash
wrobo-biz bank-transactions upsert '{"bankAccountId":"ba_000001","transactionDate":"2026-04-29","amount":"-340,01","currency":"EUR","description":"Adeudo A Su Cargo","reference":"N 2026119000849489 Gestalea Barcelona","runningBalance":"7.809,90","source":"slack_screenshot","confidence":"high","kind":"bank_transaction","status":"recorded","documentId":"doc_000123"}'
```

If a screenshot shows multiple transactions, upsert each transaction separately using the same `documentId`.

### 5. Record A Balance Snapshot When Visible

If the screenshot shows an account balance or a running balance that clearly corresponds to an observed point in time, record it as a balance snapshot.

```bash
wrobo-biz bank-balances record '{"bankAccountId":"ba_000001","observedAt":"2026-04-29T13:36:00+02:00","balance":"7.809,90","currency":"EUR","source":"slack_screenshot","confidence":"high","documentId":"doc_000123"}'
```

Balance snapshots are reconciliation evidence. They do not replace transactions and do not prove that the full prior history has been imported.

### 6. Match New Transactions

Run matching for each imported transaction:

```bash
wrobo-biz bank-transactions match btx_000041
```

The match command is conservative:

- one exact high-confidence match can be auto-confirmed
- ambiguous candidates become `suggested` matches
- suggested matches do not mark accounting records paid
- confirmed matches update expenses, payrolls, or sales invoices to `paid` through existing Business API services

If a match result is suggested or ambiguous, report it to the user for review instead of forcing a status change.

---

## CSV Import Workflow

Use CSV import when the user can export structured data from online banking. Prefer CSV over screenshots because it is more complete and repeatable.

### 1. Stage And Inspect The File

Save the uploaded CSV to `$HUB_TMP_DIR`. Inspect the first row or header names before importing so you can map columns correctly.

Common columns:

```yaml
csv_columns:
  date: Date, Fecha, Operation Date, Transaction Date
  amount: Amount, Importe
  description: Description, Concepto, Movimiento
  reference: Reference, Referencia, NRC
  balance: Balance, Saldo
  currency: Currency, Moneda
```

### 2. Import The CSV

```bash
wrobo-biz bank-imports csv ba_000001 bbva-april.csv '{"dateColumn":"Date","amountColumn":"Amount","descriptionColumn":"Description","referenceColumn":"Reference","balanceColumn":"Balance","currencyColumn":"Currency","defaultCurrency":"EUR","source":"bank_csv"}'
```

If the file has no currency column, pass `defaultCurrency`. If the file has no balance column, omit `balanceColumn`.

CSV import stores the CSV as a `bank_csv` document and upserts rows using deterministic fingerprints based on bank account, date, amount, reference, and normalized description.

After import:

1. Read the created, updated/skipped duplicate, and needs-review counts.
2. List recent bank transactions for the account and date range.
3. Run `bank-transactions match <id>` for newly imported transactions that should reconcile accounting records.

Example list after import:

```bash
wrobo-biz bank-transactions list --bank-account-id ba_000001 --after 2026-04-01 --before 2026-05-01 --limit 100
```

---

## Rectification And Missing History

Use explicit rectification records when tracking starts after the account already had a balance or when evidence shows that prior history is incomplete.

### Opening Balance

Create an opening balance at the start of the tracked period:

```bash
wrobo-biz bank-transactions upsert '{"bankAccountId":"ba_000001","transactionDate":"2026-04-01","amount":"1000.00","currency":"EUR","description":"Opening balance before tracked history","source":"manual","confidence":"high","kind":"opening_balance","status":"recorded"}'
```

### Balance Adjustment

Create a balance adjustment only when you have an observed balance snapshot and the tracked history cannot explain the difference.

```bash
wrobo-biz bank-transactions upsert '{"bankAccountId":"ba_000001","transactionDate":"2026-04-30","amount":"-12.40","currency":"EUR","description":"Balance adjustment to reconcile observed bank balance from screenshot doc_000123","source":"manual_reconciliation","confidence":"medium","kind":"balance_adjustment","status":"needs_review","documentId":"doc_000123"}'
```

Rules for rectifications:

- Keep rectification entries visible as bank transactions.
- Explain the reason in `description`.
- Prefer `status: "needs_review"` unless the user explicitly confirms the correction.
- Do not silently edit historical normal transactions to make balances line up.
- Do not invent missing bank movements that are not supported by evidence.

### Transfers

Use `kind: "transfer"` for movements between tracked company bank accounts. The MVP does not automatically pair both sides of a transfer, so record enough reference text for human review.

---

## Matching Rules

Run matching after transaction import when the transaction likely corresponds to an existing Business API accounting record.

Debit transactions can match:

- recorded expenses by negative gross amount
- recorded payrolls by negative net salary

Credit transactions can match:

- finalized sales invoices by positive gross amount

Useful signals:

- exact amount
- date close to invoice/payroll/payment date
- invoice number, payroll reference, supplier/customer name, or tax reference in description/reference text

Do not manually mark accounting records paid before checking bank matching unless the user explicitly requests it. Let `bank-transactions match` auto-confirm only when it finds exactly one high-confidence candidate.

If a user rejects a match suggestion, keep the accounting record unchanged and preserve the rejected match record for audit history.

---

## Safety And Privacy Rules

- Never request, store, or echo full bank credentials, PINs, passwords, one-time codes, full card numbers, or full account numbers.
- Store only masked identifiers such as `****1234` or masked IBANs such as `ES76********1234`.
- Treat screenshots as sensitive financial evidence.
- Do not summarize more private banking details than needed for the task.
- If a screenshot contains personal notifications, unrelated balances, or visible personal identifiers, only extract the business-bank fields needed for the requested workflow.
- Prefer `bank-transactions upsert` over `create` for all agent-driven ingestion.
- Use `needs_review` when confidence is not high.
- Ask for human confirmation before creating large balance adjustments or before choosing between ambiguous bank accounts.

---

## What To Report Back

After handling a screenshot or CSV import, report:

- bank account used
- evidence document ID
- transactions created or updated
- balance snapshots recorded
- matches auto-confirmed
- suggested or ambiguous matches requiring review
- any rows or fields that need manual clarification

Use dashboard links when useful:

```yaml
resource_url_format:
  bank_accounts: $WROBO_API_BASE_URL/banking/<bankAccountId>
  documents: $WROBO_API_BASE_URL/documents/<documentId>
  expenses: $WROBO_API_BASE_URL/expenses/<id>
  payrolls: $WROBO_API_BASE_URL/payrolls/<id>
  sales_invoices: $WROBO_API_BASE_URL/sales-invoices/<id>
```

---

## Quick Reference

```yaml
quick_reference:
  - task: List active bank accounts
    command: "bank-accounts list --status active"
  - task: Create bank account
    command: "bank-accounts create '<json>'"
  - task: Upload bank screenshot evidence
    command: "documents upload <filename> '{\"kind\":\"bank_screenshot\",\"source\":\"slack_upload\"}'"
  - task: Upsert screenshot-derived transaction
    command: "bank-transactions upsert '<json>'"
  - task: Record balance snapshot
    command: "bank-balances record '<json>'"
  - task: Import CSV
    command: "bank-imports csv <bank-account-id> <file-path> '<json-options>'"
  - task: Match bank transaction
    command: "bank-transactions match <bank-transaction-id>"
  - task: Create opening balance
    command: "bank-transactions upsert '{\"kind\":\"opening_balance\",...}'"
  - task: Create balance adjustment
    command: "bank-transactions upsert '{\"kind\":\"balance_adjustment\",...}'"
```
