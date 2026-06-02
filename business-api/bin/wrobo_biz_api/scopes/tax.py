"""Tax scopes: tax-reports, tax-report-payment-links, tax-carryforwards.

Mirrors business-api/src/cli/commands/tax-reports.ts. URL shapes come from
business-api/src/routes/tax-reports.ts and the mount paths in
business-api/src/app.ts:105-107.
"""

from __future__ import annotations

import json
import urllib.parse
from typing import Any, Dict, List, Optional

from ..auth import require_credential, resolve_base_url
from ..errors import CliError
from ..flags import GlobalOptions, parse_flexible_flag_args
from ..http import call_api
from ..multipart import upload_multipart
from ._common import list_query_from_options, parse_json_positional


TAX_REPORT_LIST_FILTERS = {
    "country-code": "countryCode",
    "countryCode": "countryCode",
    "tax-kind": "taxKind",
    "taxKind": "taxKind",
    "form-code": "formCode",
    "formCode": "formCode",
    "fiscal-year": "fiscalYear",
    "fiscalYear": "fiscalYear",
    "payment-status": "paymentStatus",
    "paymentStatus": "paymentStatus",
}

TAX_REPORT_PAYMENT_LINK_LIST_FILTERS = {
    "tax-report-id": "taxReportId",
    "taxReportId": "taxReportId",
    "status": "status",
}

TAX_CARRYFORWARD_LIST_FILTERS = {
    "country-code": "countryCode",
    "countryCode": "countryCode",
    "tax-kind": "taxKind",
    "taxKind": "taxKind",
    "kind": "kind",
    "status": "status",
    "origin-fiscal-year": "originFiscalYear",
    "originFiscalYear": "originFiscalYear",
}


def _metadata_to_multipart_fields(meta: Dict[str, Any]) -> Dict[str, str]:
    fields: Dict[str, str] = {}
    for key, value in meta.items():
        if key in ("overrides", "link"):
            fields[key] = json.dumps(value, ensure_ascii=False)
        elif value is None:
            continue
        elif isinstance(value, (str, int, float, bool)):
            fields[key] = str(value).lower() if isinstance(value, bool) else str(value)
        else:
            fields[key] = json.dumps(value, ensure_ascii=False)
    return fields


def _upload_mime_type(file_path: str) -> str:
    return "application/pdf" if file_path.lower().endswith(".pdf") else "image/png"


def handle_tax_reports(
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
            scope_filters=TAX_REPORT_LIST_FILTERS,
        )
        return call_api(
            "GET",
            "/api/v1/tax-reports",
            base_url=base_url,
            token=token,
            query=query,
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing tax-report id-or-slug")
        report_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/tax-reports/{urllib.parse.quote(report_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "ingest":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing file path")
        if len(parsed.positionals) < 2:
            raise CliError("Missing tax report ingestion metadata JSON argument")
        file_path = parsed.positionals[0]
        meta = parse_json_positional(
            parsed.positionals[1], "tax report ingestion metadata"
        )
        if not isinstance(meta, dict):
            raise CliError("tax report ingestion metadata must be a JSON object")

        return upload_multipart(
            "POST",
            "/api/v1/tax-reports/ingest",
            base_url=base_url,
            token=token,
            file_path=file_path,
            fields=_metadata_to_multipart_fields(meta),
            mime_type=_upload_mime_type(file_path),
        )

    if subcommand == "spain-position":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        company_card_id = parsed.options.get("company-card-id") or parsed.options.get(
            "companyCardId"
        )
        fiscal_year = parsed.options.get("fiscal-year") or parsed.options.get(
            "fiscalYear"
        )
        if not company_card_id:
            raise CliError("Missing required option: --company-card-id")
        if not fiscal_year:
            raise CliError("Missing required option: --fiscal-year")
        query = [("companyCardId", company_card_id), ("fiscalYear", str(fiscal_year))]
        return call_api(
            "GET",
            "/api/v1/tax-reports/positions/spain",
            base_url=base_url,
            token=token,
            query=query,
        )

    if subcommand == "suggest-payments":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing tax-report id-or-slug")
        report_id = parsed.positionals[0]
        return call_api(
            "POST",
            f"/api/v1/tax-reports/{urllib.parse.quote(report_id, safe='')}/payment-links/suggest",
            base_url=base_url,
            token=token,
        )

    if subcommand == "attach-receipt":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing tax-report id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing file path")
        if len(parsed.positionals) < 3:
            raise CliError("Missing tax payment receipt metadata JSON argument")
        report_id = parsed.positionals[0]
        file_path = parsed.positionals[1]
        meta = parse_json_positional(
            parsed.positionals[2], "tax payment receipt metadata"
        )
        if not isinstance(meta, dict):
            raise CliError("tax payment receipt metadata must be a JSON object")

        return upload_multipart(
            "POST",
            f"/api/v1/tax-reports/{urllib.parse.quote(report_id, safe='')}/payment-receipts",
            base_url=base_url,
            token=token,
            file_path=file_path,
            fields=_metadata_to_multipart_fields(meta),
            mime_type=_upload_mime_type(file_path),
        )

    raise CliError(f"Unknown tax-reports subcommand: {subcommand or '(none)'}")


def handle_tax_report_payment_links(
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
            list_filter=False,
            scope_filters=TAX_REPORT_PAYMENT_LINK_LIST_FILTERS,
        )
        return call_api(
            "GET",
            "/api/v1/tax-report-payment-links",
            base_url=base_url,
            token=token,
            query=query,
        )

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None,
            "tax report payment link",
        )
        return call_api(
            "POST",
            "/api/v1/tax-report-payment-links",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "update":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing tax-report-payment-link id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing tax report payment link patch JSON argument")
        link_id = parsed.positionals[0]
        payload = parse_json_positional(
            parsed.positionals[1], "tax report payment link patch"
        )
        return call_api(
            "PATCH",
            f"/api/v1/tax-report-payment-links/{urllib.parse.quote(link_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(
        f"Unknown tax-report-payment-links subcommand: {subcommand or '(none)'}"
    )


def handle_tax_carryforwards(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(
            rest, boolean_keys={"json", "include-superseded"}
        )
        query = list_query_from_options(
            parsed.options,
            list_filter=False,
            scope_filters=TAX_CARRYFORWARD_LIST_FILTERS,
        )
        if "include-superseded" in parsed.booleans:
            query.append(("includeSuperseded", "true"))
        return call_api(
            "GET",
            "/api/v1/tax-carryforwards",
            base_url=base_url,
            token=token,
            query=query,
        )

    raise CliError(f"Unknown tax-carryforwards subcommand: {subcommand or '(none)'}")
