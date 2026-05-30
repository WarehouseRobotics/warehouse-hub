---
name: business-api
description: Explains how to use the Business API CLI for CRM and accounting operations.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["docker"], "env": ["WROBO_PYTHON3_PATH", "WROBO_BUSINESS_API_PATH", "WROBO_API_BASE_URL", "WROBO_API_TOKEN"], "config": [] }
      },
  }
---

# Business API CLI Skill

Use the Warehouse Hub Business API CLI `wrobo-biz` command when an Openclaw agent needs deterministic business operations against local hub data: company card setup, contacts, deals, documents, expenses, sales invoices, bank accounts, bank transactions, projects, tasks, and persistent data caches.

This CLI is the preferred path for structured CRUD-style work that should not depend on an LLM.

## Default Command Pattern

General pattern (wrobo-biz is linked to /usr/bin which is in PATH):

```bash
$WROBO_PYTHON3_PATH $WROBO_BUSINESS_API_PATH/bin/wrobo-biz <command> <subcommand> ...
```

For command discovery and examples, the CLI now has layered help:

```bash
wrobo-biz
wrobo-biz help
wrobo-biz help contacts
wrobo-biz help expenses
wrobo-biz help bank-accounts
wrobo-biz help bank-transactions
wrobo-biz help payrolls
wrobo-biz help invoices
wrobo-biz help data-cache
```

The "help" command, scope name and action names do not use the "--" prefix, while command arguments always are prefixed with "--" (example: "... --after 2025-01-30")

Use top-level help when you need to recall available scopes. Use scoped help when you need the command list and example syntax for a specific area such as contacts, expenses, projects, tasks, or invoices.

## General Examples

Some basic examples 

```bash
# Owner company card info
wrobo-biz company-card get

# Get a contact by ID or slug
wrobo-biz contacts get ct_000245

# For bills/purchases (with optional argument to include payrolls too)
wrobo-biz expenses list --since 1m --include-payrolls

# For sales
wrobo-biz sales-invoices list --after 2025-01-30

# For payrolls
wrobo-biz payrolls list --after 2025-01-30

# For reference-data caches
wrobo-biz data-cache list
```

For more filters consult scope help with `wrobo-biz help <scope>`.

The wrapper is simpler for agents because it hides whether the CLI is running directly or inside the Business API container.

### Common Command Arguments for Date Ranges

--since 30d, 4w, 1m: allows simple filtering for the "last N days/weeks/months"
--before YYYY-MM-DD: before date filter
--after YYYY-MM-DD: after date filter
--limit 30: limit the number of results

## Debugging Commands

If you need the lower-level equivalent for debugging, repo-local development typically maps to:

```bash
cd /Users/denis/src/warehouse-hub/business-api
./container.sh exec npm run cli -- <command> <subcommand> ...
```

Use the lower-level container command only when troubleshooting the wrapper or working on the CLI implementation itself.

## Output And Error Model

- Successful command results are printed as formatted JSON on stdout.
- Operational logging uses Winston JSON logs and is emitted separately from the command payload.
- Validation failures and unknown commands exit non-zero and print an error message on stderr.
- Treat stdout as the business result to parse or summarize.

## Command Families

Top-level commands:

- `help [scope]`
- `serve`
- `db <subcommand>`
- `company-card <subcommand>`
- `contacts <subcommand>`
- `documents <subcommand>`
- `bank-accounts <subcommand>`
- `bank-transactions <subcommand>`
- `bank-balances <subcommand>`
- `bank-imports <subcommand>`
- `expenses <subcommand>`
- `deals <subcommand>`
- `sales-invoices <subcommand>`
- `projects <subcommand>`
- `tasks <subcommand>`
- `data-cache <subcommand>`
- `data-caches <subcommand>` alias for `data-cache`

Supported subcommands by scope:

- `db init`
- `db migrate`
- `company-card get`
- `company-card set '<json>'`
- `contacts list`
- `contacts create '<json>'`
- `contacts get <id-or-slug>`
- `contacts resolve '<json>'`
- `documents upload <file-path> '<json-meta>'`
- `documents ingest <file-path> '<json-meta>'`
- `documents list [filters]`
- `documents get <id-or-slug>`
- `documents download <id-or-slug> <output-path>`
- `bank-accounts create '<json>'`
- `bank-accounts get <id-or-slug>`
- `bank-accounts list [--status <status>]`
- `bank-accounts update <id-or-slug> '<json-patch>'`
- `bank-transactions create '<json>'`
- `bank-transactions upsert '<json>'`
- `bank-transactions get <id-or-slug>`
- `bank-transactions list [filters]`
- `bank-transactions update <id-or-slug> '<json-patch>'`
- `bank-transactions match <id-or-slug>`
- `bank-balances record '<json>'`
- `bank-balances list [filters]`
- `bank-imports csv <bank-account-id> <file-path> '<json-options>'`
- `expenses create '<json>'`
- `expenses get <id-or-slug>`
- `expenses list [filters]`
- `expenses update <id-or-slug> '<json-patch>'`
- `deals create '<json>'`
- `deals get <id-or-slug>`
- `deals list`
- `sales-invoices generate '<json>'`
- `sales-invoices get <id-or-slug>`
- `sales-invoices list [filters]`
- `sales-invoices update <id-or-slug> '<json-patch>'`
- `projects create '<json>'`
- `projects get <id-or-slug>`
- `projects list`
- `tasks create '<json>'`
- `tasks get <id-or-slug>`
- `tasks list`
- `tasks update <id-or-slug> '<json-patch>'`
- `data-cache list`
- `data-cache create <slug> --name <display-name> --key-type <string|date|datetime|numeric> [--description <text>] [--value-schema <json>] [--fetcher-config <json>] [--ttl-days <days>]`
- `data-cache get <slug>`
- `data-cache lookup <slug> <key> --strategy <fallback_only|fetch_on_miss|staleness_window> [--max-staleness-days <days>]`
- `data-cache upsert <slug> <key> --value '<json>' [--expires-at <iso-datetime>]`
- `data-cache import <slug> --file <path> [--key-col <name>] [--value-col <name>]`

## Safe Usage Rules

- Prefer `wrobo-biz ...` over direct `container.sh` or `npm run cli` invocations.
- Prefer `wrobo-biz help` or `wrobo-biz help <scope>` before guessing syntax.
- Pass JSON arguments as **valid JSON objects**, wrapped in single quotes.
- Use double quotes inside JSON keys and values.
- Prefer fetching existing entities before updating related records when IDs are uncertain.
- Treat `<id-or-slug>` literally: many `get` and `update` commands accept either the internal ID or slug.
- For file ingestion, confirm the source path exists before calling `documents upload` or `documents ingest`.
- For downloads, choose an explicit output path and expect the command to write a file.
- For `data-cache lookup`, handle `source: "needs_fetch"` as an instruction to fetch the value, submit it to the returned endpoint, then retry the lookup.

## List Filters

Only these list commands accept CLI filters:

- `documents list`
- `bank-transactions list`
- `bank-balances list`
- `expenses list`
- `sales-invoices list`

Supported filter flags:

- `--similar <text>` for semantic search
- `--limit <n>` for a positive integer limit
- `--since <duration>` where duration uses `d`, `w`, `m`, or `y`, for example `7d`, `2w`, `3m`
- `--before <YYYY-MM-DD>`
- `--after <YYYY-MM-DD>`
- `--bank-account-id <id>` for bank transaction and balance lists
- `--status <status>` and `--kind <kind>` for bank transaction lists

Important filter behavior:

- Unknown list flags fail validation.
- `--before` and `--after` must use `YYYY-MM-DD`.
- `--since` must use a relative duration like `1d`, `2m`, or `1y`.
- Other list endpoints such as `contacts list`, `deals list`, `projects list`, and `tasks list` do not currently accept these filters.

For detailed bank screenshot, CSV import, balance snapshot, rectification, and matching workflows, use the `business-api-bank-tracking` skill.

The `expenses list` command can include a special `--include-payrolls` parameter to include salaries/payrolls in the list of expenses (otherwise they must be fetched separately via payrolls).

## Recommended Workflows

### 1. Read Before Write

When possible, inspect current state before mutating records:

```bash
wrobo-biz help expenses
wrobo-biz company-card get
wrobo-biz contacts list
wrobo-biz expenses get exp_000123
```

### 2. Use `contacts resolve` For Matching

When you have partial external contact data and want stable matching with optional autocreation, prefer:

```bash
wrobo-biz contacts resolve '{"autoCreate":true,"matchBy":["taxId","email","canonicalName"],"contact":{"type":"company","status":"active","roles":["supplier"],"displayName":"Papeleria Centro SL","legalName":"Papeleria Centro SL","taxId":"B87654321","email":"facturas@papeleriacentro.example"}}'
```

This is better than creating duplicates when an email, tax ID, or normalized name may already exist.

### 3. Use Document Ingestion For OCR-Backed Records

Use `documents ingest` when the uploaded file should also be processed into a business record such as an expense invoice:

```bash
wrobo-biz documents ingest ./test-data/expenses/invoice_do_2026_03.pdf '{"kind":"expense_invoice","source":"email_forward","overrides":{"invoiceDate":"2026-03-26","category":"office_supplies"}}'
```

Use `documents upload` when you only want to store the file and metadata without running ingestion logic.

### 4. Use Semantic Search Sparingly But Intentionally

Semantic search is available on selected list endpoints and is useful when exact IDs or dates are unknown:

```bash
wrobo-biz expenses list --similar "printer toner invoice from papeleria centro" --since 3m
wrobo-biz sales-invoices list --similar "warehouse onboarding consulting" --after 2026-01-01
```

Prefer exact `get` commands when you already have an ID or slug.

### 5. Use Data Caches For Persistent Reference Values

Use `data-cache` for durable reference data such as exchange rates, supplier material prices, benchmark values, or other key/value facts that should survive restarts.

```bash
wrobo-biz data-cache create currency-rates-eur-usd --name "Currency Rates EUR/USD" --key-type date --value-schema '{"type":"object","properties":{"rate":{"type":"string"},"base":{"type":"string"},"target":{"type":"string"}},"required":["rate","base","target"]}' --fetcher-config '{"prompt":"Look up the EUR/USD exchange rate for {{ key }}. Reply with JSON only."}' --ttl-days 1
```

Lookup strategies:

- `fallback_only`: use exact or nearest stored values only; never asks for a fresh fetch.
- `fetch_on_miss`: return exact values, otherwise return a `needs_fetch` instruction when the cache has `fetcherConfig`.
- `staleness_window`: use a nearby stored value within `--max-staleness-days`, otherwise return `needs_fetch` when configured.

When lookup returns `source: "needs_fetch"`, read the returned `instructionPrompt`, fetch the missing value using your available tools, submit the JSON object to the returned `submission.path` with normal Business API auth, then rerun the returned retry request.

## Common Examples

### Contacts

Inspect the contact scope help:

```bash
wrobo-biz help contacts
```

Create a contact:

```bash
wrobo-biz contacts create '{"type":"company","status":"active","roles":["customer"],"displayName":"Acme Retail GmbH","legalName":"Acme Retail GmbH","taxId":"DE123456789","email":"ap@acme-retail.example"}'
```

Resolve a contact, creating it if needed:

```bash
wrobo-biz contacts resolve '{"autoCreate":true,"matchBy":["taxId","email","canonicalName"],"contact":{"type":"company","status":"active","roles":["supplier"],"displayName":"Papeleria Centro SL","legalName":"Papeleria Centro SL","taxId":"B87654321","email":"facturas@papeleriacentro.example"}}'
```

### Expenses

Inspect the expense scope help:

```bash
wrobo-biz help expenses
```

Create an expense:

```bash
wrobo-biz expenses create '{"supplierContactId":"ct_000245","invoiceNumber":"FC-2026-0042","invoiceDate":"2026-03-25","dueDate":"2026-04-24","currency":"EUR","totals":{"net":"120.00","tax":"25.20","gross":"145.20"},"category":"office_supplies","notes":"Printer paper and toner.","status":"recorded"}'
```

Patch an expense:

```bash
wrobo-biz expenses update exp_000123 '{"status":"paid","notes":"Paid by bank transfer on 2026-04-10."}'
```

Search recent expenses semantically:

```bash
wrobo-biz expenses list --similar "office toner cartridges from papeleria centro" --since 2m
```

### Invoices

Inspect the invoice scope help:

```bash
wrobo-biz help invoices
```

Generate a sales invoice:

```bash
wrobo-biz sales-invoices generate '{"customerContactId":"ct_000310","dealId":"deal_000041","issueDate":"2026-04-02"}'
```

List recent finalized invoices:

```bash
wrobo-biz sales-invoices list --status finalized --after 2026-04-01 --before 2026-05-01
```

Create a task:

```bash
wrobo-biz tasks create '{"projectId":"proj_000101","title":"Review Q2 expense backlog","status":"todo","priority":"high"}'
```

Download a stored document:

```bash
wrobo-biz documents download doc_000050 /tmp/vendor-invoice.pdf
```

### Data Caches

Inspect the data-cache scope help:

```bash
wrobo-biz help data-cache
```

Create a cache for dated exchange rates:

```bash
wrobo-biz data-cache create currency-rates-eur-usd --name "Currency Rates EUR/USD" --key-type date --value-schema '{"type":"object","properties":{"rate":{"type":"string"},"base":{"type":"string"},"target":{"type":"string"}},"required":["rate","base","target"]}' --fetcher-config '{"prompt":"Look up the EUR/USD exchange rate for {{ key }}. Return a JSON object matching the schema."}' --ttl-days 1
```

Manually upsert a value:

```bash
wrobo-biz data-cache upsert currency-rates-eur-usd 2026-04-26 --value '{"rate":"1.0831","base":"EUR","target":"USD"}'
```

Lookup with a staleness window:

```bash
wrobo-biz data-cache lookup currency-rates-eur-usd 2026-04-27 --strategy staleness_window --max-staleness-days 7
```

Import JSON entries:

```bash
wrobo-biz data-cache import currency-rates-eur-usd --file ./rates.json
```

Import CSV rows by key column:

```bash
wrobo-biz data-cache import materials --file ./materials.csv --key-col SKU --value-col Price
```

## Agent Decision Guide

Use the Business API CLI when:

- You need deterministic CRUD or lookup behavior.
- You need to manipulate canonical business records.
- You need OCR-backed document ingestion into structured records.
- You need semantic retrieval over documents, expenses, or sales invoices.

Do not use the CLI as your first tool when:

- The task is purely exploratory product research or web browsing.
- You need to modify application code instead of business data.
- The required operation is not implemented in the business-api CLI`.

## Skill Summary

For AI agents, the safe default is:

1. Run `wrobo-biz ...`
2. Use `wrobo-biz help` or `wrobo-biz help <scope>` when syntax is uncertain
3. Pass valid JSON strings for structured inputs
4. Read stdout JSON as the authoritative result
5. Prefer lookup and resolve flows before mutating records
