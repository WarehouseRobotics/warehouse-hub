"""Credential resolution and HTTP auth headers.

Mirrors ``resolveCliAuthFromCredential`` in
``business-api/src/cli/auth-session.ts`` and the header-shape logic in
``business-api/src/middleware/auth.ts``.
"""

from __future__ import annotations

import os
import urllib.parse
from typing import Dict, Optional

from .errors import CliError
from .session import read_session_file


def resolve_credential(explicit_token: Optional[str]) -> Optional[str]:
    """Resolve the credential to use, but do NOT fail when none is found.

    Some endpoints (e.g. POST /api/v1/auth/login) are credential-free, so
    callers decide whether absence is an error.

    Resolution order (matches resolveCliAuthFromCredential in the TS CLI):
      1. --token flag
      2. WROBO_API_TOKEN env
      3. ~/.config/wrobo-api/session.json (mode 0600), sessionToken field
      4. None
    """
    if explicit_token:
        return explicit_token

    env_token = os.environ.get("WROBO_API_TOKEN")
    if env_token:
        return env_token

    session = read_session_file()
    if session and isinstance(session.get("sessionToken"), str):
        return session["sessionToken"]

    return None


def require_credential(explicit_token: Optional[str]) -> str:
    token = resolve_credential(explicit_token)
    if not token:
        # Missing credential is a local configuration/argument error, not an
        # HTTP failure, so it exits 2 per docs/plans/cli-wrapper-api-transport.plan.md.
        raise CliError(
            "CLI authentication is required",
            code="unauthorized",
        )
    return token


def auth_headers_for_token(token: str) -> Dict[str, str]:
    """Inject the right header based on token prefix.

    Matches src/middleware/auth.ts:
      - sess_*  -> Cookie: wh_session=<token>
      - wpat_*  -> Authorization: Bearer <token>
      - legacy  -> x-api-key: <token>
    """
    if token.startswith("sess_"):
        return {"Cookie": f"wh_session={urllib.parse.quote(token, safe='')}"}
    if token.startswith("wpat_"):
        return {"Authorization": f"Bearer {token}"}
    return {"x-api-key": token}


def resolve_base_url(cli_base_url: Optional[str]) -> str:
    if cli_base_url:
        return cli_base_url
    env_value = os.environ.get("WROBO_API_BASE_URL")
    if env_value:
        return env_value
    # Last resort: session file may carry the base URL.
    session = read_session_file()
    if session and isinstance(session.get("baseUrl"), str) and session["baseUrl"].strip():
        return session["baseUrl"]
    raise CliError(
        "Base URL is required: pass --base-url <url> or set WROBO_API_BASE_URL",
        code="missing_base_url",
    )
