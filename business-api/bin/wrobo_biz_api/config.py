"""Configuration surface and exit codes."""

from __future__ import annotations

from pathlib import Path

DEFAULT_TIMEOUT_SECS = 60
SESSION_FILE_PATH = Path.home() / ".config" / "wrobo-api" / "session.json"
USER_AGENT = "business-api-cli/remote"

EXIT_OK = 0
EXIT_HTTP_OR_NETWORK = 1
EXIT_USAGE = 2
