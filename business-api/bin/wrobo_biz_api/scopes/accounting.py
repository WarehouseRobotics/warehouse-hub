"""Accounting scopes: expenses, payrolls, sales-invoices.

Aliases (mirror src/cli/commands/accounting.ts):
  expenses        -> purchase-invoices, expense-invoices, bills
  payrolls        -> payroll, nominas, nomina
  sales-invoices  -> invoice, invoices, sales-invoice
"""

from __future__ import annotations

import os
import urllib.parse
from typing import Any, Dict, List, Optional

from ..auth import require_credential, resolve_base_url
from ..errors import CliError
from ..flags import GlobalOptions, parse_flexible_flag_args
from ..http import call_api
from ..multipart import download_binary
from ._common import list_query_from_options, parse_json_positional


EXPENSE_LIST_FILTERS = {
    "status": "status",
    "supplier-contact-id": "supplierContactId",
    "supplierContactId": "supplierContactId",
    "category": "category",
}

PAYROLL_LIST_FILTERS = {
    "status": "status",
    "employee-contact-id": "employeeContactId",
    "employeeContactId": "employeeContactId",
    "country-code": "countryCode",
    "countryCode": "countryCode",
}

SALES_INVOICE_LIST_FILTERS = {
    "status": "status",
    "customer-contact-id": "customerContactId",
    "customerContactId": "customerContactId",
}


def _merge_expenses_and_payrolls(
    expenses: List[Dict[str, Any]], payrolls: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for expense in expenses:
        items.append({**expense, "entryType": "expense"})
    for payroll in payrolls:
        items.append({**payroll, "entryType": "payroll"})

    def sort_key(item: Dict[str, Any]):
        if item.get("entryType") == "expense":
            effective = item.get("invoiceDate") or item.get("createdAt") or ""
        else:
            effective = (
                item.get("periodEnd")
                or item.get("paymentDate")
                or item.get("createdAt")
                or ""
            )
        created = item.get("createdAt") or ""
        ident_field = "expenseId" if item.get("entryType") == "expense" else "payrollId"
        ident = item.get(ident_field) or ""
        return (effective, created, ident)

    items.sort(key=sort_key, reverse=True)
    return items


def handle_expenses(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(
            rest, boolean_keys={"json", "include-payrolls"}
        )
        include_payrolls = "include-payrolls" in parsed.booleans
        query = list_query_from_options(
            parsed.options, list_filter=True, scope_filters=EXPENSE_LIST_FILTERS
        )
        expenses = call_api(
            "GET", "/api/v1/expenses", base_url=base_url, token=token, query=query
        )
        if not include_payrolls:
            return expenses

        # Mirror commands/accounting.ts:55-65: payroll request reuses the
        # shared list filters plus --status, but drops the expense-only
        # filters (supplierContactId, category).
        payroll_query: List = []
        for raw_key, value in parsed.options.items():
            if raw_key in {"status"}:
                payroll_query.append(("status", str(value)))
            elif raw_key in {"similar", "limit", "since", "before", "after"}:
                payroll_query.append((raw_key, str(value)))
            elif raw_key in {"last", "until", "from"}:
                mapped = {"last": "since", "until": "before", "from": "after"}[raw_key]
                payroll_query.append((mapped, str(value)))
        payrolls = call_api(
            "GET",
            "/api/v1/payrolls",
            base_url=base_url,
            token=token,
            query=payroll_query,
        )

        expenses_list = expenses if isinstance(expenses, list) else []
        payrolls_list = payrolls if isinstance(payrolls, list) else []
        return _merge_expenses_and_payrolls(expenses_list, payrolls_list)

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "expense"
        )
        return call_api(
            "POST",
            "/api/v1/expenses",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing expense id-or-slug")
        expense_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/expenses/{urllib.parse.quote(expense_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing expense id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing expense patch JSON argument")
        expense_id = parsed.positionals[0]
        payload = parse_json_positional(parsed.positionals[1], "expense patch")
        return call_api(
            "PATCH",
            f"/api/v1/expenses/{urllib.parse.quote(expense_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown expenses subcommand: {subcommand or '(none)'}")


def handle_payrolls(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        query = list_query_from_options(
            parsed.options, list_filter=True, scope_filters=PAYROLL_LIST_FILTERS
        )
        return call_api(
            "GET", "/api/v1/payrolls", base_url=base_url, token=token, query=query
        )

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "payroll"
        )
        return call_api(
            "POST",
            "/api/v1/payrolls",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing payroll id-or-slug")
        payroll_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/payrolls/{urllib.parse.quote(payroll_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing payroll id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing payroll patch JSON argument")
        payroll_id = parsed.positionals[0]
        payload = parse_json_positional(parsed.positionals[1], "payroll patch")
        return call_api(
            "PATCH",
            f"/api/v1/payrolls/{urllib.parse.quote(payroll_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown payrolls subcommand: {subcommand or '(none)'}")


def handle_sales_invoices(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        query = list_query_from_options(
            parsed.options,
            list_filter=True,
            scope_filters=SALES_INVOICE_LIST_FILTERS,
        )
        return call_api(
            "GET",
            "/api/v1/sales-invoices",
            base_url=base_url,
            token=token,
            query=query,
        )

    if subcommand == "generate":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "sales invoice"
        )
        return call_api(
            "POST",
            "/api/v1/sales-invoices",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing sales-invoice id-or-slug")
        invoice_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/sales-invoices/{urllib.parse.quote(invoice_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing sales-invoice id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing sales-invoice patch JSON argument")
        invoice_id = parsed.positionals[0]
        payload = parse_json_positional(parsed.positionals[1], "sales invoice patch")
        return call_api(
            "PATCH",
            f"/api/v1/sales-invoices/{urllib.parse.quote(invoice_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "pdf":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing sales-invoice id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing output path")
        invoice_id = parsed.positionals[0]
        output_path = parsed.positionals[1]

        # The Business API does not expose a dedicated sales-invoice PDF
        # route; the rendered PDF is stored as a document referenced by
        # pdfDocumentId on the invoice. Fetch the invoice and stream the
        # linked document. Errors with a stable code if PDF is not ready.
        invoice = call_api(
            "GET",
            f"/api/v1/sales-invoices/{urllib.parse.quote(invoice_id, safe='')}",
            base_url=base_url,
            token=token,
        )
        if not isinstance(invoice, dict):
            raise CliError(
                "Unexpected sales-invoice response shape",
                code="unexpected_response",
            )
        document_id = invoice.get("pdfDocumentId")
        if not document_id:
            raise CliError(
                f"Sales invoice {invoice_id} has no PDF yet "
                "(pdfDocumentId is null).",
                code="pdf_not_available",
            )
        info = download_binary(
            f"/api/v1/documents/{urllib.parse.quote(document_id, safe='')}/download",
            base_url=base_url,
            token=token,
            output_path=output_path,
        )
        filename = info.get("filename") or os.path.basename(output_path)
        return {"ok": True, "outputPath": output_path, "filename": filename}

    raise CliError(f"Unknown sales-invoices subcommand: {subcommand or '(none)'}")
