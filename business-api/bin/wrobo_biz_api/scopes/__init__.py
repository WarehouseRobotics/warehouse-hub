"""Per-scope command handlers.

Each scope module exposes a ``handle_<scope>(subcommand, rest, *, globals_)``
function that the dispatcher wires into ``SCOPE_HANDLERS``. New scopes
should follow this shape and register themselves in
``wrobo_biz_api.cli.SCOPE_HANDLERS``.
"""
