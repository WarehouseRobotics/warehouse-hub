"""Data-cache scope: list / create / get / lookup / upsert / import.

Mirrors business-api/src/cli/commands/data-cache.ts. URL shapes come from
business-api/src/routes/data-caches.ts and the mount path in
business-api/src/app.ts (`/api/v1/data-caches`).

The ``import`` subcommand is wired (the server exposes
``POST /api/v1/data-caches/<slug>/import``) but it does its file reading
client-side: the local CLI parses the file, then calls the service. The
wrapper does the same. CSV parsing is a direct Python port of
``parseCsvLine``/``parseCsvEntries`` from the TS file so the same
``--key-col``/``--value-col`` semantics apply.
"""

from __future__ import annotations

import json
import os
import urllib.parse
from typing import Any, Dict, List, Optional

from ..auth import require_credential, resolve_base_url
from ..errors import CliError
from ..flags import GlobalOptions, parse_flexible_flag_args
from ..http import call_api
from ._common import parse_json_positional


def _parse_csv_line(line: str) -> List[str]:
    cells: List[str] = []
    current: List[str] = []
    in_quotes = False
    i = 0
    length = len(line)
    while i < length:
        char = line[i]
        nxt = line[i + 1] if i + 1 < length else ""
        if char == '"':
            if in_quotes and nxt == '"':
                current.append('"')
                i += 2
                continue
            in_quotes = not in_quotes
            i += 1
            continue
        if char == "," and not in_quotes:
            cells.append("".join(current))
            current = []
            i += 1
            continue
        current.append(char)
        i += 1
    cells.append("".join(current))
    return [c.strip() for c in cells]


def _parse_csv_entries(
    file_path: str, key_column: str, value_column: Optional[str]
) -> List[Dict[str, Any]]:
    with open(file_path, "r", encoding="utf-8") as fh:
        raw = fh.read()
    lines = [line.rstrip() for line in raw.replace("\r\n", "\n").split("\n") if line.strip()]
    if len(lines) < 2:
        raise CliError("CSV file must contain a header row and at least one data row")

    headers = _parse_csv_line(lines[0])
    try:
        key_index = headers.index(key_column)
    except ValueError as err:
        raise CliError(f"CSV key column not found: {key_column}") from err

    value_index = -1
    if value_column:
        try:
            value_index = headers.index(value_column)
        except ValueError as err:
            raise CliError(f"CSV value column not found: {value_column}") from err

    entries: List[Dict[str, Any]] = []
    for line in lines[1:]:
        cells = _parse_csv_line(line)
        if key_index >= len(cells) or not cells[key_index]:
            raise CliError("CSV row is missing a key value")
        key = cells[key_index]

        if value_column and value_index >= 0:
            value: Dict[str, Any] = {
                "value": cells[value_index] if value_index < len(cells) else "",
            }
        else:
            value = {}
            for column_index, header in enumerate(headers):
                if column_index == key_index:
                    continue
                value[header] = cells[column_index] if column_index < len(cells) else ""

        entries.append({"key": key, "value": value})

    return entries


def _parse_number(value: Optional[str], *, field: str) -> Optional[float]:
    if value is None:
        return None
    try:
        if "." in value or "e" in value or "E" in value:
            return float(value)
        return int(value)
    except ValueError as err:
        raise CliError(f"Option --{field} must be numeric, got: {value!r}") from err


def _strip_none(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def handle_data_cache(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        return call_api("GET", "/api/v1/data-caches", base_url=base_url, token=token)

    if subcommand == "create":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing data-cache slug")
        slug = rest[0]
        parsed = parse_flexible_flag_args(rest[1:], boolean_keys={"json"})
        name = parsed.options.get("name")
        if not name:
            raise CliError("Missing required option: --name")
        key_type = parsed.options.get("key-type")
        if not key_type:
            raise CliError("Missing required option: --key-type")

        value_schema = None
        if parsed.options.get("value-schema"):
            value_schema = parse_json_positional(
                parsed.options["value-schema"], "data-cache value schema"
            )
        fetcher_config = None
        if parsed.options.get("fetcher-config"):
            fetcher_config = parse_json_positional(
                parsed.options["fetcher-config"], "data-cache fetcher config"
            )
        default_ttl_days = _parse_number(parsed.options.get("ttl-days"), field="ttl-days")

        payload = _strip_none(
            {
                "slug": slug,
                "displayName": name,
                "description": parsed.options.get("description"),
                "keyType": key_type,
                "valueSchema": value_schema,
                "fetcherConfig": fetcher_config,
                "defaultTtlDays": default_ttl_days,
            }
        )
        return call_api(
            "POST",
            "/api/v1/data-caches",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "get":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing data-cache slug")
        slug = rest[0]
        return call_api(
            "GET",
            f"/api/v1/data-caches/{urllib.parse.quote(slug, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "lookup":
        if len(rest) < 2 or rest[0].startswith("--") or rest[1].startswith("--"):
            raise CliError("Usage: data-cache lookup <slug> <key> --strategy <strategy>")
        slug = rest[0]
        key = rest[1]
        parsed = parse_flexible_flag_args(rest[2:], boolean_keys={"json"})
        strategy = parsed.options.get("strategy")
        if not strategy:
            raise CliError("Missing required option: --strategy")
        payload = _strip_none(
            {
                "key": key,
                "strategy": strategy,
                "maxStalenessWindow": _parse_number(
                    parsed.options.get("max-staleness-days"),
                    field="max-staleness-days",
                ),
                "fetchTimeoutMs": _parse_number(
                    parsed.options.get("fetch-timeout-ms"),
                    field="fetch-timeout-ms",
                ),
            }
        )
        return call_api(
            "POST",
            f"/api/v1/data-caches/{urllib.parse.quote(slug, safe='')}/lookup",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "upsert":
        if len(rest) < 2 or rest[0].startswith("--") or rest[1].startswith("--"):
            raise CliError("Usage: data-cache upsert <slug> <key> --value <json>")
        slug = rest[0]
        key = rest[1]
        parsed = parse_flexible_flag_args(rest[2:], boolean_keys={"json"})
        raw_value = parsed.options.get("value")
        if raw_value is None:
            raise CliError("Missing required option: --value")
        value = parse_json_positional(raw_value, "data-cache entry value")
        payload = _strip_none(
            {
                "key": key,
                "value": value,
                "expiresAt": parsed.options.get("expires-at"),
            }
        )
        return call_api(
            "POST",
            f"/api/v1/data-caches/{urllib.parse.quote(slug, safe='')}/entries",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "import":
        if not rest or rest[0].startswith("--"):
            raise CliError("Usage: data-cache import <slug> --file <path>")
        slug = rest[0]
        parsed = parse_flexible_flag_args(rest[1:], boolean_keys={"json"})
        file_path = parsed.options.get("file")
        if not file_path:
            raise CliError("Missing --file option")

        ext = os.path.splitext(file_path)[1].lower()
        entries: List[Dict[str, Any]]
        if ext == ".json":
            with open(file_path, "r", encoding="utf-8") as fh:
                raw = fh.read()
            parsed_json = parse_json_positional(raw, "data-cache import file")
            if isinstance(parsed_json, list):
                entries = list(parsed_json)
            elif isinstance(parsed_json, dict) and isinstance(parsed_json.get("entries"), list):
                entries = list(parsed_json["entries"])
            else:
                raise CliError(
                    "JSON import file must be either an array of entries or "
                    "an object with an `entries` array"
                )
        elif ext == ".csv":
            key_col = parsed.options.get("key-col")
            if not key_col:
                raise CliError("CSV imports require --key-col")
            entries = _parse_csv_entries(
                file_path, key_col, parsed.options.get("value-col")
            )
        else:
            raise CliError(
                f"Unsupported import file type: {ext or 'unknown'}"
            )

        return call_api(
            "POST",
            f"/api/v1/data-caches/{urllib.parse.quote(slug, safe='')}/import",
            base_url=base_url,
            token=token,
            json_body={"entries": entries},
        )

    raise CliError(f"Unknown data-cache subcommand: {subcommand or '(none)'}")
