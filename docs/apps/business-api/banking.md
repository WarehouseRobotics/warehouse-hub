---
type: feature-guide
description: Implemented bank account, transaction, balance, matching, and CSV import scope for the Business API
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/architecture/Business API Architecture.md
  - docs/apps/business-api/cli.md
  - packages/business-schemas/src/bank.ts
---

# Banking in the Business API

## Purpose

Banking support in the Business API provides manual and agent-assisted bank tracking without direct bank API integrations.

The implemented MVP is designed around a practical constraint: bank APIs are not available for immediate integration, and certification-based integrations are out of scope. Instead, users and agents can provide bank evidence manually:

* banking app screenshots sent through Slack or another channel
* exported bank CSV files
* manually entered balance snapshots
* manually entered opening balances or rectification adjustments

The Business API stores evidence documents and keeps structured bank records separately. Screenshots and CSV files are evidence; `bank_transactions`, `bank_balance_snapshots`, and `bank_transaction_matches` are the operational records used by the application.

The implemented MVP covers:

* bank account create, list, get, update, and soft-delete flows
* bank transaction create, upsert, list, get, update, and soft-delete flows
* balance snapshot recording and listing
* screenshot/statement/CSV evidence through the existing `documents` table
* explicit opening balance, balance adjustment, transfer, and normal transaction kinds
* deterministic transaction fingerprinting for idempotent agent retries and CSV imports
* CSV import through the CLI
* transaction matching to expenses, payrolls, and sales invoices
* match confirmation/rejection records
* automatic paid-status updates only for one exact high-confidence match
* REST and CLI surfaces

Not implemented in this pass:

* automatic bank API synchronization
* in-API screenshot OCR for bank screenshots
* OFX/QIF/CAMT/MT940 imports
* computed reconciliation statements
* multi-account transfer pairing logic
* MCP tools
* dashboard UI

## Data Model

The implementation uses four SQLite/Drizzle tables:

* `bank_accounts`
  tracked bank accounts for the owned company card
* `bank_transactions`
  structured bank ledger records entered by users, agents, or CSV import
* `bank_balance_snapshots`
  observed point-in-time balances from screenshots, statements, or manual entry
* `bank_transaction_matches`
  links between bank transactions and accounting records

Shared API contracts live in `packages/business-schemas/src/bank.ts`.

### Bank Account

Implemented bank account fields:

* `bankAccountId`
* `slug`
* `bankName`
* `displayName`
* `maskedIdentifier` optional
* `ibanMasked` optional
* `currency`
* `status`
* `createdAt`
* `updatedAt`

Supported statuses:

* `active`
* `archived`

Example input:

```json
{
  "bankName": "BBVA",
  "displayName": "Main EUR account",
  "ibanMasked": "ES76********1234",
  "currency": "EUR",
  "status": "active"
}
```

### Bank Transaction

Implemented bank transaction fields:

* `bankTransactionId`
* `slug`
* `bankAccountId`
* `documentId` optional
* `transactionDate`
* `postedAt` optional
* `amount`
* `currency`
* `description`
* `counterpartyName` optional
* `reference` optional
* `runningBalance` optional
* `source` optional
* `confidence`
* `kind`
* `status`
* `fingerprint`
* `createdAt`
* `updatedAt`

Amounts are stored as signed money strings:

* positive values represent income or credits
* negative values represent spending, debits, payouts, payroll payments, tax payments, and fees

Supported transaction kinds:

* `bank_transaction`
* `opening_balance`
* `balance_adjustment`
* `transfer`

Supported transaction statuses:

* `recorded`
* `needs_review`
* `void`

Supported confidence values:

* `low`
* `medium`
* `high`

Example transaction extracted from a banking app screenshot:

```json
{
  "bankAccountId": "ba_000001",
  "transactionDate": "2026-04-29",
  "amount": "-340,01",
  "currency": "EUR",
  "description": "Adeudo A Su Cargo",
  "reference": "N 2026119000849489 Gestalea Barcelona",
  "runningBalance": "7.809,90",
  "source": "slack_screenshot",
  "confidence": "high",
  "kind": "bank_transaction",
  "status": "recorded",
  "documentId": "doc_000123"
}
```

### Balance Snapshot

Balance snapshots record observed balances. They are useful when a screenshot or statement shows a balance but not enough history to prove all underlying transactions.

Implemented balance snapshot fields:

* `bankBalanceSnapshotId`
* `slug`
* `bankAccountId`
* `documentId` optional
* `observedAt`
* `balance`
* `currency`
* `source` optional
* `confidence`
* `notes` optional
* `createdAt`

Example:

```json
{
  "bankAccountId": "ba_000001",
  "observedAt": "2026-04-29T13:36:00+02:00",
  "balance": "7.809,90",
  "currency": "EUR",
  "source": "slack_screenshot",
  "confidence": "high",
  "documentId": "doc_000123"
}
```

### Transaction Match

Transaction matches link bank movements to existing accounting records.

Supported target types:

* `expense`
* `sales_invoice`
* `payroll`

Implemented match fields:

* `bankTransactionMatchId`
* `slug`
* `bankTransactionId`
* `targetType`
* `targetId`
* `status`
* `confidence`
* `reason` optional
* `createdAt`
* `updatedAt`

Supported match statuses:

* `suggested`
* `confirmed`
* `rejected`

## Evidence Documents

Banking evidence uses the existing document vault.

Supported banking document kinds:

* `bank_screenshot`
* `bank_statement`
* `bank_csv`

Screenshots are intentionally stored as evidence only. The Business API does not perform bank screenshot OCR in this MVP. Agents or humans should extract fields and call bank transaction or balance APIs with explicit JSON.

Example screenshot upload:

```bash
./container.sh exec npm run cli -- documents upload ./samples/bank/bbva-movements.png '{
  "kind": "bank_screenshot",
  "source": "slack_upload"
}'
```

The returned `documentId` can then be attached to `bank_transactions` and `bank_balance_snapshots`.

## Fingerprinting and Upsert Behavior

`bank-transactions upsert` is the preferred command for agent and import workflows.

If the caller does not supply a fingerprint, the service computes one from:

* `bankAccountId`
* `transactionDate`
* normalized `amount`
* normalized `reference`
* normalized `description`

The fingerprint is unique per bank account. Repeating the same upsert updates the existing transaction instead of creating a duplicate.

This is important for:

* Slack agent retries
* repeated screenshots
* CSV re-imports
* correction of running balance, confidence, source, or document linkage

## Matching Behavior

`bank-transactions match <id>` searches for candidate accounting records.

Debit transactions match against:

* recorded expenses by negative gross amount
* recorded payrolls by negative net salary

Credit transactions match against:

* finalized sales invoices by positive gross amount

Matching signals:

* exact amount
* date within the matching window
* invoice/payroll/reference text present in the bank transaction reference or description

Auto-confirm behavior is intentionally conservative:

* if there is exactly one high-confidence candidate, the match is confirmed
* otherwise candidates are stored as `suggested`
* suggested matches do not mutate accounting records
* confirmed matches update the linked accounting record to `paid` when the existing status transition allows it

Status updates are delegated to the existing accounting services:

* `expense: recorded -> paid`
* `payroll: recorded -> paid`
* `sales_invoice: finalized -> paid`

## REST API

Implemented routes:

### Bank accounts

```text
GET    /api/v1/bank-accounts
POST   /api/v1/bank-accounts
GET    /api/v1/bank-accounts/:id
PATCH  /api/v1/bank-accounts/:id
DELETE /api/v1/bank-accounts/:id
```

List filters:

* `status`

### Bank transactions

```text
GET    /api/v1/bank-transactions
POST   /api/v1/bank-transactions
POST   /api/v1/bank-transactions/upsert
GET    /api/v1/bank-transactions/:id
PATCH  /api/v1/bank-transactions/:id
DELETE /api/v1/bank-transactions/:id
POST   /api/v1/bank-transactions/:id/match
```

List filters:

* `bankAccountId`
* `status`
* `kind`
* `since`
* `before`
* `after`
* `limit`

### Balance snapshots

```text
GET  /api/v1/bank-balance-snapshots
POST /api/v1/bank-balance-snapshots
```

List filters:

* `bankAccountId`
* `since`
* `before`
* `after`
* `limit`

### Transaction matches

```text
GET   /api/v1/bank-transaction-matches
POST  /api/v1/bank-transaction-matches
PATCH /api/v1/bank-transaction-matches/:id
```

List filters:

* `bankTransactionId`
* `status`

## CLI

Create a bank account:

```bash
./container.sh exec npm run cli -- bank-accounts create '{
  "bankName": "BBVA",
  "displayName": "Main EUR account",
  "ibanMasked": "ES76********1234",
  "currency": "EUR"
}'
```

Upsert a screenshot-derived transaction:

```bash
./container.sh exec npm run cli -- bank-transactions upsert '{
  "bankAccountId": "ba_000001",
  "transactionDate": "2026-04-29",
  "amount": "-340,01",
  "currency": "EUR",
  "description": "Adeudo A Su Cargo",
  "reference": "N 2026119000849489 Gestalea Barcelona",
  "runningBalance": "7.809,90",
  "source": "slack_screenshot",
  "confidence": "high",
  "kind": "bank_transaction",
  "status": "recorded",
  "documentId": "doc_000123"
}'
```

Record a balance snapshot:

```bash
./container.sh exec npm run cli -- bank-balances record '{
  "bankAccountId": "ba_000001",
  "observedAt": "2026-04-29T13:36:00+02:00",
  "balance": "7.809,90",
  "currency": "EUR",
  "source": "slack_screenshot",
  "confidence": "high",
  "documentId": "doc_000123"
}'
```

Create an opening balance:

```bash
./container.sh exec npm run cli -- bank-transactions upsert '{
  "bankAccountId": "ba_000001",
  "transactionDate": "2026-04-01",
  "amount": "1000.00",
  "currency": "EUR",
  "description": "Opening balance before tracked history",
  "source": "manual",
  "confidence": "high",
  "kind": "opening_balance",
  "status": "recorded"
}'
```

Run matching:

```bash
./container.sh exec npm run cli -- bank-transactions match btx_000041
```

Import a CSV export:

```bash
./container.sh exec npm run cli -- bank-imports csv ba_000001 ./exports/bbva-april.csv '{
  "dateColumn": "Date",
  "amountColumn": "Amount",
  "descriptionColumn": "Description",
  "referenceColumn": "Reference",
  "balanceColumn": "Balance",
  "defaultCurrency": "EUR",
  "source": "bank_csv"
}'
```

CSV import stores the uploaded CSV as a `bank_csv` document and then upserts all rows as bank transactions linked to that document.

Supported CSV options:

* `dateColumn`
* `amountColumn`
* `descriptionColumn`
* `referenceColumn` optional
* `balanceColumn` optional
* `currencyColumn` optional
* `defaultCurrency` optional
* `source`

## Typical Agent Workflow

Screenshot workflow:

1. User sends a banking app screenshot to the accounting agent.
2. Agent uploads the file as `bank_screenshot`.
3. Agent extracts transaction fields from the screenshot.
4. Agent calls `bank-transactions upsert` with `documentId`.
5. Agent records a balance snapshot when the screenshot includes a visible balance.
6. Agent runs `bank-transactions match` for each new transaction.
7. Agent asks a human to confirm suggested matches when auto-confirmation is not safe.

CSV workflow:

1. User exports CSV from online banking.
2. Agent or user runs `bank-imports csv`.
3. Business API stores the CSV as evidence.
4. Business API upserts rows by deterministic fingerprint.
5. Agent runs matching on imported transactions.
6. Human reviews suggested matches.

Rectification workflow:

1. User starts tracking a bank account without full prior history.
2. Agent creates an `opening_balance`.
3. User or agent records later balance snapshots.
4. If observed balance and known transaction history diverge, agent creates an explicit `balance_adjustment` with a reason in `description` or `notes`-like text.
5. Rectification entries remain visible as bank transactions and are not hidden from review.

## Design Notes

Banking records are intentionally operational and evidence-oriented:

* The Business API does not claim the bank ledger is complete unless users/imports provide complete data.
* Balance snapshots can show that something is missing without inventing historical transactions.
* Rectification records are explicit business records, not silent corrections.
* Matching is conservative because a false paid mark is worse than a review queue item.
* CSV import is preferred over screenshots when available because it is more structured and repeatable.

## Verification

The implementation is covered by integration tests for:

* account creation
* transaction upsert deduplication
* balance snapshots
* opening balance and rectification-style transaction kinds
* sales invoice matching and paid-status update
* ambiguous match suggestions
* expense and payroll debit matching
* CSV parsing and idempotent import
* CLI smoke flow

Run from `business-api`:

```bash
./container.sh exec npm run typecheck
./container.sh exec npm run test
```
