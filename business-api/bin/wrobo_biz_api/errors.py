"""Exception types for the remote CLI.

``CliError`` covers argument-shape, host-only, and local-configuration
failures (exit 2). ``HttpError`` covers network failures and non-2xx
responses from the remote business-api (exit 1).
"""

from __future__ import annotations

from typing import Any, Optional


class CliError(Exception):
    """Raised for argument-shape, host-only, and configuration errors (exit 2)."""

    def __init__(self, message: str, *, code: str = "cli_usage_error", details: Any = None):
        super().__init__(message)
        self.code = code
        self.details = details


class HttpError(Exception):
    """Raised when the API returns an error response or the network fails (exit 1)."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "http_error",
        status_code: Optional[int] = None,
        details: Any = None,
        raw_body: Optional[str] = None,
        url: Optional[str] = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details
        self.raw_body = raw_body
        self.url = url
