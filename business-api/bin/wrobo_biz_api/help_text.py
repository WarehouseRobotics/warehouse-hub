"""Top-level ``--help`` output."""

from __future__ import annotations

import sys

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
                * = wrapper-only extension (forwarded to the server route but
                    not exposed by the local `wrobo-biz` CLI)

Host-only scopes (rejected with exit 2):
  serve, db init, db migrate, db ...

Other scopes (bookings, tax-*, data-cache) will be added in
subsequent tasks of the wrobo-biz-api umbrella.

Exit codes:
  0  success
  1  HTTP or network failure (rendered as Markdown unless --json)
  2  argument-shape / host-only / configuration failure
"""


def print_help() -> None:
    sys.stdout.write(HELP_TEXT)
