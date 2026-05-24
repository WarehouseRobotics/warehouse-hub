---
type: feature-guide
description: Description of the wrobo-biz CLI tool for manipulating business API objects and resources 
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/architecture/Business API Architecture.md
---

# Business API CLI Examples

The `business-api` CLI is typically run inside the Docker development container:


```bash
cd business-api
./container.sh exec npm run cli -- <command>
```

## Convenience wrapper

The `business-api/bin/wrobo-biz` is normally installed to /usr/bin and should be available system-wide. With this wrapper the calls tranform to something like this:

```bash
wrobo-biz invoices list
```

This is the preferred way for production and testing.

Common semantic aliases are accepted for agent-friendly command matching:

```bash
wrobo-biz invoices list
wrobo-biz purchase-invoices list
wrobo-biz expense-invoices list
wrobo-biz bills list
```

These map to the canonical scopes `sales-invoices` and `expenses`.

The wrapper also enables CLI help output to use `wrobo-biz ...` examples instead of container-specific commands:

```bash
wrobo-biz
wrobo-biz help
wrobo-biz help invoices
wrobo-biz help projects
```

When you run the raw CLI directly inside the repo container, examples keep the explicit container form:

```bash
./container.sh exec npm run cli -- help documents
```

## Remote API wrapper (`wrobo-biz-api`)

For driving a deployed business-api instance from a host that must **not** run Node.js (e.g. operators, scheduled jobs, agents on a hardened box), use the companion wrapper [business-api/bin/wrobo-biz-api](/Users/denis/src/warehouse-hub/business-api/bin/wrobo-biz-api). It is an executable Python 3 shim that loads the sibling [business-api/bin/wrobo_biz_api/](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/) stdlib-only package and mirrors the `wrobo-biz` command shape, but speaks HTTP only — no Docker, no Node, no container. New scopes are added by dropping a file under `bin/wrobo_biz_api/scopes/<scope>.py` exposing `handle_<scope>(subcommand, rest, *, globals_)` and registering it in `SCOPE_HANDLERS` in `bin/wrobo_biz_api/cli.py`.

Supported scopes today:

- **Identity foundation** (Task 1a): `auth` (login/logout/whoami/magic-link request/consume), `tokens` (create/list/revoke), `users` (list/set-role/delete/invite/revoke-invite), `workspace` (get/set), `company-card` (get/set).
- **CRM and base-infra** (Task 1b): `contacts` (CRUD + `resolve`; list filters `--role`, `--query`, `--type`, `--parent-contact-id` / `--parentContactId`), `deals` (CRUD; list filters incl. `--stage`, `--customerContactId`, `--ownerEntityId`), `projects` (CRUD), `tasks` (CRUD with nested-task constraint passthrough), `comments` (CRUD; list filters `--commentable-type`, `--commentable-id`, plus an `--object-id` alias for `commentableId`).
- **Documents** (Task 2): `documents upload <file> <json>`, `documents ingest <file> <json>`, `documents list` (shared list filters), `documents get <id>`, `documents download <id> <out>`. Upload and ingest use `multipart/form-data` (Python-stdlib encoder: `uuid4` boundary, `file` field, additional fields flattened per [routes/documents.ts](/Users/denis/src/warehouse-hub/business-api/src/routes/documents.ts) with `overrides` serialized as a JSON string field). Download streams the response body to disk in a **single HTTP call** — the filename comes from `Content-Disposition` (RFC 5987 charset-aware, `filename*=` preferred over `filename=`) with a fallback to the basename of `<out>`, so no metadata pre-fetch is needed. The `documents ingest` formatter is a Python port of [lib/cli-document-ingest-format.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/cli-document-ingest-format.ts) and emits **byte-identical** TOON output to the local `wrobo-biz documents ingest` for both `expense_invoice` and `sales_invoice` responses.
- **Accounting** (Task 3): `expenses` (create/get/list/update; list flags `--status`, `--include-payrolls` for the merged expense+payroll feed, `--similar`, plus shared list filters), `payrolls` (create/get/list/update), `sales-invoices` (generate/get/list/update plus `sales-invoices pdf <id> <out>` for the rendered invoice PDF). Aliases honored: `purchase-invoices`, `expense-invoices`, `bills` → `expenses`; `payroll`, `nominas`, `nomina` → `payrolls`; `invoice`, `invoices`, `sales-invoice` → `sales-invoices`. Two wrapper-only extensions worth calling out: (1) `sales-invoices pdf` is a two-request flow (fetch the invoice, then download the referenced PDF document via `/api/v1/documents/<id>/download`) — there is no dedicated invoice-PDF route, and the local `wrobo-biz` CLI has no `pdf` subcommand; (2) the list filters `--supplier-contact-id` / `--category` (expenses), `--employee-contact-id` / `--country-code` (payrolls), and `--status` / `--customer-contact-id` (sales-invoices) are exposed because the server routes accept them, even though the local `wrobo-biz` CLI's `parseCliListFilters` rejects them. These extras are marked with `*` in `wrobo-biz-api --help`. The `sales-invoices send` action mentioned in the implementation plan was skipped — no server route exists.

Remaining scopes (`bookings`, `bank-*`, `tax-*`, `data-cache`) are reserved and reject with a `scope_not_implemented` Markdown error until their follow-up tasks land — see [docs/plans/cli-wrapper-api-transport-tasks.plan.md](/Users/denis/src/warehouse-hub/docs/plans/cli-wrapper-api-transport-tasks.plan.md).

### Filter handling — divergence from local `wrobo-biz`

The remote wrapper enforces server-side filter names more strictly than the local `wrobo-biz` CLI. For CRM `list` subcommands (contacts/deals/projects/tasks/comments), `wrobo-biz-api`:

- Rejects unknown list flags up-front with a `cli_usage_error` (exit 2) so typos surface immediately, instead of being silently dropped.
- Passes recognized scope-specific filters (`--role`, `--query`, `--stage`, `--customerContactId`, `--projectId`, `--parentTaskId`, `--commentable-id` / `--object-id`, etc.) through to the HTTP route as query-string parameters, so the response is server-filtered.

The local `wrobo-biz` `list` handlers in `business-api/src/cli/commands/crm.ts` ignore unknown trailing flags and return the unfiltered list. As a result, **parity diff against the local CLI is byte-clean only on the canonical / error paths and the no-filter `list` calls** — `contacts list`, `deals list`, `projects list`, `tasks list`, `comments list`, plus CRUD round-trips and the documented 404 Markdown shape. Filtered-list diffs (e.g. `contacts list --role supplier --query paper`, `deals list --stage won --customerContactId ct_X`) are expected to differ: the wrapper returns the correct server-filtered result, the local CLI returns the full unfiltered set. This is intentional — the wrapper sits closer to the HTTP surface and is the right shape for remote agents — but reviewers comparing the two CLIs on filtered lists should expect divergence.

Host-only commands are explicitly rejected with a Markdown error and exit code 2 — `serve` and `db *` cannot be driven over HTTP and the wrapper says so:

```bash
wrobo-biz-api serve         # exit 2, host_only_command error
wrobo-biz-api db init       # exit 2, host_only_command error
```

Configuration:

- `WROBO_API_BASE_URL` — remote base URL (without `/api/v1`); overridable with `--base-url`.
- `WROBO_API_TIMEOUT_SECS` — request timeout in seconds (default 60).
- `WROBO_API_CA_BUNDLE` — path to a custom CA bundle for self-signed certs (validated on startup; a missing path raises `ca_bundle_not_found`).
- Per-call global flags: `--base-url`, `--token`, `--json` (raw JSON error envelope on stderr instead of Markdown), `--verbose`, `--help`.

Auth resolution order (matches `auth-session.ts:173–215` of the local CLI): `--token` → `WROBO_API_TOKEN` env → `~/.config/wrobo-api/session.json` (created mode 0600 atomically via `O_CREAT|O_EXCL`-style open) → fail with `unauthorized` (exit 2). The session file path is deliberately different from the local CLI's `~/.config/wrobo/session.json` so both wrappers can coexist on the same host. Header injection follows the token prefix per [middleware/auth.ts](/Users/denis/src/warehouse-hub/business-api/src/middleware/auth.ts): `sess_*` → `Cookie: wh_session=...`, `wpat_*` → `Authorization: Bearer ...`, anything else → `x-api-key`.

```bash
export WROBO_API_BASE_URL=https://hub.example.com
wrobo-biz-api auth login --email owner@example.com --password '...'   # writes session file
wrobo-biz-api auth whoami --json
wrobo-biz-api workspace get --json
wrobo-biz-api company-card get
wrobo-biz-api auth logout
```

Error rendering uses the same Markdown shape documented below for `wrobo-biz`; pass `--json` to flip to `{"error": {...}}` on stderr for machine consumption. Exit codes: `0` success, `1` HTTP/network failure, `2` argument-shape / configuration / host-only failure.

When a command fails through `wrobo-biz`, the wrapper-facing stderr output is rendered as Markdown instead of a raw Winston JSON log record. This applies regardless of `--verbose` so LLM-driven tooling gets a stable, readable failure shape:

~~~md
# Business API CLI Error

## Command

`documents ingest 2026-01-A-Opinionated.pdf {"kind":"sales_invoice","source":"slack_upload"}`

## Error Type

`SqliteError`

## Error Message

FOREIGN KEY constraint failed

## Stack Trace

```text
SqliteError: FOREIGN KEY constraint failed
    at PreparedQuery.run (/workspace/business-api/node_modules/src/better-sqlite3/session.ts:132:20)
    ...
```

## Error Message Summary

FOREIGN KEY constraint failed
~~~

## Authentication, Tokens, and Workspace

Sign in as a workspace user and inspect the active session:

```bash
wrobo-biz auth login --email owner@example.com --password owner-password
wrobo-biz auth whoami --json
```

Create, list, and revoke Personal Access Tokens for CLI, MCP, and agent use:

```bash
wrobo-biz tokens create --name claude-desktop --actor-type agent --scopes write
wrobo-biz tokens list --json
wrobo-biz tokens revoke pat_000000000000
```

Read or update the singleton workspace:

```bash
wrobo-biz workspace get --json
wrobo-biz workspace set --name "Northwind Robotics"
```

## Database and Company Card

Initialize or migrate the local database:

```bash
./container.sh exec npm run cli -- db init
./container.sh exec npm run cli -- db migrate
```

Create or update the owned company card:

```bash
./container.sh exec npm run cli -- company-card set '{
  "legalName": "Northwind Robotics SL",
  "displayName": "Northwind Robotics",
  "taxId": "B12345678",
  "address": {
    "street1": "Calle de Alcala 42",
    "city": "Madrid",
    "postalCode": "28014",
    "countryCode": "ES"
  },
  "invoiceDefaults": {
    "currency": "EUR",
    "paymentTermsDays": 30,
    "vatMode": "standard"
  }
}'
```

Read it back:

```bash
./container.sh exec npm run cli -- company-card get
```

or with the CLI wrapper, simply:

```bash
wrobo-biz company-card get
```

## Contacts

Create a supplier contact:

```bash
./container.sh exec npm run cli -- contacts create '{
  "type": "company",
  "status": "active",
  "roles": ["supplier"],
  "displayName": "Papeleria Centro SL",
  "legalName": "Papeleria Centro SL",
  "taxId": "B87654321",
  "email": "facturas@papeleriacentro.example"
}'
```

Resolve a contact, auto-creating if needed:

```bash
./container.sh exec npm run cli -- contacts resolve '{
  "autoCreate": true,
  "matchBy": ["taxId", "email", "canonicalName"],
  "contact": {
    "type": "company",
    "status": "active",
    "roles": ["customer"],
    "displayName": "Acme Retail GmbH",
    "legalName": "Acme Retail GmbH",
    "taxId": "DE123456789",
    "email": "ap@acme-retail.example"
  }
}'
```

List all contacts:

```bash
./container.sh exec npm run cli -- contacts list
```

## Bookings

Create a booking:

```bash
./container.sh exec npm run cli -- bookings create \
  --customer-contact-id ct_000245 \
  --project-id proj_000018 \
  --title "Warehouse automation discovery visit" \
  --service-type visit \
  --status confirmed \
  --start 2026-04-10T09:00:00+02:00 \
  --end 2026-04-10T11:00:00+02:00 \
  --timezone Europe/Madrid \
  --assigned-contact-id ct_emp_000011
```

List agenda items for a date range or employee:

```bash
./container.sh exec npm run cli -- bookings list \
  --from 2026-04-10T00:00:00Z \
  --to 2026-04-17T00:00:00Z \
  --assigned-contact-id ct_emp_000011
```

Complete or cancel a booking:

```bash
./container.sh exec npm run cli -- bookings complete book_000091 \
  --completion-notes "Site survey completed" \
  --create-follow-up-task

./container.sh exec npm run cli -- bookings cancel book_000091 \
  --reason customer_requested_reschedule
```

Configure employee availability:

```bash
./container.sh exec npm run cli -- booking-assignment-profiles set ct_emp_000011 \
  --timezone Europe/Madrid \
  --availability "monday|09:00|13:00" \
  --availability "monday|15:00|18:00" \
  --availability "tuesday|09:00|17:00" \
  --buffer-before-minutes 30 \
  --buffer-after-minutes 30 \
  --max-bookings-per-day 3 \
  --booking-type visit
```

Record a one-off exception:

```bash
./container.sh exec npm run cli -- booking-availability-exceptions create \
  --contact-id ct_emp_000011 \
  --kind time_off \
  --start 2026-04-10T00:00:00+02:00 \
  --end 2026-04-10T23:59:59+02:00 \
  --reason vacation
```

See [bookings.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/bookings.md) for the full REST, validation, and conflict-check behavior.

## Documents

Upload a raw document:

```bash
./container.sh exec npm run cli -- documents upload ./samples/docs/reference.pdf '{
  "kind": "other",
  "source": "manual_upload"
}'
```

Ingest an expense invoice and let OCR extract bookkeeping data:

```bash
./container.sh exec npm run cli -- documents ingest ./test-data/expenses/invoice_do_2026_03.pdf '{
  "kind": "expense_invoice",
  "source": "email_forward",
  "overrides": {
    "invoiceDate": "2026-03-26",
    "category": "office_supplies"
  }
}'
```

When `documents ingest` receives a bare filename like `invoice.pdf`, it resolves it from `TMP_DIR`. By default that is `business-api/data/tmp` locally and `/workspace/business-api/data/tmp` inside the Docker container.

Ingest a payroll slip the same way:

```bash
./container.sh exec npm run cli -- documents ingest payroll.pdf '{
  "kind": "payroll",
  "source": "accountant_upload"
}'
```

Short note:

* bare filenames are resolved from `TMP_DIR`
* payroll ingest resolves or creates an `employee` contact
* duplicate payroll imports update the existing payroll and replace the linked document

List documents from a time window:

```bash
./container.sh exec npm run cli -- documents list --after 2026-04-01 --before 2026-05-01
```

## Bank Accounts and Transactions

Bank tracking is manual and agent-assisted in v1. Bank screenshots, statements, and CSV exports are stored as documents, while the structured bank transactions and balances are created from explicit CLI JSON or CSV import data.

Create a bank account:

```bash
./container.sh exec npm run cli -- bank-accounts create '{
  "bankName": "BBVA",
  "displayName": "Main EUR account",
  "ibanMasked": "ES76********1234",
  "currency": "EUR",
  "status": "active"
}'
```

List active bank accounts:

```bash
./container.sh exec npm run cli -- bank-accounts list --status active
```

Upload a banking app screenshot as evidence:

```bash
./container.sh exec npm run cli -- documents upload ./samples/bank/bbva-movements.png '{
  "kind": "bank_screenshot",
  "source": "slack_upload"
}'
```

Upsert a transaction extracted by an agent from the screenshot:

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

Record an observed balance from a screenshot or statement:

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

Create an opening balance or rectification transaction when prior history is missing:

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

Match a bank transaction against recorded expenses, payrolls, or finalized sales invoices:

```bash
./container.sh exec npm run cli -- bank-transactions match btx_000041
```

The match command auto-confirms only one exact high-confidence candidate. Otherwise it creates suggested matches and leaves accounting records unchanged.

Import a bank CSV export. The CSV file is also stored as a `bank_csv` document and imported rows are upserted using deterministic transaction fingerprints:

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

Bank transaction notes:

* amounts are signed strings: income is positive, spending is negative
* screenshot OCR is intentionally outside the CLI; agents pass extracted fields as JSON
* `runningBalance` and `bank-balances` records are reconciliation evidence, not the source of transaction truth
* supported transaction kinds are `bank_transaction`, `opening_balance`, `balance_adjustment`, and `transfer`

## Tax Reports

Tax reports track filed declarations, carryforwards, and explicit payment evidence. Payment suggestions are reviewable records; only confirmed tax report payment links update a report's `paymentStatus`.

List tax reports by country, fiscal year, or payment status:

```bash
./container.sh exec npm run cli -- tax-reports list --country-code ES --fiscal-year 2026
./container.sh exec npm run cli -- tax-reports list --payment-status unpaid
```

Inspect a report, including its facts, carryforwards, and payment links:

```bash
./container.sh exec npm run cli -- tax-reports get tr_000123
```

Suggest bank transaction links for a payable or refund-requested report. Suggestions are never auto-confirmed:

```bash
./container.sh exec npm run cli -- tax-reports suggest-payments tr_000123
```

Attach a payment receipt or authority notice to a report. The receipt proves payment only when the created link is confirmed:

```bash
./container.sh exec npm run cli -- tax-reports attach-receipt tr_000123 ./tax/aeat-receipt.pdf '{
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

Review, create, confirm, or reject payment links:

```bash
./container.sh exec npm run cli -- tax-report-payment-links list --tax-report-id tr_000123

./container.sh exec npm run cli -- tax-report-payment-links create '{
  "taxReportId": "tr_000123",
  "bankTransactionId": "btx_000041",
  "amount": "1840.00",
  "currency": "EUR",
  "paidAt": "2026-04-20",
  "paymentReference": "AEAT-303-Q1",
  "status": "suggested",
  "confidence": "high"
}'

./container.sh exec npm run cli -- tax-report-payment-links update trpl_000123 '{
  "status": "confirmed"
}'

./container.sh exec npm run cli -- tax-report-payment-links update trpl_000124 '{
  "status": "rejected",
  "reason": "Wrong declaration period"
}'
```

List active or superseded carryforward balances:

```bash
./container.sh exec npm run cli -- tax-carryforwards list --country-code ES --status active
./container.sh exec npm run cli -- tax-carryforwards list --include-superseded
```

## Expenses

Create an expense manually:

```bash
./container.sh exec npm run cli -- expenses create '{
  "supplierContactId": "ct_000245",
  "invoiceNumber": "FC-2026-0042",
  "invoiceDate": "2026-03-25",
  "dueDate": "2026-04-24",
  "currency": "EUR",
  "totals": {
    "net": "120.00",
    "tax": "25.20",
    "gross": "145.20"
  },
  "category": "office_supplies",
  "notes": "Printer paper and toner.",
  "status": "recorded"
}'
```

List recorded expenses:

```bash
./container.sh exec npm run cli -- expenses list --status recorded
```

List recorded expenses together with payroll entries in one combined feed:

```bash
./container.sh exec npm run cli -- expenses list --status recorded --include-payrolls
```

Find an expense by semantic similarity within the last two months:

```bash
./container.sh exec npm run cli -- expenses list --similar "office toner cartridges from papeleria centro" --since 2m
```

Combine semantic search with an exact filter and an absolute range:

```bash
./container.sh exec npm run cli -- expenses list --status recorded --similar "warehouse printer toner invoice" --after 2026-02-01 --before 2026-04-01
```

## Payrolls

Payrolls are imported from payroll slips. They are not generated from configured payroll rules in v1.

Create a payroll manually:

```bash
./container.sh exec npm run cli -- payrolls create '{
  "employeeContactId": "ct_000411",
  "payrollNumber": "NOM-2026-03-01",
  "countryCode": "ES",
  "periodStart": "2026-03-01",
  "periodEnd": "2026-03-31",
  "paymentDate": "2026-03-31",
  "currency": "EUR",
  "grossSalary": "3000.00",
  "netSalary": "2310.00",
  "employeeTaxWithheld": "345.00",
  "employeeSocialContributions": "210.00",
  "employerSocialContributions": "690.00",
  "otherDeductions": "135.00",
  "otherEarnings": "0.00",
  "status": "recorded"
}'
```

Get a payroll:

```bash
./container.sh exec npm run cli -- payrolls get pay_000041
```

List recorded payrolls:

```bash
./container.sh exec npm run cli -- payrolls list --status recorded
```

Payroll definition notes:

* one payroll = one imported payroll event for one employee and one period
* more than one payroll can exist for the same employee in the same month
* normalized payroll totals stay small; country-specific detail remains in `rawLines`

## Sales Invoices

Generate a sales invoice:

```bash
./container.sh exec npm run cli -- sales-invoices generate '{
  "customerContactId": "ct_000310",
  "dealId": "deal_000041",
  "issueDate": "2026-04-02"
}'
```

List finalized sales invoices from the current month:

```bash
./container.sh exec npm run cli -- sales-invoices list --status finalized --after 2026-04-01 --before 2026-05-01
```

Find sales invoices by semantic similarity:

```bash
./container.sh exec npm run cli -- sales-invoices list --similar "warehouse audit consulting sprint" --since 1m
```

The semantic alias also works:

```bash
wrobo-biz invoices list --status finalized
```

## Tasks and Projects

Create a project:

```bash
./container.sh exec npm run cli -- projects create '{
  "ownerEntityId": "comp_000001",
  "name": "Customer onboarding"
}'
```

Create a task:

```bash
./container.sh exec npm run cli -- tasks create '{
  "projectId": "proj_000101",
  "title": "Review Q2 expense backlog",
  "status": "todo",
  "priority": "high"
}'
```

List tasks:

```bash
./container.sh exec npm run cli -- tasks list
```
