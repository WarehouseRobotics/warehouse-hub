"""Shared helpers used by per-scope handlers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

import json

from ..errors import CliError
from ..http import LIST_FILTER_ALIASES, LIST_FILTER_KEYS, list_filter_query_from_options


def parse_json_positional(raw: Optional[str], label: str) -> Any:
    if raw is None:
        raise CliError(f"Missing {label} JSON argument")
    try:
        return json.loads(raw)
    except ValueError as err:
        raise CliError(f"Invalid {label} JSON argument: {raw}") from err


def list_query_from_options(
    options: Dict[str, str],
    *,
    list_filter: bool,
    scope_filters: Optional[Dict[str, str]] = None,
) -> List[Tuple[str, str]]:
    """Build the GET query string from parsed options.

    scope_filters maps the CLI flag name to the server query-param name. Only
    flags present in options are emitted; unknown flags raise CliError so the
    user sees the same kind of failure they'd get from the local CLI.

    The ``list_filter`` flag enables the shared ``--similar/--limit/--since/
    --before/--after`` set; all five CRM list scopes in Task 1b pass
    ``list_filter=False`` (those filters are not exposed on the local CLI's
    CRM list commands), but Tasks 3+ (documents, expenses, sales-invoices,
    bank-*, tax-*) will opt into them, so the parameter is kept live here.
    """
    scope_filters = scope_filters or {}
    query: List[Tuple[str, str]] = []
    list_filter_recognized: Set[str] = (
        set(LIST_FILTER_ALIASES) | LIST_FILTER_KEYS if list_filter else set()
    )

    for raw_key, value in options.items():
        if raw_key in scope_filters:
            query.append((scope_filters[raw_key], str(value)))
            continue
        if list_filter and raw_key in list_filter_recognized:
            continue
        raise CliError(f"Unknown list option: --{raw_key}")

    if list_filter:
        query.extend(list_filter_query_from_options(options))

    return query
