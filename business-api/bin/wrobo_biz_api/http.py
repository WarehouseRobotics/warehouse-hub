"""HTTP transport: URL joining, request execution, JSON envelope handling.

``call_api`` is the workhorse used by every scope handler. ``http_request``
is the lower-level primitive that always returns an ``HttpResponse`` for
both success and non-2xx responses; only true network failures raise
``HttpError`` directly.
"""

from __future__ import annotations

import json
import os
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from .auth import auth_headers_for_token
from .config import DEFAULT_TIMEOUT_SECS, USER_AGENT
from .errors import CliError, HttpError


@dataclass
class HttpResponse:
    status_code: int
    headers: Dict[str, str]
    body: bytes

    @property
    def text(self) -> str:
        try:
            return self.body.decode("utf-8")
        except UnicodeDecodeError:
            return self.body.decode("utf-8", errors="replace")

    def json(self) -> Any:
        if not self.body:
            return None
        return json.loads(self.text)


def ssl_context() -> Optional[ssl.SSLContext]:
    bundle = (os.environ.get("WROBO_API_CA_BUNDLE") or "").strip()
    if not bundle:
        return None
    if not os.path.isfile(bundle):
        raise CliError(
            f"WROBO_API_CA_BUNDLE points to non-existent file: {bundle}",
            code="ca_bundle_not_found",
        )
    return ssl.create_default_context(cafile=bundle)


def timeout_secs() -> float:
    raw = os.environ.get("WROBO_API_TIMEOUT_SECS")
    if not raw:
        return float(DEFAULT_TIMEOUT_SECS)
    try:
        value = float(raw)
        if value <= 0:
            raise ValueError
        return value
    except ValueError as err:
        raise CliError(f"WROBO_API_TIMEOUT_SECS must be a positive number, got {raw!r}") from err


_API_VERSION_SUFFIX_RE = re.compile(r"/api/v\d+$")


def join_url(base_url: str, path: str, query: Optional[Sequence[Tuple[str, str]]] = None) -> str:
    base = base_url.rstrip("/")
    # The CLI passes fully-qualified paths like "/api/v1/...". If the user's
    # --base-url already includes that prefix, naive concatenation produces
    # "/api/v1/api/v1/..." which the server 404s with a confusing message.
    if _API_VERSION_SUFFIX_RE.search(base):
        raise CliError(
            f"--base-url / WROBO_API_BASE_URL must not include the /api/vN prefix (got {base_url!r})",
            code="invalid_base_url",
        )
    if not path.startswith("/"):
        path = "/" + path
    url = base + path
    if query:
        url = url + "?" + urllib.parse.urlencode(list(query), doseq=True)
    return url


def http_request(
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    json_body: Any = None,
) -> HttpResponse:
    """Perform an HTTP request and return the response (success or HTTP error body).

    Raises HttpError only for network/transport failures — HTTP non-2xx responses
    are returned to the caller so command-specific handlers can render them
    consistently.
    """
    merged_headers: Dict[str, str] = {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    if headers:
        merged_headers.update(headers)

    data: Optional[bytes] = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        merged_headers.setdefault("Content-Type", "application/json")

    request = urllib.request.Request(url=url, data=data, method=method.upper(), headers=merged_headers)

    try:
        with urllib.request.urlopen(
            request, timeout=timeout_secs(), context=ssl_context()
        ) as resp:
            body = resp.read()
            return HttpResponse(
                status_code=resp.status,
                headers={k: v for k, v in resp.headers.items()},
                body=body,
            )
    except urllib.error.HTTPError as err:
        body = err.read() if err.fp else b""
        return HttpResponse(
            status_code=err.code,
            headers={k: v for k, v in (err.headers.items() if err.headers else [])},
            body=body,
        )
    except urllib.error.URLError as err:
        raise HttpError(
            f"Network error reaching {url}: {err.reason}",
            code="network_error",
            url=url,
        ) from err
    except (TimeoutError, OSError) as err:
        raise HttpError(
            f"Network error reaching {url}: {err}",
            code="network_error",
            url=url,
        ) from err


def call_api(
    method: str,
    path: str,
    *,
    base_url: str,
    token: Optional[str],
    json_body: Any = None,
    query: Optional[Sequence[Tuple[str, str]]] = None,
) -> Any:
    """Convenience wrapper: build URL, inject auth header, parse JSON, raise on error."""
    headers: Dict[str, str] = {}
    if token:
        headers.update(auth_headers_for_token(token))

    url = join_url(base_url, path, query)
    response = http_request(method, url, headers=headers, json_body=json_body)

    if 200 <= response.status_code < 300:
        if response.status_code == 204 or not response.body:
            return None
        try:
            return response.json()
        except ValueError:
            # Endpoint returned non-JSON 2xx (rare for this CLI) — bubble raw text
            return response.text

    raise http_error_from_response(response, url)


def http_error_from_response(response: HttpResponse, url: str) -> HttpError:
    """Parse the {error: {...}} envelope and produce an HttpError."""
    parsed: Any = None
    if response.body:
        try:
            parsed = response.json()
        except ValueError:
            parsed = None

    code = "http_error"
    message = f"HTTP {response.status_code}"
    details: Any = None
    if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
        error_obj = parsed["error"]
        code = str(error_obj.get("code") or code)
        message = str(error_obj.get("message") or message)
        details = error_obj.get("details")
    elif isinstance(parsed, dict):
        message = str(parsed.get("message") or message)

    return HttpError(
        message,
        code=code,
        status_code=response.status_code,
        details=details,
        raw_body=response.text if response.body else None,
        url=url,
    )


# ---------------------------------------------------------------------------
# Shared list-filter query helpers
# ---------------------------------------------------------------------------

LIST_FILTER_ALIASES = {
    "last": "since",
    "until": "before",
    "from": "after",
}
LIST_FILTER_KEYS = {"similar", "limit", "since", "before", "after"}


def list_filter_query_from_options(options: Dict[str, str]) -> List[Tuple[str, str]]:
    """Translate the list-filter flag values into query params for the server.

    The server's parseCliListFilters validates ranges; we just pass them
    through and let the API enforce. We accept aliases to match the CLI.
    """
    query: List[Tuple[str, str]] = []
    for raw_key, value in options.items():
        key = LIST_FILTER_ALIASES.get(raw_key, raw_key)
        if key in LIST_FILTER_KEYS and value is not None:
            query.append((key, str(value)))
    return query


__all__ = [
    "HttpResponse",
    "call_api",
    "http_request",
    "http_error_from_response",
    "join_url",
    "ssl_context",
    "timeout_secs",
    "LIST_FILTER_ALIASES",
    "LIST_FILTER_KEYS",
    "list_filter_query_from_options",
]
