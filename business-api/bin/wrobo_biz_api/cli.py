"""Top-level dispatcher and entry point."""

from __future__ import annotations

import json
import sys
from typing import Any, Callable, Dict, List, Optional

from .config import EXIT_HTTP_OR_NETWORK, EXIT_OK, EXIT_USAGE
from .errors import CliError, HttpError
from .flags import extract_global_options
from .help_text import print_help
from .output import print_json, render_markdown_error, write_error_stderr
from .scopes.accounting import (
    handle_expenses,
    handle_payrolls,
    handle_sales_invoices,
)
from .scopes.banking import (
    handle_bank_accounts,
    handle_bank_balances,
    handle_bank_imports,
    handle_bank_transactions,
)
from .scopes.crm import (
    handle_comments,
    handle_contacts,
    handle_deals,
    handle_projects,
    handle_tasks,
)
from .scopes.documents import handle_documents
from .scopes.host_only import PENDING_SCOPES, handle_host_only, handle_pending
from .scopes.identity import (
    handle_auth,
    handle_company_card,
    handle_tokens,
    handle_users,
    handle_workspace,
)


SCOPE_HANDLERS: Dict[str, Callable[..., Any]] = {
    "auth": handle_auth,
    "tokens": handle_tokens,
    "users": handle_users,
    "workspace": handle_workspace,
    "company-card": handle_company_card,
    "contacts": handle_contacts,
    "deals": handle_deals,
    "projects": handle_projects,
    "tasks": handle_tasks,
    "comments": handle_comments,
    "documents": handle_documents,
    "expenses": handle_expenses,
    "payrolls": handle_payrolls,
    "sales-invoices": handle_sales_invoices,
    "bank-accounts": handle_bank_accounts,
    "bank-transactions": handle_bank_transactions,
    "bank-balances": handle_bank_balances,
    "bank-imports": handle_bank_imports,
}

# Aliases honored locally (mirror src/cli/registry.ts where these are defined).
SCOPE_ALIASES = {
    "token": "tokens",
    "user": "users",
    "company": "company-card",
    "comment": "comments",
    # accounting (src/cli/commands/accounting.ts)
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


def dispatch(argv: List[str]) -> int:
    if not argv or argv[0] in ("help", "--help", "-h"):
        print_help()
        return EXIT_OK

    try:
        globals_, remaining = extract_global_options(argv)
    except CliError as err:
        return _report_error(" ".join(argv), err, json_output=False)

    if globals_.help_requested or not remaining:
        print_help()
        return EXIT_OK

    scope_raw = remaining[0]
    rest = remaining[1:]
    scope = SCOPE_ALIASES.get(scope_raw, scope_raw)
    subcommand = rest[0] if rest else None
    subcommand_rest = rest[1:] if rest else []

    command_for_error = " ".join(argv)

    try:
        if scope == "serve":
            handle_host_only("serve")  # raises
        if scope == "db":
            handle_host_only("db")  # raises

        if scope in PENDING_SCOPES:
            handle_pending(scope)  # raises

        handler = SCOPE_HANDLERS.get(scope)
        if not handler:
            raise CliError(f"Unknown scope: {scope_raw}")

        result = handler(subcommand, subcommand_rest, globals_=globals_)
        if result is not None:
            print_json(result)
        return EXIT_OK
    except (CliError, HttpError) as err:
        return _report_error(command_for_error, err, json_output=globals_.json_output)
    except KeyboardInterrupt:
        sys.stderr.write("Interrupted\n")
        return 130
    except Exception as err:  # pragma: no cover  defensive
        return _report_error(command_for_error, err, json_output=globals_.json_output)


def _report_error(command: str, error: Exception, *, json_output: bool) -> int:
    if json_output:
        if isinstance(error, HttpError):
            envelope: Dict[str, Any] = {
                "error": {
                    "code": error.code,
                    "message": str(error),
                }
            }
            if error.status_code is not None:
                envelope["error"]["statusCode"] = error.status_code
            if error.details is not None:
                envelope["error"]["details"] = error.details
            if error.url:
                envelope["error"]["url"] = error.url
            sys.stderr.write(json.dumps(envelope, indent=2, ensure_ascii=False) + "\n")
        elif isinstance(error, CliError):
            envelope = {"error": {"code": error.code, "message": str(error)}}
            if error.details is not None:
                envelope["error"]["details"] = error.details
            sys.stderr.write(json.dumps(envelope, indent=2, ensure_ascii=False) + "\n")
        else:
            envelope = {"error": {"code": type(error).__name__, "message": str(error)}}
            sys.stderr.write(json.dumps(envelope, indent=2, ensure_ascii=False) + "\n")
    else:
        write_error_stderr(render_markdown_error(command, error))

    if isinstance(error, CliError):
        return EXIT_USAGE
    if isinstance(error, HttpError):
        return EXIT_HTTP_OR_NETWORK
    return EXIT_HTTP_OR_NETWORK


def main(argv: Optional[List[str]] = None) -> int:
    return dispatch(list(argv if argv is not None else sys.argv[1:]))
