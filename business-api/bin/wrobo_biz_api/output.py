"""Output formatting and error rendering.

Successful command results are printed as pretty JSON. Errors render as
the documented Markdown block (matching
``docs/apps/business-api/cli.md`` lines 57-85) unless ``--json`` is set.
"""

from __future__ import annotations

import json
import sys
from typing import Any, List

from .errors import CliError, HttpError


def print_json(value: Any) -> None:
    sys.stdout.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def render_markdown_error(command: str, error: Exception) -> str:
    """Render an error as the documented Markdown block.

    Matches docs/apps/business-api/cli.md lines 57-85 (Business API CLI Error).
    """
    if isinstance(error, HttpError):
        error_type = error.code or "http_error"
        message = str(error) or "Unknown error"
        details = error.details
        url = error.url
    elif isinstance(error, CliError):
        error_type = error.code or "cli_usage_error"
        message = str(error) or "Unknown error"
        details = error.details
        url = None
    else:
        error_type = type(error).__name__
        message = str(error) or "Unknown error"
        details = None
        url = None

    sections: List[str] = [
        "# Business API CLI Error",
        "",
        "## Command",
        "",
        f"`{command or '(no command provided)'}`",
        "",
        "## Error Type",
        "",
        f"`{error_type}`",
        "",
        "## Error Message",
        "",
        message,
    ]

    if isinstance(error, HttpError) and error.status_code is not None:
        sections += ["", "## HTTP Status", "", f"`{error.status_code}`"]

    if details is not None:
        try:
            pretty = json.dumps(details, indent=2, ensure_ascii=False)
        except (TypeError, ValueError):
            pretty = str(details)
        sections += ["", "## Details", "", "```json", pretty, "```"]

    if url:
        sections += ["", "## Request URL", "", f"`{url}`"]

    sections += ["", "## Error Message Summary", "", message]

    return "\n".join(sections)


def write_error_stderr(text: str) -> None:
    if not text.endswith("\n"):
        text += "\n"
    sys.stderr.write(text)
    sys.stderr.flush()
