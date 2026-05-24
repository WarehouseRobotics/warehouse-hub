"""Session-file storage at ``~/.config/wrobo-api/session.json`` (mode 0600).

The session file caches the credential acquired via ``auth login`` or
``auth magic-link consume`` so subsequent commands can resolve auth
without re-typing it. The file is written with strict permissions and
never logged.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from .config import SESSION_FILE_PATH


def read_session_file() -> Optional[Dict[str, Any]]:
    path = SESSION_FILE_PATH
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    if not isinstance(data.get("sessionToken"), str):
        return None
    return data


def write_session_file(base_url: str, session_token: str, expires_at: str) -> Dict[str, Any]:
    payload = {
        "baseUrl": base_url,
        "sessionToken": session_token,
        "expiresAt": expires_at,
    }
    path = SESSION_FILE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2) + "\n"
    # Atomic create-with-mode: avoids the TOCTOU window where a default-umask
    # open() would briefly leave the file world-readable before chmod ran.
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(path, flags, 0o600)
    fh = None
    try:
        # Defensive fchmod: if the file already existed with looser perms,
        # the O_CREAT mode is ignored — tighten it before writing the token.
        os.fchmod(fd, 0o600)
        fh = os.fdopen(fd, "w", encoding="utf-8")
        fh.write(serialized)
    except BaseException:
        if fh is None:
            try:
                os.close(fd)
            except OSError:
                pass
        raise
    finally:
        if fh is not None:
            fh.close()
    return payload


def clear_session_file() -> None:
    try:
        SESSION_FILE_PATH.unlink()
    except FileNotFoundError:
        pass
