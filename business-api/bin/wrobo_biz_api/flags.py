"""Flag parser and global-option extraction.

The flag parser mirrors ``parseFlexibleFlagArgs`` in
``business-api/src/cli/core.ts`` so the remote CLI accepts the same
``--flag value`` / ``--flag=value`` / bare-boolean forms as the local CLI.

Global options (``--base-url``, ``--token``, ``--json``, ``--help``,
``--verbose``) are stripped out of the arg list before scope dispatch so
each scope handler only sees the flags it cares about.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Set, Tuple

from .errors import CliError


@dataclass
class ParsedFlags:
    positionals: List[str] = field(default_factory=list)
    options: Dict[str, str] = field(default_factory=dict)
    booleans: Set[str] = field(default_factory=set)
    repeated: Dict[str, List[str]] = field(default_factory=dict)


def parse_flexible_flag_args(
    args: Sequence[str],
    boolean_keys: Optional[Set[str]] = None,
    repeatable_keys: Optional[Set[str]] = None,
) -> ParsedFlags:
    """Mirror of parseFlexibleFlagArgs in the TS CLI.

    Supports `--flag value`, `--flag=value`, and bare `--flag` for booleans.
    Repeatable flags accumulate into `repeated[key]` instead of `options[key]`.
    """
    boolean_keys = boolean_keys or set()
    repeatable_keys = repeatable_keys or set()

    result = ParsedFlags()
    index = 0
    args_list = list(args)

    while index < len(args_list):
        arg = args_list[index]
        if not arg.startswith("--"):
            result.positionals.append(arg)
            index += 1
            continue

        body = arg[2:]
        if "=" in body:
            key, value = body.split("=", 1)
        else:
            key = body
            value = None

        if key in boolean_keys:
            result.booleans.add(key)
            index += 1
            continue

        if value is None:
            next_arg = args_list[index + 1] if index + 1 < len(args_list) else None
            if next_arg is None or next_arg.startswith("--"):
                raise CliError(f"Missing value for option: {arg}")
            value = next_arg
            index += 2
        else:
            index += 1

        if key in repeatable_keys:
            result.repeated.setdefault(key, []).append(value)
        else:
            result.options[key] = value

    return result


# Global flags that are recognized at any position in the arg list before scope
# dispatch. They are stripped from the rest before the scope-specific parser runs.
GLOBAL_OPTION_FLAGS = {"base-url", "token"}
GLOBAL_BOOLEAN_FLAGS = {"json", "help", "verbose"}


@dataclass
class GlobalOptions:
    base_url: Optional[str] = None
    token: Optional[str] = None
    json_output: bool = False
    help_requested: bool = False
    verbose: bool = False


def extract_global_options(args: Sequence[str]) -> Tuple[GlobalOptions, List[str]]:
    """Strip global options from the args list, returning (opts, remaining)."""
    globals_ = GlobalOptions()
    remaining: List[str] = []
    index = 0
    args_list = list(args)

    while index < len(args_list):
        arg = args_list[index]
        if not arg.startswith("--"):
            remaining.append(arg)
            index += 1
            continue

        body = arg[2:]
        if "=" in body:
            key, inline_value = body.split("=", 1)
        else:
            key = body
            inline_value = None

        if key in GLOBAL_BOOLEAN_FLAGS:
            if key == "json":
                globals_.json_output = True
            elif key == "help":
                globals_.help_requested = True
            elif key == "verbose":
                globals_.verbose = True
            index += 1
            continue

        if key in GLOBAL_OPTION_FLAGS:
            if inline_value is not None:
                value = inline_value
                index += 1
            else:
                if index + 1 >= len(args_list) or args_list[index + 1].startswith("--"):
                    raise CliError(f"Missing value for option: --{key}")
                value = args_list[index + 1]
                index += 2
            if key == "base-url":
                globals_.base_url = value
            elif key == "token":
                globals_.token = value
            continue

        # Not a global flag — leave in place for scope-specific parsing.
        remaining.append(arg)
        index += 1

    return globals_, remaining
