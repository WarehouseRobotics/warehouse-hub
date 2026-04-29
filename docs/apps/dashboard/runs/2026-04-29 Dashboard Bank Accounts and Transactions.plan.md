---
type: implementation-plan
description: Plan for adding bank account and transaction tracking UI to the Dashboard.
project_dir: dashboard
---

# Dashboard Bank Accounts and Transactions Plan

Date: 2026-04-29

## Summary

Add a compact Banking workbench to the dashboard for manual and agent-assisted bank tracking. The UI should reflect the Business API MVP: screenshots and CSV files are evidence documents, while bank accounts, transactions, balances, and matches are structured records managed through the API.

The first dashboard pass should prioritize operational review and reconciliation over visual polish: dense tables, clear status badges, evidence links, and a match confirmation queue.

## Product Shape

Add one active Accounting section:

- nav id: `banking`
- label: `Banking`
- icon: `Landmark` or `WalletCards`
- route: `/banking` and `/banking/:id`

The first screen should be a Banking workbench, not a consumer-bank-style account page.

Primary user jobs:

- see all tracked bank accounts and their latest observed balance
- review imported or agent-entered transactions
- identify transactions that need review or matching
- confirm/reject suggested matches to expenses, payrolls, and sales invoices
- upload screenshot evidence and import bank CSV files
- record balance snapshots and visible rectification entries

Out of scope for this UI pass:

- dashboard OCR extraction from screenshots
- full document previewer
- automatic bank API integrations
- multi-account transfer reconciliation UI beyond showing `kind: transfer`
- dashboard creation/editing forms for every bank field

## Screen Design

### Banking Workbench

Use a single page with a compact account summary area and tabs:

```text
Banking
[Account selector] [Import CSV] [Record balance] [Upload screenshot]

Summary strip:
BBVA Main EUR · latest observed balance €7,809.90 · 4 needs review · 9 unmatched

Tabs:
Transactions | Balances | Matches
```

### Account Summary

At the top of the page, show a dense account selector/summary strip:

- account display name
- bank name
- masked IBAN/account identifier
- currency
- latest observed balance, if available
- latest balance evidence date
- counts for `needs_review`, unmatched transactions, and suggested matches

If there is more than one account, use a compact select/menu rather than cards for every account. Cards can be used only for repeated account summaries if the account count is small and the layout remains dense.

### Transactions Tab

Use a `wh-table` layout.

Columns:

- Date
- Kind
- Description
- Reference
- Amount
- Running balance
- Match
- Evidence
- Status

Filters:

- account
- date range
- status
- kind
- source
- match state

Row behavior:

- click opens `/banking/:bankTransactionId`
- amount is signed; credits use subtle success color, debits use normal text or restrained danger color
- low-confidence and `needs_review` rows should be visually scannable with badges
- `opening_balance`, `balance_adjustment`, and `transfer` should be visibly distinct from normal transactions

### Transaction Detail

Use the existing dedicated detail-screen pattern rather than a permanent split pane.

Detail content:

- title/description, date, account, signed amount
- reference and counterparty fields
- running balance
- status, kind, confidence, source
- linked evidence document chip
- match state
- suggested/confirmed match records
- confirm/reject actions for suggested matches

For confirmed matches, show the linked accounting record:

- `expense`: supplier, invoice number, gross amount, status
- `payroll`: employee, payroll number/period, net salary, status
- `sales_invoice`: customer, invoice number, gross amount, status

### Balances Tab

Use a simple table of `bank-balance-snapshots`.

Columns:

- Observed at
- Account
- Balance
- Source
- Evidence
- Confidence
- Notes

This tab should reinforce that balance snapshots are evidence for reconciliation, not generated transaction records.

### Matches Tab

Use a review queue table for `bank-transaction-matches`.

Columns:

- Transaction
- Candidate record
- Reason
- Confidence
- Status
- Actions

Actions:

- Confirm
- Reject
- Open transaction
- Open target record, where the target route exists

Behavior:

- confirmed matches should update the API match status and rely on the Business API to mark accounting records paid
- rejected matches should stay visible under an optional rejected/status filter, but not in the default queue

## Implementation Plan

### 1. Business API Client

Extend `dashboard/src/lib/api.ts` with typed helpers:

- `listBankAccounts()`
- `getBankAccount(id)`
- `listBankTransactions(filters)`
- `getBankTransaction(id)`
- `upsertBankTransaction(data)`
- `updateBankTransaction(id, patch)`
- `matchBankTransaction(id)`
- `listBankBalanceSnapshots(filters)`
- `createBankBalanceSnapshot(data)`
- `listBankTransactionMatches(filters)`
- `updateBankTransactionMatch(id, patch)`
- `uploadDocument(file, { kind, source })` if not already available in dashboard

Keep query parameters endpoint-specific. Bank transaction list filters should use exact filters such as `bankAccountId`, `status`, and `kind`; do not force them through `similar`.

### 2. Dashboard Types

Add dashboard-local types in `src/features/dashboard/types.ts`:

- `BankAccountRecord`
- `BankTransactionRecord`
- `BankBalanceSnapshotRecord`
- `BankTransactionMatchRecord`
- `BankingState`

`BankingState` can wrap several resource-like slices:

- accounts
- transactions
- selected transaction
- balances
- matches
- active tab
- selected account id
- filters
- upload/import state

Keep state in `App.tsx`, following existing dashboard rules.

### 3. Navigation and Routing

Update:

- `NavItemId` with `banking`
- Accounting nav group with `Banking`
- `ACTIVE_SECTIONS`
- `ActiveSection`
- `VALID_SECTIONS` in `App.tsx`
- `SECTION_CRUMBS` / layout breadcrumb labels if present

Routing behavior:

- `/banking` shows the Banking workbench list/tab view
- `/banking/:id` shows transaction detail
- navigation must go through `useAppRouter` / `navigate({ section, id })`

### 4. Page and Views

Create:

- `BankingPage`
- `BankTransactionsTable`
- `BankTransactionDetailView`
- `BankBalanceSnapshotsTable`
- `BankMatchesQueue`
- small modal/dialog components for CSV import, screenshot upload, and balance recording if the existing component set supports them

If modal infrastructure is too heavy for the first pass, use inline compact forms in a top action panel.

Use existing `wh-*` classes:

- `wh-page-head`
- `wh-filterbar`
- `wh-table`
- `wh-badge`
- `wh-card` only for summary blocks, modals, and empty states

Avoid marketing-style hero layouts and large decorative financial charts in v1.

### 5. Actions

Implement these user actions:

- select account
- filter transactions
- open transaction detail
- upload banking screenshot as `bank_screenshot`
- import CSV as `bank_csv`
- record balance snapshot
- run match for one transaction
- confirm suggested match
- reject suggested match

Do not implement in-dashboard OCR. The screenshot upload action should return a document ID that the user/agent can use when creating structured records.

### 6. Data Loading

Initial `/banking` load:

1. load bank accounts
2. choose selected account from URL/search param if added later, otherwise first active account
3. load transactions for selected account
4. load balance snapshots for selected account
5. load suggested matches

Refresh after mutations:

- after CSV import: reload transactions and matches
- after balance record: reload balances
- after match/confirm/reject: reload transactions, matches, and selected transaction detail if open
- after screenshot upload: show returned `documentId` without attempting OCR

### 7. API Edge Cases

UI should handle:

- no bank accounts yet
- bank account exists but no transactions
- CSV import returns created/updated/needs-review counts
- match command returns no candidates
- match command returns suggested candidates
- match command auto-confirms one candidate
- document upload fails
- transaction detail is deleted or missing

## Acceptance Criteria

- Accounting sidebar includes an active Banking section.
- `/banking` lists bank accounts and transactions from the Business API.
- User can import a CSV file and see imported transactions without leaving the page.
- User can upload a banking screenshot as evidence and see/copy the returned document ID.
- User can record a balance snapshot.
- User can run matching for a transaction.
- User can confirm or reject suggested matches.
- Confirming a match updates the dashboard state after the Business API marks the target record paid.
- `/banking/:id` opens a transaction detail view with evidence and match information.
- Empty/loading/error states match the existing dashboard resource behavior.
- The dashboard build passes in Docker.

## Verification

Run from `dashboard`:

```bash
./container.sh exec npm run build
```

If API client or CORS behavior changes are required, also run from `business-api`:

```bash
./container.sh exec npm run typecheck
./container.sh exec npm run test
```

Manual smoke test with seeded Business API data:

1. Create a bank account.
2. Upload a screenshot document.
3. Upsert at least one bank transaction with that `documentId`.
4. Record a balance snapshot.
5. Import a CSV with two rows.
6. Open `/banking`.
7. Select the account, inspect transactions, open one detail view.
8. Run match and confirm/reject a suggestion.

## Open Follow-Ups

- Decide whether the long-term section name should be `Banking`, `Bank accounts`, or `Reconciliation`.
- Add a dashboard document previewer later so screenshot evidence can be inspected inline.
- Add reconciliation deltas once the API exposes computed ledger-vs-observed balance summaries.
- Consider a dedicated imports history table if CSV imports become frequent.
