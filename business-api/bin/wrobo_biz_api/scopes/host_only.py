"""Host-only scope rejections.

``serve`` and ``db *`` are host-only: they touch the local SQLite database
in-process and have no HTTP equivalent. All other scopes are wired in this
build (the wrobo-biz-api umbrella has closed); ``PENDING_SCOPES`` is kept
as an empty set so the dispatcher's scope/typo distinction stays uniform.
"""

from __future__ import annotations

from typing import Set

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


PENDING_SCOPES: Set[str] = set()


def handle_pending(scope: str) -> None:
    raise CliError(
        f"Scope `{scope}` is not yet wired in this build of wrobo-biz-api.",
        code="scope_not_implemented",
    )
