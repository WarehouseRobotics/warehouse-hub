# Plan: Scope `wrobo-biz-api` work into business-api taskboard tasks

> **Final location:** copy to `docs/plans/cli-wrapper-api-transport-tasks.plan.md` after approval (plan-mode constraint kept the working copy under `~/.claude/plans/`).

## Context

The implementation plan for `wrobo-biz-api` is already approved and lives at [docs/plans/cli-wrapper-api-transport.plan.md](docs/plans/cli-wrapper-api-transport.plan.md). It describes a single-file Python 3 stdlib script (`business-api/bin/wrobo-biz-api`) that mirrors the existing local `wrobo-biz` CLI surface over HTTP. The remaining job is to break that work into ordered task-board chunks an AI coding agent can execute in ~150K-token sessions on the `warehouse-hub` / `business-api` board.

Constraints driving the breakdown:

- Each chunk must fit roughly one focused agent session: read the plan + a small set of source files + write + iterate + verify.
- Chunks must land in an order where the **dispatcher foundation** exists before scope-specific work starts; after that, scopes are mostly mechanical wiring against the data-driven route table described in the plan.
- Each chunk must be independently verifiable (parity-diff `wrobo-biz` ↔ `wrobo-biz-api` for the scopes it touches), so it can be moved to **review** on its own.
- Every task references the implementation plan plus the canonical source-of-truth files for the scope it covers, so an agent picking the task up cold has the context they need.

## Breakdown — 8 implementation tasks + 1 umbrella

### Umbrella task (created first, referenced by every child)

- **Title:** `wrobo-biz-api: remote HTTP CLI wrapper (umbrella)`
- **Description:**
  - Goal: ship a `business-api/bin/wrobo-biz-api` Python 3 stdlib script that mirrors the local `wrobo-biz` CLI shape but speaks HTTP only, so remote operators and agents can drive a deployed business-api instance without a Docker container on the host.
  - Implementation plan: [docs/plans/cli-wrapper-api-transport.plan.md](docs/plans/cli-wrapper-api-transport.plan.md).
  - Authoritative scope inventory: [business-api/src/cli/registry.ts](business-api/src/cli/registry.ts) (lines 27–55) and the documented CLI in [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md).
  - REST surface: route mounts in [business-api/src/app.ts](business-api/src/app.ts) and per-scope routers under [business-api/src/routes/](business-api/src/routes).
  - Acceptance: every CLI scope in registry.ts has parity through `wrobo-biz-api`, host-only commands (`serve`, `db *`) fail with a Markdown error and exit 2, and the verification matrix in the plan's Verification section passes end-to-end.
  - Children: the seven implementation tasks below, in order.
- **Labels:** `cli`, `agents`, `infrastructure`, `umbrella`
- **Column:** `ready`
- **Priority:** `normal`

### Task 1a — Foundation: script skeleton, dispatcher, auth, identity scopes

> **Status:** ✅ Complete. Shipped as [business-api/bin/wrobo-biz-api](business-api/bin/wrobo-biz-api) — single-file Python 3 stdlib script with the foundation dispatcher, auth resolution, error rendering, host-only rejection, and the five identity scopes (`auth`, `tokens`, `users`, `workspace`, `company-card`). Multipart-upload and binary-download helpers are stubs awaiting Task 2.

- **Title:** `wrobo-biz-api: skeleton, dispatcher, auth, identity scopes`
- **Description:**
  - Umbrella: `<umbrella-task-id>`.
  - Implementation plan: [docs/plans/cli-wrapper-api-transport.plan.md](docs/plans/cli-wrapper-api-transport.plan.md) — sections "Approach", "Auth and session storage", "Command dispatch", "Output and error formatting", "Configuration surface".
  - Scope:
    - Create `business-api/bin/wrobo-biz-api` as an executable Python 3.9+ stdlib script (`urllib.request`, `json`, `argparse`, `mimetypes`, `uuid`, `os`, `sys`, `pathlib`, `ssl`).
    - Implement the flag parser mirroring [parseFlexibleFlagArgs](business-api/src/cli/core.ts:118) (supports `--flag value` and `--flag=value`, boolean opt-in via a per-command set, repeatable flags via per-command set).
    - Implement the HTTP client and Route table abstraction: JSON body, query-string from list filters (parity with [list-filters.ts](business-api/src/lib/list-filters.ts)), header injection per token prefix matching [middleware/auth.ts](business-api/src/middleware/auth.ts) (sess_→Cookie, wpat_→Bearer, legacy→x-api-key). Leave multipart/binary helpers as stubs — Task 2 will fill them.
    - Auth resolution order from [auth-session.ts](business-api/src/cli/auth-session.ts) (lines 173–215): `--token` → `WROBO_API_TOKEN` → `~/.config/wrobo-api/session.json` (mode 0600) → fail.
    - Configuration: `WROBO_API_BASE_URL`, `--base-url`, `WROBO_API_TIMEOUT_SECS`, `WROBO_API_CA_BUNDLE`.
    - Error rendering as Markdown ([docs/apps/business-api/cli.md](docs/apps/business-api/cli.md) lines 57–85); `--json` flips to raw error body. Exit codes: 0 success, 1 HTTP/network failure, 2 host-only / arg-shape failure.
    - Host-only rejection: `serve` and `db *` print Markdown error and exit 2.
    - Wire identity-only scopes in this task: `auth` (login/logout/whoami/magic-link request/consume), `tokens` (create/list/revoke), `users` (list/set-role/delete/invite/revoke-invite), `workspace` (get/set), `company-card` (get/set).
    - Source of truth for each scope's flags/JSON shape: matching files under [business-api/src/cli/commands/](business-api/src/cli/commands) (auth.ts, tokens.ts, users.ts, workspace.ts).
  - Acceptance:
    - `auth login` writes a session file at `~/.config/wrobo-api/session.json` mode 0600; subsequent `auth whoami` succeeds with no `--token`; `auth logout` removes the file.
    - Parity diff returns empty for at least: `auth whoami --json`, `workspace get --json`, `company-card get --json`, `tokens list --json`.
    - `wrobo-biz-api serve` and `wrobo-biz-api db init` exit 2 with the documented Markdown error block.
    - A 401 (no token) renders the Markdown error shape.
  - Docs/refs: [docs/plans/cli-wrapper-api-transport.plan.md](docs/plans/cli-wrapper-api-transport.plan.md), [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md), [docs/apps/Business Foundation API.md](docs/apps/Business%20Foundation%20API.md).
- **Labels:** `cli`, `agents`, `python`, `infrastructure`, `auth`
- **Column:** `ready`

### Task 1b — CRM and base-infra JSON-CRUD scopes

> **Status:** ✅ Complete. Shipped as five new scope handlers in [business-api/bin/wrobo-biz-api](/Users/denis/src/warehouse-hub/business-api/bin/wrobo-biz-api) — `contacts` (CRUD + `resolve`, filters `--role/--query/--type/--parent-contact-id/--parentContactId`), `deals` (CRUD, filters incl. `--stage/--customerContactId`), `projects` (CRUD), `tasks` (CRUD with nested-task constraints), `comments` (CRUD with `--commentable-*` filters and an `--object-id` alias for `commentableId`). Identity-scope foundation from Task 1a unchanged; `PENDING_SCOPES` shrinks by five entries. See [docs/apps/business-api/cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md) for the documented filter-parity caveat.

- **Title:** `wrobo-biz-api: contacts, deals, projects, tasks, comments`
- **Description:**
  - Umbrella: `<umbrella-task-id>`. Depends on Task 1a (dispatcher, auth, error rendering must be in place).
  - Scope:
    - Wire CRM and base-infra scopes on top of the dispatcher from Task 1a: `contacts` (CRUD + `resolve` action + role/query filters; preserve canonical scope), `deals` (CRUD + list filters), `projects` (CRUD), `tasks` (CRUD + nested-task constraint passthrough), `comments` (CRUD).
    - Reuse list-filter handling (`--similar`, `--limit`, `--since`, `--before`, `--after`) plus scope-specific filters (`--role`, `--query`, `--stage`, `--status`, etc.) — confirm flag names against [list-filters.ts](business-api/src/lib/list-filters.ts) and [cli/commands/crm.ts](business-api/src/cli/commands/crm.ts).
    - Source of truth for each scope's flags/JSON shape: [cli/commands/crm.ts](business-api/src/cli/commands/crm.ts) and the matching routers under [business-api/src/routes/](business-api/src/routes) (contacts.ts, deals.ts, projects.ts, tasks.ts, comments.ts).
  - Acceptance:
    - Parity diff returns empty for at least: `contacts list --json`, `contacts list --role supplier --query paper --json`, `contacts resolve '<json>'`, `deals create '<json>'`, `deals list --stage won --customerContactId ct_X`, `projects list`, `tasks list`, `tasks create '<json>'`, `comments list --object-id <id>`.
    - A 404 (`projects get proj_missing`) renders the Markdown error shape.
  - Docs/refs: [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md), [docs/apps/Business Foundation API.md](docs/apps/Business%20Foundation%20API.md) "Contacts registry", "Sales registry and deals", "Tasks".
- **Labels:** `cli`, `crm`, `python`
- **Column:** `backlog`

### Task 2 — Documents: multipart upload + ingest + binary download

> **Status:** ✅ Complete. Shipped as `handle_documents` plus the real `_build_multipart_body` / `upload_multipart` / `download_binary` / `_parse_content_disposition_filename` helpers in [business-api/bin/wrobo-biz-api](/Users/denis/src/warehouse-hub/business-api/bin/wrobo-biz-api), with the TS ingest formatter ported into Python (~95 LOC) under the "Document ingest TOON formatter" block so `documents ingest` output is byte-identical to local. Subcommands wired: `upload`, `ingest`, `list`, `get`, `download`. `documents download` is a single HTTP round-trip (filename parsed from `Content-Disposition` with RFC 5987 charset-aware decoding) — no metadata pre-fetch. See [docs/apps/business-api/cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md) "Remote API wrapper" for the documented surface.

- **Title:** `wrobo-biz-api: documents scope (upload, ingest, list, get, download)`
- **Description:**
  - Umbrella: `<umbrella-task-id>`. Depends on Task 1a (1b not required — different scope family, can run in parallel).
  - Implementation plan: [docs/plans/cli-wrapper-api-transport.plan.md](docs/plans/cli-wrapper-api-transport.plan.md) — "Command dispatch" categories 4 (multipart) and 5 (binary download).
  - Scope:
    - Multipart helper (Python stdlib): `uuid4` boundary, `mimetypes.guess_type` with `application/octet-stream` fallback, field name `file`, additional fields flattened per [routes/documents.ts](business-api/src/routes/documents.ts:18-90) (top-level scalars + `overrides` as a JSON string field).
    - Binary download helper: stream `GET /api/v1/documents/:id/download` to a local path; emit `{ok, outputPath, filename}` matching [cli/commands/documents.ts](business-api/src/cli/commands/documents.ts:90-91).
    - Wire subcommands: `documents upload <file> <json>`, `documents ingest <file> <json>`, `documents list [list-filters]`, `documents get <id>`, `documents download <id> <out>`.
    - Port the ingest output formatter from [cli-document-ingest-format.ts](business-api/src/lib/cli-document-ingest-format.ts) into ~40 lines of Python so remote `documents ingest` matches local output byte-for-byte.
  - Acceptance:
    - Parity diff returns empty for `documents list`, `documents get <id>`, `documents upload ./samples/docs/reference.pdf '<json>'`, `documents ingest ./test-data/expenses/invoice_do_2026_03.pdf '<json>'`, and `documents download <id> /tmp/x.pdf` (compare the JSON receipt, then `cmp` the downloaded bytes).
    - Upload + ingest round-trip works against a remote URL with self-signed cert when `WROBO_API_CA_BUNDLE` is set.
  - Docs/refs: [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md), [docs/apps/Business Foundation API.md](docs/apps/Business%20Foundation%20API.md) sections 3–4.
- **Labels:** `cli`, `documents`, `python`
- **Column:** `backlog`

> **Note on file layout (Tasks 3–7):** the wrapper was refactored from a single file into a sibling Python package (see task `wrobo-biz-api-refactor-9sty1y`). Each new scope handler now lives in its own module at `business-api/bin/wrobo_biz_api/scopes/<scope>.py` exposing `handle_<scope>(subcommand, rest, *, globals_)`, and is registered in `SCOPE_HANDLERS` in `business-api/bin/wrobo_biz_api/cli.py`. Shared helpers (`parse_json_positional`, `list_query_from_options`) live in `scopes/_common.py`; HTTP/multipart/binary-download helpers are imported from `wrobo_biz_api.http` / `wrobo_biz_api.multipart` / `wrobo_biz_api.output`. Remove the scope's entry from `PENDING_SCOPES` in `cli.py` once it ships. No behavior change vs. the original single-file plan — only the file you drop is different.

### Task 3 — Accounting scopes: expenses, payrolls, sales-invoices

> **Status:** ✅ Complete. Shipped as [business-api/bin/wrobo_biz_api/scopes/accounting.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/scopes/accounting.py) with three scope handlers — `expenses` (CRUD + `--include-payrolls` merged feed mirroring [lib/expense-list-cli.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/expense-list-cli.ts)), `payrolls` (CRUD), `sales-invoices` (generate/get/list/update + a wrapper-only `pdf <id> <out>` two-request flow that fetches the invoice and then downloads the referenced PDF document; no dedicated invoice-PDF route exists server-side). 8 aliases from `src/cli/registry.ts:79-85` registered in `SCOPE_ALIASES` (`purchase-invoices` / `expense-invoices` / `bills` → `expenses`; `payroll` / `nominas` / `nomina` → `payrolls`; `invoice` / `invoices` / `sales-invoice` → `sales-invoices`). The `sales-invoices send` action mentioned in the original brief was skipped — no server route exists. List filters for expenses/payrolls/sales-invoices are wider than the local `wrobo-biz` CLI (server routes accept `--status`/`--supplier-contact-id`/`--category`/`--employee-contact-id`/`--country-code`/`--customer-contact-id`); these are marked with `*` in `wrobo-biz-api --help`. See [docs/apps/business-api/cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md) "Remote API wrapper" for the documented surface.

- **Title:** `wrobo-biz-api: expenses, payrolls, sales-invoices (with invoice aliases)`
- **Description:**
  - Umbrella: `<umbrella-task-id>`. Depends on Task 1a; Task 2 for the binary-download helper used by `sales-invoices pdf`.
  - Implementation plan: [docs/plans/cli-wrapper-api-transport.plan.md](docs/plans/cli-wrapper-api-transport.plan.md) — "Command dispatch" categories 1, 3, 5, 6, 7.
  - Scope:
    - Wire scopes: `expenses` (create/get/list/update, incl. `--include-payrolls` combined feed and `--similar` semantic filter), `payrolls` (create/get/list/update), `sales-invoices` (generate/get/list/update + action endpoint `send` + binary `pdf`).
    - Preserve the alias map for `invoices`, `bills`, `purchase-invoices`, `expense-invoices` (resolve through the alias map from [registry.ts](business-api/src/cli/registry.ts:79-85)).
    - Reference scope payloads/flags from [cli/commands/accounting.ts](business-api/src/cli/commands/accounting.ts) and any `sales-invoices` command file under [cli/commands/](business-api/src/cli/commands).
  - Acceptance:
    - Parity diff returns empty for: `expenses list --status recorded`, `expenses list --include-payrolls`, `expenses list --similar "office toner" --since 2m`, `payrolls list`, `sales-invoices list --status finalized --after 2026-04-01 --before 2026-05-01`, `sales-invoices generate '<json>'`, `sales-invoices get <id>`, `sales-invoices pdf <id> /tmp/inv.pdf` (cmp bytes), and the alias `invoices list --status finalized`.
  - Docs/refs: [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md), [docs/apps/Business Foundation API.md](docs/apps/Business%20Foundation%20API.md) sections 5–6.
- **Labels:** `cli`, `accounting`, `python`
- **Column:** `backlog`

### Task 4 — Banking scopes

> **Status:** ✅ Complete. Shipped as [business-api/bin/wrobo_biz_api/scopes/banking.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/scopes/banking.py) with four scope handlers — `bank-accounts` (CRUD; `list` accepts `--status`), `bank-transactions` (create/upsert/get/list/update + action `match <id>`), `bank-balances` (record/list), `bank-imports csv <bank-account-id> <file> <json>`. Notable points: (1) `bank-balances` maps to the server resource `/api/v1/bank-balance-snapshots` (the local CLI scope name is not 1:1 with the route — see [src/app.ts](/Users/denis/src/warehouse-hub/business-api/src/app.ts)). (2) `bank-imports csv` is **client-side**: no `/bank-imports/csv` endpoint exists server-side; the wrapper mirrors the local CLI flow from [src/cli/commands/bank.ts](/Users/denis/src/warehouse-hub/business-api/src/cli/commands/bank.ts) — POST the file to `/api/v1/documents` as a `kind=bank_csv` multipart upload, parse rows in Python, then POST each row to `/api/v1/bank-transactions/upsert`. Returned aggregate shape `{created, updated, needsReview, transactions}` mirrors `importBankTransactionsFromRows` in [src/services/bank.ts](/Users/denis/src/warehouse-hub/business-api/src/services/bank.ts). (3) The CSV parser (`parseBankCsvRows`) and money normalization (`_normalize_money_string`) are stdlib-only Python ports of [src/lib/bank-csv.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/bank-csv.ts) and [src/lib/money.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/money.ts), tested against TS-derived expectations covering European decimal commas (`"1.234,56"` → `"1234.56"`), US thousands (`"1,234"` → `"1234.00"`), Swiss apostrophes (`"1'234.56"` → `"1234.56"`), dot-thousands (`"1.234.567"`), and Unicode whitespace inside numbers — divergences caught in review (US-thousands corruption, apostrophes, dot-thousands, `\s+` class) are now fixed. (4) `--similar` was dropped from `bank-transactions list` and `bank-balances list` help: the local CLI advertises it but the server routes in [src/routes/bank.ts](/Users/denis/src/warehouse-hub/business-api/src/routes/bank.ts) don't forward it through `getListFilters`, so the wrapper would have silently dropped the flag — known server gap, out of scope here. See [docs/apps/business-api/cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md) "Remote API wrapper" for the documented surface.

- **Title:** `wrobo-biz-api: bank-accounts, bank-transactions, bank-balances, bank-imports`
- **Description:**
  - Umbrella: `<umbrella-task-id>`. Depends on Tasks 1a and 2 (reuses multipart helper for `bank-imports csv`).
  - Scope:
    - Wire scopes: `bank-accounts` (create/get/list/update), `bank-transactions` (create/upsert/get/list/update + action `match`), `bank-balances` (record/list), `bank-imports csv <bank-account-id> <file> <json>` (multipart with form fields per [cli/commands/bank.ts](business-api/src/cli/commands/bank.ts)).
    - Reference scope payloads/flags from [cli/commands/bank.ts](business-api/src/cli/commands/bank.ts) and [routes/bank.ts](business-api/src/routes/bank.ts).
  - Acceptance:
    - Parity diff returns empty for: `bank-accounts list --status active`, `bank-transactions upsert '<json>'`, `bank-transactions match <id>`, `bank-balances list`, `bank-balances record '<json>'`, `bank-imports csv <id> ./exports/sample.csv '<json>'`.
  - Docs/refs: [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md) "Bank Accounts and Transactions", [docs/apps/business-api/banking.md](docs/apps/business-api/banking.md) (if present).
- **Labels:** `cli`, `banking`, `python`
- **Column:** `backlog`

### Task 5 — Bookings scopes

> **Status:** ✅ Complete. Shipped as [business-api/bin/wrobo_biz_api/scopes/bookings.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/scopes/bookings.py) with three scope handlers — `bookings` (create/get/update/delete/complete/cancel/check-assignment-conflicts/list; list filters `--from`/`--to`/`--status`/`--customer-contact-id`/`--assigned-contact-id`/`--project-id`/`--deal-id`), `booking-assignment-profiles` (list/get/set/delete; `set` uses **PUT** at `/api/v1/booking-assignment-profiles/<contactId>` per [src/routes/bookings.ts](/Users/denis/src/warehouse-hub/business-api/src/routes/bookings.ts):137), and `booking-availability-exceptions` (CRUD; list filters `--contact-id`/`--kind`). This task introduces a **flag-driven body mode** that coexists with the positional-JSON mode used by every prior scope: each subcommand dispatch checks `_looks_like_json_blob(rest[0])` (a `args[0].strip().startswith("{")` test) and falls through to the existing JSON-blob path when truthy; otherwise it assembles the body from flags. Repeatable `--availability` is handled via the existing `repeatable_keys: Set[str]` parameter on `parse_flexible_flag_args` from `bin/wrobo_biz_api/flags.py` — pipe-delimited `day|HH:MM|HH:MM` tuples group by first-seen day order into `weeklyAvailability: [{dayOfWeek, windows: [...]}]`, a Python port of `parseBookingAvailabilityEntries` from [src/cli/commands/bookings.ts](/Users/denis/src/warehouse-hub/business-api/src/cli/commands/bookings.ts). Action endpoints follow the server routes exactly: `POST /api/v1/bookings/<id>/complete`, `POST /api/v1/bookings/<id>/cancel`, and `POST /api/v1/bookings/check-assignment-conflicts` (a **global** route, not per-booking). Three scopes removed from `PENDING_SCOPES` in [scopes/host_only.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/scopes/host_only.py). See [docs/apps/business-api/cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md) "Remote API wrapper" for the documented surface.

- **Title:** `wrobo-biz-api: bookings, booking-assignment-profiles, booking-availability-exceptions`
- **Description:**
  - Umbrella: `<umbrella-task-id>`. Depends on Task 1a.
  - Scope:
    - Bookings is flag-driven (`--customer-contact-id`, `--start`, `--end`, `--timezone`, etc.) rather than JSON-blob — extend the dispatcher to support a "flags → body object" mode in addition to the "positional JSON blob" mode used elsewhere. Both modes already need to coexist (see plan, "Command dispatch" Flag parser note).
    - Wire subcommands: `bookings create/list/get/update/complete/cancel/check-assignment-conflicts`, `booking-assignment-profiles set <employee-id> [flags]` (with repeatable `--availability`), `booking-availability-exceptions create [flags]`.
    - Reference scope payloads/flags from [cli/commands/bookings.ts](business-api/src/cli/commands/bookings.ts) and [routes/bookings.ts](business-api/src/routes/bookings.ts).
  - Acceptance:
    - Parity diff returns empty for: `bookings list --from <ts> --to <ts>`, `bookings create [flags]`, `bookings complete <id> --completion-notes ...`, `bookings cancel <id> --reason customer_requested_reschedule`, `booking-assignment-profiles set ct_emp_X --timezone Europe/Madrid --availability "monday|09:00|13:00" --availability "monday|15:00|18:00"`, `booking-availability-exceptions create [flags]`.
    - Repeatable flags (`--availability`) accumulate into an array correctly.
  - Docs/refs: [docs/apps/business-api/bookings.md](docs/apps/business-api/bookings.md), [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md) "Bookings".
- **Labels:** `cli`, `bookings`, `python`
- **Column:** `backlog`

### Task 6 — Tax reports scopes

> **Status:** ✅ Complete. Shipped as [business-api/bin/wrobo_biz_api/scopes/tax.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/scopes/tax.py) with three scope handlers — `tax-reports` (list/get plus action endpoints), `tax-report-payment-links` (create/list/update), `tax-carryforwards` (list with `--country-code`, `--tax-kind`, `--kind`, `--status`, `--origin-fiscal-year`, `--include-superseded`). Three scopes removed from `PENDING_SCOPES` in [scopes/host_only.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/scopes/host_only.py); only `data-cache` remains pending. Action endpoint routes (non-obvious, worth recording): (1) `tax-reports suggest-payments <id>` → `POST /api/v1/tax-reports/<id>/payment-links/suggest`. (2) `tax-reports spain-position --company-card-id <id> --fiscal-year <year>` → `GET /api/v1/tax-reports/positions/spain?companyCardId=…&fiscalYear=…` (GET, query-string, and a **global** route — not POST + per-id). (3) `tax-reports attach-receipt <id> <file> <json>` → `POST /api/v1/tax-reports/<id>/payment-receipts` (multipart). (4) `tax-report-payment-links update <id> <json>` → **PATCH** `/api/v1/tax-report-payment-links/<id>` (not PUT, not POST). Multipart contract for `attach-receipt` mirrors the local CLI byte-for-byte: file field name `file` with Content-Type chosen by extension (`.pdf` → `application/pdf`, else `image/png` — same hardcoded sniff as `readReceiptUploadFile` in [src/cli/commands/tax-reports.ts](/Users/denis/src/warehouse-hub/business-api/src/cli/commands/tax-reports.ts):29–35); additional form fields are `kind` and `source` as plain strings and `link` as a JSON-stringified blob (server parses it back via `parseMultipartJson(request.body.link, "link")` in [src/routes/tax-reports.ts](/Users/denis/src/warehouse-hub/business-api/src/routes/tax-reports.ts):244). `tax-reports list` intentionally omits server-supported flags `--period-start`, `--period-end`, `--status`, `--query` to preserve strict parity with the local CLI's `parseCliListFilters` surface — widening would have caused divergence beyond what the `*` wrapper-only-extension legend permits. See [docs/apps/business-api/cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md) "Remote API wrapper" for the documented surface.

- **Title:** `wrobo-biz-api: tax-reports, tax-report-payment-links, tax-carryforwards`
- **Description:**
  - Umbrella: `<umbrella-task-id>`. Depends on Tasks 1a and 2 (reuses multipart for `attach-receipt`).
  - Scope:
    - Wire `tax-reports` (list/get + action endpoints `spain-position`, `suggest-payments`, `attach-receipt <id> <file> <json>` multipart), `tax-report-payment-links` (create/list/update with JSON-blob body), `tax-carryforwards` (list with `--country-code`, `--status`, `--include-superseded`).
    - Reference scope payloads/flags from [cli/commands/tax-reports.ts](business-api/src/cli/commands/tax-reports.ts) and [routes/tax-reports.ts](business-api/src/routes/tax-reports.ts).
  - Acceptance:
    - Parity diff returns empty for: `tax-reports list --country-code ES --fiscal-year 2026`, `tax-reports get <id>`, `tax-reports suggest-payments <id>`, `tax-reports attach-receipt <id> ./tax/receipt.pdf '<json>'`, `tax-report-payment-links create '<json>'`, `tax-report-payment-links update <id> '<json>'`, `tax-carryforwards list --country-code ES --status active`.
  - Docs/refs: [docs/tax-reports.md](docs/tax-reports.md), [docs/tax-reports/spain.md](docs/tax-reports/spain.md), [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md) "Tax Reports".
- **Labels:** `cli`, `taxes`, `python`
- **Column:** `backlog`

### Task 7 — `data-cache`, host-only polish, docs, and full verification matrix

> **Status:** ✅ Complete. Shipped as [business-api/bin/wrobo_biz_api/scopes/data_cache.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/scopes/data_cache.py) with one scope handler covering all six subcommands — `list`, `create <slug>`, `get <slug>`, `lookup <slug> <key>`, `upsert <slug> <key>`, `import <slug>` — plus the `data-caches` alias registered in [bin/wrobo_biz_api/cli.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/cli.py). None of the subcommands required host-only treatment: every action in [src/cli/commands/data-cache.ts](/Users/denis/src/warehouse-hub/business-api/src/cli/commands/data-cache.ts) has an HTTP equivalent under [src/routes/data-caches.ts](/Users/denis/src/warehouse-hub/business-api/src/routes/data-caches.ts) (`list` → `GET /api/v1/data-caches`; `create` → `POST /api/v1/data-caches`; `get` → `GET /api/v1/data-caches/<slug>`; `lookup` → `POST /api/v1/data-caches/<slug>/lookup`; `upsert` → `POST /api/v1/data-caches/<slug>/entries`; `import` → `POST /api/v1/data-caches/<slug>/import`). The CSV path inside `import` is client-side: a stdlib-only Python port of `parseCsvEntries` parses the file (with `--key-col` required and optional `--value-col` switching between row-into-`{value}`-cell and row-into-object-with-header-keys modes) and POSTs the parsed entries as `{entries: [...]}` to the import route; JSON imports accept both `{entries: [...]}` and bare `[...]` shapes, matching the local CLI's two-shape contract. `--max-staleness-days` on `lookup` maps to the server field `maxStalenessWindow`. `PENDING_SCOPES` in [bin/wrobo_biz_api/scopes/host_only.py](/Users/denis/src/warehouse-hub/business-api/bin/wrobo_biz_api/scopes/host_only.py) is now an empty set; the only host-only commands left are scope-level `serve` and `db *`. Verification matrix (per [docs/plans/cli-wrapper-api-transport.plan.md](/Users/denis/src/warehouse-hub/docs/plans/cli-wrapper-api-transport.plan.md) "Verification"): section 1 (parity) **12/12**; section 2 (auth flow) **3/3**; section 3 (error rendering) **2/2**; section 4 (host-only) **2/2** — **19/19 total**. Section 5 (manual staging smoke against a live deployment for `workspace get` and `tax-reports list --country-code ES`) is deferred as an operator follow-up — not executable from this environment. A new "Remote API wrapper" section landed in [docs/apps/business-api/cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md) including the `wrobo-biz-api` quick-start (precedence table, session-file behavior, header injection, host-only command list, common flows) plus inline `wrobo-biz-api` examples next to the existing `wrobo-biz` examples in the Authentication, Tokens, and Workspace subsections. The `wrobo-biz-api` umbrella ([wrobo-biz-api-remote-hfxgp9](https://taskboards/warehouse-hub/business-api/wrobo-biz-api-remote-hfxgp9)) closes with this task.

- **Title:** `wrobo-biz-api: data-cache, final docs, and end-to-end verification`
- **Description:**
  - Umbrella: `<umbrella-task-id>`. Depends on Tasks 1a, 1b, 2, 3, 4, 5, 6.
  - Scope:
    - Inspect [cli/commands/data-cache.ts](business-api/src/cli/commands/data-cache.ts) and matching routes under [routes/data-caches.ts](business-api/src/routes/data-caches.ts) to determine which subcommands have HTTP equivalents. Wire those; for the ones that are server-internal only (e.g. `generate` triggering in-process embedding work with no HTTP route), reject with a "host-only" Markdown error and exit 2, same shape as `serve`/`db`.
    - Add a new section to [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md): "Remote API wrapper (`wrobo-biz-api`)" covering installation, `WROBO_API_BASE_URL` / `WROBO_API_TOKEN` / `--base-url` / `--token`, session file path, header behavior, and the host-only command list.
    - Add example `wrobo-biz-api` invocations alongside the existing `wrobo-biz` examples where they would help an agent (especially under "Authentication, Tokens, and Workspace").
  - Acceptance:
    - End-to-end run of the verification matrix in [docs/plans/cli-wrapper-api-transport.plan.md](docs/plans/cli-wrapper-api-transport.plan.md) "Verification" section 1 passes (parity diff returns empty for every listed command).
    - Auth flow (section 2) and error rendering (section 3) checks pass.
    - Host-only rejection (section 4) covers `serve`, `db init`, plus the data-cache subcommands flagged host-only in this task.
    - Manual smoke against a staging deployment (section 5) succeeds for `workspace get` and `tax-reports list --country-code ES`.
  - Docs/refs: [docs/plans/cli-wrapper-api-transport.plan.md](docs/plans/cli-wrapper-api-transport.plan.md), [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md).
- **Labels:** `cli`, `docs`, `qa`, `python`
- **Column:** `backlog`

## Why this breakdown

- **Task 1a** lands all the hard infrastructure: dispatcher, flag parser, auth resolution, header injection, error rendering, configuration, host-only rejection. It ships the five identity scopes (`auth`, `tokens`, `users`, `workspace`, `company-card`) to prove the foundation end-to-end. No multipart, no binary — those stay as stubs for Task 2.
- **Task 1b** is the natural follow-up: five CRM/base-infra JSON-CRUD scopes that exercise the dispatcher without adding new transports. Splits the foundation chunk into two sessions and gives Task 2/3/4/5/6 a more proven dispatcher to build on.
- **Task 2** isolates the two non-trivial transport modes (multipart upload, binary download) into one cohesive chunk that ships them with a single concrete scope (`documents`) to prove them out. Tasks 3, 4, and 6 then reuse the helpers without re-litigating them.
- **Tasks 3–6** are roughly equal-sized scope-family chunks (accounting, banking, bookings, tax-reports). Each agent picks up a single domain, references the matching `cli/commands/*.ts` + `routes/*.ts` pair, and verifies that family.
- **Task 7** sweeps `data-cache` (small, possibly partially host-only), polishes docs, and runs the full verification matrix end-to-end. The dedicated final verification chunk avoids the trap where each per-domain task only verifies its own slice and nothing catches cross-scope regressions.
- 8 implementation tasks ≈ 8 focused agent sessions. The umbrella task carries the cross-task context (links to plan + registry + app.ts) so a fresh agent doesn't need to re-derive that.

### Parallelism

After Task 1a lands, Tasks 1b, 2, 3, 4, 5, and 6 can all run in parallel — they touch distinct dispatch-table entries and distinct verification scopes. Only Task 7 is strictly serial after the others. The umbrella task description should mention this so multiple agents can be dispatched concurrently if desired.

## Process: how to actually create the tasks

Use the `tasks-management` skill (`/Users/denis/.claude/skills/tasks-management/scripts/taskboards`). For each task:

1. Create the umbrella first so its short ID can be substituted into every child's `Umbrella:` line.
2. Create children in order (Task 1a → Task 1b → Task 2 → … → Task 7). Use `columnKey: "ready"` only for the umbrella and Task 1a; the rest start in `backlog` and get promoted to `ready` as their dependencies land in review/done.
3. Use the description template established on the board (see existing tasks like `tax-reports-cli-output-3cs3a8`): `Umbrella:` line, `Depends on:` line (when applicable), `Scope:`, `Acceptance:`, `Docs:` — matching the body content above.
4. Apply labels per task. Keep them short and reuse existing board labels where possible (`cli`, `python`, `auth`, `documents`, `accounting`, `banking`, `bookings`, `taxes`, `docs`, `qa`, `agents`, `infrastructure`, `umbrella`).

## Verification

This is a planning deliverable, not a code change, so verification is procedural:

1. After approval, run the 9 `taskboards post …/tasks` calls in order (umbrella + 8 children); confirm all return 201 and capture each task's short ID.
2. Open the `business-api` board view and confirm:
   - The umbrella task is in `ready` with its description linking to the implementation plan.
   - Task 1a is in `ready`; Tasks 1b, 2, 3, 4, 5, 6, 7 are in `backlog`.
   - Every child task's description references the umbrella ID, the implementation plan path, and at least one source-of-truth code file under `business-api/`.
3. Read Task 1a's description back through `taskboards context <id>` and confirm an agent could start work with no further context beyond the plan and the cited files.
4. Commit nothing yet — task creation alone is the deliverable.
