"""Top-level and per-scope ``--help`` output."""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Dict, List, Optional

from .errors import CliError

HELP_TEXT = """Usage: wrobo-biz-api [global options] <scope> <subcommand> [args...] [flags...]

A thin Python HTTP wrapper for the Warehouse Hub Business API. Mirrors the
local `wrobo-biz` CLI surface but speaks HTTP to a remote business-api.

Global options (recognized anywhere):
  --base-url <url>     Override WROBO_API_BASE_URL.
  --token <token>      Override WROBO_API_TOKEN / session-file credential.
  --json               Render errors as raw JSON instead of Markdown.
  --help               Show this help text.

Environment:
  WROBO_API_BASE_URL    Default API base URL (e.g. https://hub.example.com).
  WROBO_API_TOKEN       Optional explicit credential (sess_*, wpat_*, or legacy key).
  WROBO_API_TIMEOUT_SECS Optional request timeout in seconds (default 60).
  WROBO_API_CA_BUNDLE   Optional path to a CA bundle for self-signed remote hosts.

Session file:
  ~/.config/wrobo-api/session.json  (mode 0600)

Scopes implemented in this build:
  auth          login | logout | whoami | magic-link request | magic-link consume
  tokens        create | list | revoke
  users         list | invite | revoke-invite | set-role | delete
  workspace     get | set
  company-card  get | set
  contacts      list [--query --role --type --parent-contact-id] | create <json> | get <id> | resolve <json>
  deals         list [--stage --customerContactId] | create <json> | get <id>
  projects      list [--ownerEntityId --status] | create <json> | get <id>
  tasks         list [--projectId --status --parentTaskId] | create <json> | get <id> | update <id> <json>
  comments      list [--commentable-type --commentable-id --commentable-slug --author-contact-id]
                | create <json> | get <id> | update <id> <json>
  documents     upload <file> <json> | ingest <file> <json>
                | list [--similar --limit --since --before --after] | get <id> | download <id> <out>
  expenses      create <json> | get <id> | update <id> <json>
                | list [--status --include-payrolls
                        --supplier-contact-id* --category*
                        --similar --limit --since --before --after]
                (aliases: purchase-invoices, expense-invoices, bills)
  payrolls      create <json> | get <id> | update <id> <json>
                | list [--status
                        --employee-contact-id* --country-code*
                        --similar --limit --since --before --after]
                (aliases: payroll, nominas, nomina)
  sales-invoices generate <json> | get <id> | update <id> <json> | pdf* <id> <out>
                | list [--status* --customer-contact-id*
                        --similar --limit --since --before --after]
                (aliases: invoice, invoices, sales-invoice)
  bank-accounts create <json> | get <id> | update <id> <json>
                | list [--status]
  bank-transactions create <json> | upsert <json> | get <id> | update <id> <json>
                | match <id>
                | list [--bank-account-id --status --kind
                        --limit --since --before --after]
  bank-balances record <json>
                | list [--bank-account-id
                        --limit --since --before --after]
  bank-imports csv <bank-account-id> <file> <json>
  bookings      create <json-or-flags> | get <id> | update <id> <json>
                | complete <id> [--completion-notes --create-follow-up-task
                                  --follow-up-task-title]
                | cancel <id> --reason <text>
                | delete <id>
                | check-assignment-conflicts <json-or-flags>
                | list [--from --to --status --customer-contact-id
                         --assigned-contact-id --project-id --deal-id]
                Flag-driven create/check-assignment-conflicts flags:
                  --customer-contact-id --project-id --deal-id --task-id
                  --sales-invoice-id --title --service-type --status
                  --start --end --timezone --notes
                  --assigned-contact-id (repeatable)
                  --location-kind --location-label --street1 --street2
                  --city --postal-code --country --remote-url
                  --location-notes
  booking-assignment-profiles
                list | get <contact-id>
                | set <contact-id> <json-or-flags>
                | delete <contact-id>
                Flag-driven set flags:
                  --timezone --not-bookable --buffer-before-minutes
                  --buffer-after-minutes --max-bookings-per-day
                  --effective-from --effective-to --notes
                  --availability (repeatable, "day|HH:MM|HH:MM")
                  --booking-type (repeatable)
  booking-availability-exceptions
                create <json-or-flags> | get <id> | update <id> <json>
                | delete <id>
                | list [--contact-id --kind]
                Flag-driven create flags:
                  --contact-id --kind --start --end --reason --notes
  tax-reports   ingest <file> <json> | get <id>
                | spain-position --company-card-id <id> --fiscal-year <year>
                | suggest-payments <id>
                | attach-receipt <id> <file> <json>
                | list [--country-code --tax-kind --form-code --fiscal-year
                        --payment-status
                        --similar --limit --since --before --after]
  tax-report-payment-links
                create <json> | update <id> <json>
                | list [--tax-report-id --status]
  tax-carryforwards
                list [--country-code --tax-kind --kind --status
                       --origin-fiscal-year --include-superseded]
  data-cache    list | create <slug> --name <text> --key-type <type>
                  [--description --value-schema --fetcher-config --ttl-days]
                | get <slug>
                | lookup <slug> <key> --strategy <strategy>
                  [--max-staleness-days --fetch-timeout-ms]
                | upsert <slug> <key> --value <json> [--expires-at <iso>]
                | import <slug> --file <path>
                  [--key-col <name> --value-col <name>]
                (alias: data-caches)
                * = wrapper-only extension (forwarded to the server route but
                    not exposed by the local `wrobo-biz` CLI)

Host-only scopes (rejected with exit 2):
  serve, db init, db migrate, db ...

Exit codes:
  0  success
  1  HTTP or network failure (rendered as Markdown unless --json)
  2  argument-shape / host-only / configuration failure
"""


@dataclass(frozen=True)
class ScopeHelp:
    description: str
    commands: List[str]
    examples: List[str]


HELP_ALIASES = {
    "token": "tokens",
    "user": "users",
    "company": "company-card",
    "comment": "comments",
    "data-caches": "data-cache",
    "purchase-invoices": "expenses",
    "expense-invoices": "expenses",
    "bills": "expenses",
    "payroll": "payrolls",
    "nominas": "payrolls",
    "nomina": "payrolls",
    "invoice": "sales-invoices",
    "invoices": "sales-invoices",
    "sales-invoice": "sales-invoices",
}


SCOPE_HELP: Dict[str, ScopeHelp] = {
    "db": ScopeHelp(
        description="Database bootstrap and migration tasks.",
        commands=["init", "migrate"],
        examples=["db init", "db migrate"],
    ),
    "auth": ScopeHelp(
        description="Manage Business API CLI sessions and magic-link sign-in.",
        commands=[
            "login --email <email> [--password <password>]",
            "logout",
            "whoami [--token <token>]",
            "magic-link request --email <email>",
            "magic-link consume <token>",
        ],
        examples=[
            "auth login --email owner@example.com --password owner-password",
            "auth logout",
            "auth whoami --json",
            "auth magic-link request --email owner@example.com",
            "auth magic-link consume mlt_000000000000000000000000",
        ],
    ),
    "users": ScopeHelp(
        description="Manage workspace users and invitations.",
        commands=[
            "list [--token <token>]",
            "invite --email <email> --role <admin|member> [--token <token>]",
            "revoke-invite <invitationId> [--token <token>]",
            "set-role <userId> --role <owner|admin|member> [--token <token>]",
            "delete <userId> [--token <token>]",
        ],
        examples=[
            "users list --json",
            "users invite --email teammate@example.com --role member",
            "users revoke-invite inv_000000000000",
            "users set-role usr_000000000000 --role admin",
            "users delete usr_000000000000",
        ],
    ),
    "tokens": ScopeHelp(
        description="Manage personal access tokens for the current user.",
        commands=[
            "create --name <name> --actor-type <user|agent> --scopes <read|write|admin> [--expires-at <iso>] [--token <token>]",
            "list [--token <token>]",
            "revoke <tokenId> [--token <token>]",
        ],
        examples=[
            "tokens create --name claude-desktop --actor-type agent --scopes write",
            "tokens list --json",
            "tokens revoke pat_000000000000",
        ],
    ),
    "workspace": ScopeHelp(
        description="Inspect and update the singleton workspace.",
        commands=[
            "get [--token <token>]",
            "set [--name <name>] [--slug <slug>] [--token <token>]",
        ],
        examples=[
            "workspace get --json",
            'workspace set --name "Northwind Robotics"',
            "workspace set --slug northwind-robotics",
        ],
    ),
    "company-card": ScopeHelp(
        description="Read or update the owned company profile used across business workflows.",
        commands=["get", "set <json>"],
        examples=[
            "company-card get",
            'company-card set \'{"legalName":"Northwind Robotics SL","displayName":"Northwind Robotics"}\'',
        ],
    ),
    "bank-accounts": ScopeHelp(
        description="Track manually managed bank accounts.",
        commands=[
            "create <json>",
            "get <id-or-slug>",
            "list [--status <status>]",
            "update <id-or-slug> <json>",
        ],
        examples=[
            'bank-accounts create \'{"bankName":"BBVA","displayName":"Main EUR account","ibanMasked":"ES76********1234","currency":"EUR"}\'',
            "bank-accounts list --status active",
        ],
    ),
    "bank-transactions": ScopeHelp(
        description="Create, upsert, inspect, list, update, and match bank transactions.",
        commands=[
            "create <json>",
            "upsert <json>",
            "get <id-or-slug>",
            "list [--bank-account-id <id>] [--status <status>] [--kind <kind>] [--since <duration>] [--before <date>] [--after <date>]",
            "update <id-or-slug> <json>",
            "match <id-or-slug>",
        ],
        examples=[
            'bank-transactions upsert \'{"bankAccountId":"ba_000001","transactionDate":"2026-04-29","amount":"-340,01","currency":"EUR","description":"Adeudo A Su Cargo","reference":"N 2026119000849489 Gestalea Barcelona","runningBalance":"7809,90","source":"slack_screenshot","documentId":"doc_000123","confidence":"high"}\'',
            "bank-transactions match btx_000001",
        ],
    ),
    "bank-balances": ScopeHelp(
        description="Record observed bank balances from screenshots, statements, or manual entry.",
        commands=[
            "record <json>",
            "list [--bank-account-id <id>] [--since <duration>] [--before <date>] [--after <date>]",
        ],
        examples=[
            'bank-balances record \'{"bankAccountId":"ba_000001","observedAt":"2026-04-29T13:36:00+02:00","balance":"7809,90","currency":"EUR","source":"slack_screenshot","documentId":"doc_000123"}\'',
        ],
    ),
    "bank-imports": ScopeHelp(
        description="Import bank exports as evidence documents and upsert transactions.",
        commands=["csv <bank-account-id> <file-path> <json-options>"],
        examples=[
            'bank-imports csv ba_000001 ./exports/bank.csv \'{"dateColumn":"Date","amountColumn":"Amount","descriptionColumn":"Description","referenceColumn":"Reference","balanceColumn":"Balance","defaultCurrency":"EUR"}\'',
        ],
    ),
    "bookings": ScopeHelp(
        description="Create, inspect, schedule, complete, and cancel customer bookings.",
        commands=[
            "create <json-or-flags>",
            "get <id-or-slug>",
            "list [--from <iso>] [--to <iso>] [--status <status>] [--customer-contact-id <id>] [--assigned-contact-id <id>] [--project-id <id>] [--deal-id <id>]",
            "update <id-or-slug> <json>",
            "complete <id-or-slug> [--completion-notes <text>] [--create-follow-up-task]",
            "cancel <id-or-slug> --reason <text>",
            "delete <id-or-slug>",
            "check-assignment-conflicts <json-or-flags>",
        ],
        examples=[
            'bookings create --customer-contact-id ct_000245 --title "Warehouse automation discovery visit" --service-type visit --status confirmed --start 2026-04-10T09:00:00+02:00 --end 2026-04-10T11:00:00+02:00 --timezone Europe/Madrid --assigned-contact-id ct_emp_000011 --location-kind on_site --location-label "Acme Retail warehouse"',
            'bookings create \'{"customerContactId":"ct_000245","title":"Remote onboarding workshop","serviceType":"workshop","status":"tentative","scheduledStartAt":"2026-04-11T14:00:00+02:00","scheduledEndAt":"2026-04-11T16:00:00+02:00","timezone":"Europe/Madrid","assignedContactIds":["ct_emp_000011"],"location":{"kind":"remote","label":"Zoom"}}\'',
            "bookings list --from 2026-04-10T00:00:00Z --to 2026-04-17T00:00:00Z",
            'bookings complete book_000091 --completion-notes "Site survey completed" --create-follow-up-task',
        ],
    ),
    "booking-assignment-profiles": ScopeHelp(
        description="Configure employee availability for booking assignment.",
        commands=[
            "list",
            "get <contact-id>",
            "set <contact-id> <json-or-flags>",
            "delete <contact-id>",
        ],
        examples=[
            "booking-assignment-profiles set ct_emp_000011 --timezone Europe/Madrid --availability monday|09:00|13:00 --booking-type visit",
        ],
    ),
    "booking-availability-exceptions": ScopeHelp(
        description="Manage one-off employee booking availability exceptions.",
        commands=[
            "create <json-or-flags>",
            "list [--contact-id <id>] [--kind <kind>]",
            "get <id-or-slug>",
            "update <id-or-slug> <json>",
            "delete <id-or-slug>",
        ],
        examples=[
            "booking-availability-exceptions create --contact-id ct_emp_000011 --kind time_off --start 2026-04-10T00:00:00+02:00 --end 2026-04-10T23:59:59+02:00 --reason vacation",
        ],
    ),
    "comments": ScopeHelp(
        description="Create, inspect, list, and update generic comments attached to business records.",
        commands=[
            "create <json>",
            "get <id-or-slug>",
            "list [--commentable-type <type>] [--commentable-id <id>] [--commentable-slug <slug>] [--author-contact-id <id>]",
            "update <id-or-slug> <json>",
        ],
        examples=[
            'comments create \'{"commentableType":"task","commentableSlug":"prepare-rollout","body":"Customer asked to delay by one week.","authorName":"Hub developer"}\'',
            "comments list --commentable-type task --commentable-id task_000123",
        ],
    ),
    "contacts": ScopeHelp(
        description="Create, inspect, list, or resolve contacts.",
        commands=["list", "create <json>", "get <id-or-slug>", "resolve <json>"],
        examples=[
            "contacts list",
            'contacts create \'{"type":"company","status":"active","roles":["customer"],"displayName":"Acme Retail GmbH"}\'',
            'contacts resolve \'{"autoCreate":true,"matchBy":["taxId","email"],"contact":{"type":"company","displayName":"Acme Retail GmbH"}}\'',
        ],
    ),
    "data-cache": ScopeHelp(
        description="Manage persistent reference-data caches and return generic agent instructions for missing values.",
        commands=[
            "list",
            "create <slug> --name <display-name> --key-type <type> [--description <text>] [--value-schema <json>] [--fetcher-config <json>] [--ttl-days <days>]",
            "get <slug>",
            "lookup <slug> <key> --strategy <strategy> [--max-staleness-days <days>] [--fetch-timeout-ms <ms>]",
            "upsert <slug> <key> --value <json> [--expires-at <iso-datetime>]",
            "import <slug> --file <path> [--key-col <name>] [--value-col <name>]",
        ],
        examples=[
            "data-cache list",
            'data-cache create currency-rates-eur-usd --name "Currency Rates EUR/USD" --key-type date --value-schema \'{"type":"object","properties":{"rate":{"type":"string"}},"required":["rate"]}\' --fetcher-config \'{"prompt":"Look up EUR/USD rate for {{ key }}. JSON only."}\' --ttl-days 1',
            "data-cache lookup currency-rates-eur-usd 2026-04-26 --strategy staleness_window --max-staleness-days 7",
            'data-cache upsert currency-rates-eur-usd 2026-04-26 --value \'{"rate":"1.0823"}\'',
        ],
    ),
    "documents": ScopeHelp(
        description="Upload, ingest, search, inspect, and download business documents.",
        commands=[
            "upload <file-path> <json-meta>",
            "ingest <file-path> <json-meta>",
            "list [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
            "get <id-or-slug>",
            "download <id-or-slug> <output-path>",
        ],
        examples=[
            'documents upload ./samples/docs/reference.pdf \'{"kind":"other","source":"manual_upload"}\'',
            'documents ingest ./test-data/expenses/invoice_do_2026_03.pdf \'{"kind":"expense_invoice","source":"email_forward"}\'',
            'documents ingest invoice_do_2026_03.pdf \'{"kind":"expense_invoice","source":"email_forward"}\'',
            "documents list --after 2026-04-01 --before 2026-05-01",
        ],
    ),
    "tax-reports": ScopeHelp(
        description="Inspect tax reports and manage tax payment evidence.",
        commands=[
            "ingest <file-path> <json-meta>",
            "get <id-or-slug>",
            "list [--country-code <code>] [--tax-kind <kind>] [--form-code <code>] [--fiscal-year <year>] [--payment-status <status>] [--similar <text>] [--limit <n>]",
            "spain-position --company-card-id <id-or-slug> --fiscal-year <year>",
            "suggest-payments <id-or-slug>",
            "attach-receipt <id-or-slug> <file-path> <json>",
        ],
        examples=[
            'tax-reports ingest ./tax/modelo-303-q4.pdf \'{"kind":"tax_declaration","companyCardId":"comp_000123","countryCode":"ES","source":"accountant_upload"}\'',
            "tax-reports list --country-code ES --fiscal-year 2026",
            "tax-reports spain-position --company-card-id comp_000123 --fiscal-year 2026",
            "tax-reports suggest-payments tr_000123",
            'tax-reports attach-receipt tr_000123 ./tax/receipt.pdf \'{"kind":"tax_payment_receipt","source":"authority_portal_download","link":{"amount":"1840.00","currency":"EUR","status":"confirmed","paymentReference":"AEAT-303-Q1"}}\'',
        ],
    ),
    "tax-report-payment-links": ScopeHelp(
        description="Review, confirm, or reject tax report payment evidence links.",
        commands=[
            "list [--tax-report-id <id>] [--status <status>]",
            "create <json>",
            "update <id-or-slug> <json>",
        ],
        examples=[
            "tax-report-payment-links list --tax-report-id tr_000123",
            'tax-report-payment-links create \'{"taxReportId":"tr_000123","bankTransactionId":"btx_000041","amount":"1840.00","currency":"EUR","status":"confirmed"}\'',
            'tax-report-payment-links update trpl_000123 \'{"status":"rejected","reason":"Wrong period"}\'',
        ],
    ),
    "tax-carryforwards": ScopeHelp(
        description="List tax carryforward balances derived from tax reports.",
        commands=[
            "list [--country-code <code>] [--tax-kind <kind>] [--kind <kind>] [--status <status>] [--origin-fiscal-year <year>] [--include-superseded]",
        ],
        examples=["tax-carryforwards list --country-code ES --status active"],
    ),
    "expenses": ScopeHelp(
        description="Manage expense invoices and supplier bills.",
        commands=[
            "create <json>",
            "get <id-or-slug>",
            "list [--status <status>] [--include-payrolls] [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
            "update <id-or-slug> <json>",
        ],
        examples=[
            'expenses create \'{"supplierContactId":"ct_000245","invoiceNumber":"FC-2026-0042","invoiceDate":"2026-03-25","currency":"EUR"}\'',
            "expenses list --status recorded",
            "expenses list --status recorded --include-payrolls",
            'expenses list --similar "office toner cartridges from papeleria centro" --since 2m',
        ],
    ),
    "payrolls": ScopeHelp(
        description="Manage imported payroll slips and employee payroll events.",
        commands=[
            "create <json>",
            "get <id-or-slug>",
            "list [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
            "update <id-or-slug> <json>",
        ],
        examples=[
            'payrolls create \'{"employeeContactId":"ct_000245","periodStart":"2026-03-01","periodEnd":"2026-03-31","currency":"EUR","grossSalary":"3000","netSalary":"2310"}\'',
            "payrolls list --status recorded",
            'documents ingest test_nomina.pdf \'{"kind":"payroll","source":"accountant_upload"}\'',
        ],
    ),
    "deals": ScopeHelp(
        description="Create, inspect, and list sales deals.",
        commands=["create <json>", "get <id-or-slug>", "list"],
        examples=[
            'deals create \'{"title":"Warehouse audit consulting","stage":"qualified"}\'',
            "deals list",
        ],
    ),
    "sales-invoices": ScopeHelp(
        description="Generate, inspect, search, and update outgoing sales invoices.",
        commands=[
            "generate <json>",
            "get <id-or-slug>",
            "list [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
            "update <id-or-slug> <json>",
        ],
        examples=[
            'sales-invoices generate \'{"customerContactId":"ct_000310","dealId":"deal_000041","issueDate":"2026-04-02"}\'',
            "sales-invoices list --status finalized --after 2026-04-01 --before 2026-05-01",
            'sales-invoices list --similar "warehouse audit consulting sprint" --since 1m',
        ],
    ),
    "projects": ScopeHelp(
        description="Create, inspect, and list projects.",
        commands=["create <json>", "get <id-or-slug>", "list"],
        examples=[
            'projects create \'{"ownerEntityId":"comp_000001","name":"Customer onboarding"}\'',
            "projects list",
        ],
    ),
    "tasks": ScopeHelp(
        description="Create, inspect, list, and update tasks.",
        commands=[
            "create <json>",
            "get <id-or-slug>",
            "list",
            "update <id-or-slug> <json>",
        ],
        examples=[
            'tasks create \'{"projectId":"proj_000101","title":"Review Q2 expense backlog","status":"todo","priority":"high"}\'',
            "tasks list",
            'tasks update task_000123 \'{"status":"done"}\'',
        ],
    ),
}


def canonical_help_scope(scope: Optional[str]) -> Optional[str]:
    if not scope:
        return None
    if scope in SCOPE_HELP:
        return scope
    return HELP_ALIASES.get(scope.lower())


def print_scope_help(scope: str) -> None:
    canonical_scope = canonical_help_scope(scope)
    known_scopes = ", ".join(SCOPE_HELP.keys())
    if not canonical_scope:
        raise CliError(f"Unknown help scope: {scope}. Known scopes: {known_scopes}")

    help_scope = SCOPE_HELP.get(canonical_scope)
    if not help_scope:
        raise CliError(f"Unknown help scope: {scope}. Known scopes: {known_scopes}")

    lines = [
        f"Help for {canonical_scope}",
        "",
        help_scope.description,
        "",
        "Commands:",
        *[f"  - {canonical_scope} {command}" for command in help_scope.commands],
        "",
        "Examples:",
        *[f"  - wrobo-biz {example}" for example in help_scope.examples],
    ]
    sys.stdout.write("\n".join(lines) + "\n")


def print_help() -> None:
    sys.stdout.write(HELP_TEXT)
