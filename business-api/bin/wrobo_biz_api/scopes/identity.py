"""Identity scopes: auth, tokens, users, workspace, company-card."""

from __future__ import annotations

import getpass
import json
import sys
import urllib.parse
from typing import Any, Dict, List, Optional

from ..auth import require_credential, resolve_base_url, resolve_credential
from ..errors import CliError, HttpError
from ..flags import GlobalOptions, parse_flexible_flag_args
from ..http import call_api
from ..session import clear_session_file, write_session_file


def handle_auth(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    if subcommand == "login":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        email = parsed.options.get("email")
        if not email:
            raise CliError("Missing required option: --email")
        password = parsed.options.get("password")
        if not password:
            if sys.stdin.isatty():
                password = getpass.getpass("Password: ")
            else:
                # Match wrobo-biz behavior: warn (don't hang).
                sys.stderr.write(
                    "wrobo-biz-api: reading password from stdin (no TTY)\n"
                )
                password = sys.stdin.read().rstrip("\n")
        if not password:
            raise CliError("Missing password")

        base_url = resolve_base_url(globals_.base_url)
        body = {"email": email, "password": password}
        response = call_api("POST", "/api/v1/auth/login", base_url=base_url, token=None, json_body=body)
        if not isinstance(response, dict):
            raise HttpError("Unexpected /auth/login response shape", code="unexpected_response")

        session_token = response.get("sessionToken")
        expires_at = response.get("expiresAt")
        if not isinstance(session_token, str) or not isinstance(expires_at, str):
            raise HttpError("Login response missing sessionToken/expiresAt", code="unexpected_response")

        session_file = write_session_file(base_url, session_token, expires_at)
        return {
            "userId": response.get("userId"),
            **session_file,
            "user": response.get("user"),
        }

    if subcommand == "logout":
        token = resolve_credential(globals_.token)
        try:
            base_url = resolve_base_url(globals_.base_url)
        except CliError:
            base_url = None
        # Best-effort: try to revoke server-side if we have credentials and a URL.
        if token and base_url:
            try:
                call_api("POST", "/api/v1/auth/logout", base_url=base_url, token=token)
            except HttpError:
                # Match local CLI: tolerate 401/404 (already-revoked).
                pass
        clear_session_file()
        return {"ok": True}

    if subcommand == "whoami":
        token = require_credential(globals_.token)
        base_url = resolve_base_url(globals_.base_url)
        response = call_api("GET", "/api/v1/auth/me", base_url=base_url, token=token)
        if not isinstance(response, dict):
            raise HttpError("Unexpected /auth/me response shape", code="unexpected_response")
        # Source label derived from the presented token's prefix. Safe because
        # call_api above only returns 2xx if the server admitted the credential,
        # so an unknown-prefix token that reaches this point must be a legacy
        # API key (the wpat_/sess_ decoders reject unknown shapes upstream in
        # src/middleware/auth.ts).
        if token.startswith("sess_"):
            source = "session"
        elif token.startswith("wpat_"):
            source = "pat"
        else:
            source = "legacy"
        return {
            "user": response.get("user"),
            "workspace": response.get("workspace"),
            "source": source,
        }

    if subcommand == "magic-link":
        if not rest:
            raise CliError("Missing magic-link subcommand: request | consume")
        magic_sub = rest[0]
        magic_rest = rest[1:]

        if magic_sub == "request":
            parsed = parse_flexible_flag_args(magic_rest, boolean_keys={"json"})
            email = parsed.options.get("email")
            if not email:
                raise CliError("Missing required option: --email")
            base_url = resolve_base_url(globals_.base_url)
            call_api(
                "POST",
                "/api/v1/auth/magic-link/request",
                base_url=base_url,
                token=None,
                json_body={"email": email},
            )
            return {"ok": True}

        if magic_sub == "consume":
            if not magic_rest or magic_rest[0].startswith("--"):
                raise CliError("Missing magic-link token")
            token_value = magic_rest[0]
            base_url = resolve_base_url(globals_.base_url)
            response = call_api(
                "POST",
                "/api/v1/auth/magic-link/consume",
                base_url=base_url,
                token=None,
                json_body={"token": token_value},
            )
            if not isinstance(response, dict):
                raise HttpError("Unexpected magic-link/consume response shape", code="unexpected_response")

            session_token = response.get("sessionToken")
            expires_at = response.get("expiresAt")
            if not isinstance(session_token, str) or not isinstance(expires_at, str):
                raise HttpError(
                    "Magic-link consume response missing sessionToken/expiresAt",
                    code="unexpected_response",
                )
            session_file = write_session_file(base_url, session_token, expires_at)
            return {
                "userId": response.get("userId"),
                **session_file,
                "user": response.get("user"),
            }

        raise CliError(f"Unknown magic-link subcommand: {magic_sub}")

    raise CliError(f"Unknown auth subcommand: {subcommand or '(none)'}")


def handle_tokens(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        return call_api("GET", "/api/v1/tokens", base_url=base_url, token=token)

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        name = (parsed.options.get("name") or "").strip()
        actor_type = (parsed.options.get("actor-type") or "").strip()
        scopes_raw = (parsed.options.get("scopes") or "").strip()
        if not name:
            raise CliError("Missing required option: --name")
        if not actor_type:
            raise CliError("Missing required option: --actor-type")
        if actor_type not in ("user", "agent"):
            raise CliError("Token actor type must be user or agent")
        if not scopes_raw:
            raise CliError("Missing required option: --scopes")
        scopes = [s.strip() for s in scopes_raw.split(",") if s.strip()]
        valid_scopes = {"read", "write", "admin"}
        if not scopes or any(s not in valid_scopes for s in scopes):
            raise CliError("Token scopes must be read, write, or admin")
        body: Dict[str, Any] = {
            "name": name,
            "actorType": actor_type,
            "scopes": scopes,
        }
        expires_at = parsed.options.get("expires-at")
        if expires_at is not None:
            body["expiresAt"] = expires_at
        return call_api("POST", "/api/v1/tokens", base_url=base_url, token=token, json_body=body)

    if subcommand == "revoke":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing token ID")
        token_id = parsed.positionals[0]
        call_api("DELETE", f"/api/v1/tokens/{urllib.parse.quote(token_id, safe='')}", base_url=base_url, token=token)
        return {"ok": True, "tokenId": token_id}

    raise CliError(f"Unknown tokens subcommand: {subcommand or '(none)'}")


def handle_users(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        return call_api("GET", "/api/v1/users", base_url=base_url, token=token)

    if subcommand == "invite":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        email = parsed.options.get("email")
        role = parsed.options.get("role")
        if not email:
            raise CliError("Missing required option: --email")
        if not role:
            raise CliError("Missing required option: --role")
        if role not in ("admin", "member"):
            raise CliError("Invitation role must be admin or member")
        return call_api(
            "POST",
            "/api/v1/users/invitations",
            base_url=base_url,
            token=token,
            json_body={"email": email, "role": role},
        )

    if subcommand == "revoke-invite":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing invitation ID")
        invitation_id = parsed.positionals[0]
        return call_api(
            "DELETE",
            f"/api/v1/users/invitations/{urllib.parse.quote(invitation_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "set-role":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing user ID")
        user_id = parsed.positionals[0]
        role = parsed.options.get("role")
        if not role:
            raise CliError("Missing required option: --role")
        if role not in ("owner", "admin", "member"):
            raise CliError("User role must be owner, admin, or member")
        return call_api(
            "PATCH",
            f"/api/v1/users/{urllib.parse.quote(user_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body={"role": role},
        )

    if subcommand == "delete":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing user ID")
        user_id = parsed.positionals[0]
        call_api(
            "DELETE",
            f"/api/v1/users/{urllib.parse.quote(user_id, safe='')}",
            base_url=base_url,
            token=token,
        )
        return {"ok": True, "userId": user_id}

    raise CliError(f"Unknown users subcommand: {subcommand or '(none)'}")


def handle_workspace(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "get":
        response = call_api("GET", "/api/v1/workspace", base_url=base_url, token=token)
        # Mirror mapCliPublicWorkspace from auth-session.ts: { id, slug, name }
        if isinstance(response, dict):
            return {
                "id": response.get("id"),
                "slug": response.get("slug"),
                "name": response.get("name"),
            }
        return response

    if subcommand == "set":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        name = (parsed.options.get("name") or "").strip() or None
        slug = (parsed.options.get("slug") or "").strip() or None
        if not name and not slug:
            raise CliError("At least one of --name or --slug must be provided")
        body: Dict[str, Any] = {}
        if name:
            body["name"] = name
        if slug:
            body["slug"] = slug
        response = call_api(
            "PATCH",
            "/api/v1/workspace",
            base_url=base_url,
            token=token,
            json_body=body,
        )
        if isinstance(response, dict):
            return {
                "id": response.get("id"),
                "slug": response.get("slug"),
                "name": response.get("name"),
            }
        return response

    raise CliError(f"Unknown workspace subcommand: {subcommand or '(none)'}")


def handle_company_card(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "get":
        return call_api("GET", "/api/v1/company-card", base_url=base_url, token=token)

    if subcommand == "set":
        # Positional[0] is a JSON blob.
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing company-card JSON argument")
        raw = parsed.positionals[0]
        try:
            payload = json.loads(raw)
        except ValueError as err:
            raise CliError(f"Invalid company-card JSON argument: {raw}") from err
        return call_api(
            "PUT",
            "/api/v1/company-card",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown company-card subcommand: {subcommand or '(none)'}")
