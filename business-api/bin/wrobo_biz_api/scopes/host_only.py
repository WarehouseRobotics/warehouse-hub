"""Host-only and not-yet-wired scope rejections.

``serve`` and ``db *`` are host-only: they touch the local SQLite database
in-process and have no HTTP equivalent. The remaining scopes listed in
``PENDING_SCOPES`` will be added in subsequent tasks of the wrobo-biz-api
umbrella; until then the dispatcher rejects them with a stable error code
so callers can distinguish "not implemented yet" from "typo".
"""

from __future__ import annotations

from ..errors import CliError


HOST_ONLY_SCOPES = {
    "serve": (
        "`serve` is a host-only command. The Business API server process must be "
        "started directly on the host that owns the database; it cannot be driven "
        "over HTTP. Use `./container.sh build` or `npm run dev` inside the "
        "business-api container instead."
    ),
    "db": (
        "`db` commands are host-only. Database initialization and migration run "
        "in-process against the local SQLite file and have no HTTP equivalent. "
        "Use `./container.sh exec npm run cli -- db <subcommand>` on the host that "
        "owns the database instead."
    ),
}


def handle_host_only(scope: str) -> None:
    message = HOST_ONLY_SCOPES.get(scope, "This is a host-only command.")
    raise CliError(message, code="host_only_command")


PENDING_SCOPES = {
    "data-cache",
}


def handle_pending(scope: str) -> None:
    raise CliError(
        f"Scope `{scope}` is not yet wired in this build of wrobo-biz-api. "
        "It will be added in a follow-up task of the wrobo-biz-api umbrella.",
        code="scope_not_implemented",
    )
