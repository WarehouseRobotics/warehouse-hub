"""Documents scope: upload | ingest | list | get | download."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
from typing import Any, Dict, List, Optional

from ..auth import require_credential, resolve_base_url
from ..errors import CliError
from ..flags import GlobalOptions, parse_flexible_flag_args
from ..http import call_api
from ..ingest_format import format_document_ingest_cli_output
from ..multipart import download_binary, upload_multipart
from ._common import list_query_from_options, parse_json_positional


# Intentionally empty: routes/documents.ts:39-55 only accepts the shared
# list filters (--similar/--limit/--since/--before/--after) routed through
# list_query_from_options(..., list_filter=True). No scope-specific keys.
DOCUMENT_LIST_FILTERS: Dict[str, str] = {}


def handle_documents(
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
            parsed.options, list_filter=True, scope_filters=DOCUMENT_LIST_FILTERS
        )
        return call_api("GET", "/api/v1/documents", base_url=base_url, token=token, query=query)

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing document id-or-slug")
        document_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/documents/{urllib.parse.quote(document_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand in ("upload", "ingest"):
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing file path")
        if len(parsed.positionals) < 2:
            label = "document metadata" if subcommand == "upload" else "document ingestion metadata"
            raise CliError(f"Missing {label} JSON argument")
        file_path = parsed.positionals[0]
        meta_label = "document metadata" if subcommand == "upload" else "document ingestion metadata"
        meta = parse_json_positional(parsed.positionals[1], meta_label)
        if not isinstance(meta, dict):
            raise CliError(f"{meta_label} must be a JSON object")

        fields: Dict[str, str] = {}
        for key, value in meta.items():
            if key == "overrides":
                fields["overrides"] = json.dumps(value, ensure_ascii=False)
            elif value is None:
                continue
            elif isinstance(value, (str, int, float, bool)):
                fields[key] = str(value).lower() if isinstance(value, bool) else str(value)
            else:
                fields[key] = json.dumps(value, ensure_ascii=False)

        if subcommand == "upload":
            path = "/api/v1/documents"
            mime_type = "application/octet-stream"
        else:
            path = "/api/v1/documents/ingest"
            mime_type = (
                "application/pdf" if file_path.lower().endswith(".pdf") else "image/png"
            )
        response = upload_multipart(
            "POST", path,
            base_url=base_url,
            token=token,
            file_path=file_path,
            fields=fields,
            mime_type=mime_type,
        )

        if subcommand == "ingest":
            formatted = format_document_ingest_cli_output(response)
            if formatted is not None:
                sys.stdout.write(formatted + "\n")
                sys.stdout.flush()
                return None
        return response

    if subcommand == "download":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing document id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing output path")
        document_id = parsed.positionals[0]
        output_path = parsed.positionals[1]
        # Single round-trip: the server's response.download() emits the same
        # originalFilename via Content-Disposition that GET /documents/{id}
        # would have returned in meta.filename, so we read it from the
        # download response headers instead of doing an extra metadata fetch.
        info = download_binary(
            f"/api/v1/documents/{urllib.parse.quote(document_id, safe='')}/download",
            base_url=base_url,
            token=token,
            output_path=output_path,
        )
        filename = info.get("filename") or os.path.basename(output_path)
        return {"ok": True, "outputPath": output_path, "filename": filename}

    raise CliError(f"Unknown documents subcommand: {subcommand or '(none)'}")
