"""wrobo-biz-api: Remote HTTP CLI wrapper for the Warehouse Hub Business API.

This package backs the ``business-api/bin/wrobo-biz-api`` executable. It is a
thin, dependency-free Python 3.9+ stdlib client that mirrors the local
``wrobo-biz`` CLI surface but speaks HTTP to a remote business-api instance.

Source-of-truth for command shapes is the local CLI under
business-api/src/cli/commands/ and the matching routers under
business-api/src/routes/.
"""

from .cli import main

__all__ = ["main"]
