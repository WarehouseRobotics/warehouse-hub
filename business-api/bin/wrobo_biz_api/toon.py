"""TOON encoder used by the document-ingest CLI formatter.

Python port of the encoder in
``business-api/src/lib/cli-document-ingest-format.ts``. Only the subset
needed by ``format_document_ingest_cli_output`` is implemented.
"""

from __future__ import annotations

import re
from typing import Any, List, Optional


_TOON_UNQUOTED_KEY_RE = re.compile(r"^[A-Za-z_][\w.]*$")
_TOON_NUMERIC_LIKE_RE = re.compile(r"^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$")
_TOON_LEADING_ZERO_RE = re.compile(r"^0\d+$")
_TOON_CTRL_RE = re.compile(r"[\n\r\t]")
_TOON_BRACKETS_RE = re.compile(r"[\[\]{}]")


def _escape_string(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )


def _is_safe_unquoted(value: str) -> bool:
    if not value:
        return False
    if value != value.strip():
        return False
    if value in ("true", "false", "null"):
        return False
    if _TOON_NUMERIC_LIKE_RE.match(value) or _TOON_LEADING_ZERO_RE.match(value):
        return False
    if ":" in value or '"' in value or "\\" in value:
        return False
    if _TOON_BRACKETS_RE.search(value) or _TOON_CTRL_RE.search(value):
        return False
    if "," in value:
        return False
    if value.startswith("-"):
        return False
    return True


def _encode_key(key: str) -> str:
    if _TOON_UNQUOTED_KEY_RE.match(key):
        return key
    return '"' + _escape_string(key) + '"'


def _encode_primitive(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)
    s = str(value)
    if _is_safe_unquoted(s):
        return s
    return '"' + _escape_string(s) + '"'


def _is_primitive(v: Any) -> bool:
    return v is None or isinstance(v, (str, int, float, bool))


def _extract_tabular_header(rows: List[Any]) -> Optional[List[str]]:
    if not rows or not isinstance(rows[0], dict):
        return None
    header = list(rows[0].keys())
    if not header:
        return None
    for row in rows:
        if not isinstance(row, dict) or list(row.keys()) != header:
            return None
        for k in header:
            if not _is_primitive(row[k]):
                return None
    return header


def _format_array_header(length: int, key: Optional[str] = None, fields: Optional[List[str]] = None) -> str:
    header = ""
    if key:
        header += _encode_key(key)
    header += f"[{length}]"
    if fields is not None:
        header += "{" + ",".join(_encode_key(f) for f in fields) + "}"
    header += ":"
    return header


def _encode_value(value: Any, depth: int, lines: List[str]) -> None:
    indent = "  " * depth
    if isinstance(value, dict):
        for k, v in value.items():
            ek = _encode_key(k)
            if _is_primitive(v):
                lines.append(f"{indent}{ek}: {_encode_primitive(v)}")
            elif isinstance(v, list):
                _encode_array(k, v, depth, lines)
            elif isinstance(v, dict):
                lines.append(f"{indent}{ek}:")
                if v:
                    _encode_value(v, depth + 1, lines)
    elif isinstance(value, list):
        _encode_array(None, value, depth, lines)
    elif _is_primitive(value):
        enc = _encode_primitive(value)
        if enc != "":
            lines.append(f"{indent}{enc}")


def _encode_array(key: Optional[str], value: List[Any], depth: int, lines: List[str]) -> None:
    indent = "  " * depth
    if len(value) == 0:
        lines.append(indent + _format_array_header(0, key))
        return
    if all(_is_primitive(item) for item in value):
        header = _format_array_header(len(value), key)
        joined = ",".join(_encode_primitive(v) for v in value)
        lines.append(f"{indent}{header} {joined}")
        return
    if all(isinstance(item, dict) for item in value):
        header_fields = _extract_tabular_header(value)
        if header_fields is not None:
            lines.append(indent + _format_array_header(len(value), key, header_fields))
            row_indent = "  " * (depth + 1)
            for row in value:
                lines.append(row_indent + ",".join(_encode_primitive(row[k]) for k in header_fields))
            return
    lines.append(indent + _format_array_header(len(value), key))
    for item in value:
        _encode_list_item(item, depth + 1, lines)


def _encode_list_item(item: Any, depth: int, lines: List[str]) -> None:
    indent = "  " * depth
    if _is_primitive(item):
        lines.append(f"{indent}- {_encode_primitive(item)}")
        return
    if isinstance(item, list):
        if all(_is_primitive(x) for x in item):
            header = _format_array_header(len(item))
            joined = ",".join(_encode_primitive(v) for v in item)
            lines.append(f"{indent}- {header} {joined}" if item else f"{indent}- {header}")
            return
        lines.append(f"{indent}- {_format_array_header(len(item))}")
        for sub in item:
            _encode_list_item(sub, depth + 1, lines)
        return
    if isinstance(item, dict):
        if not item:
            lines.append(f"{indent}-")
            return
        entries = list(item.items())
        first_key, first_value = entries[0]
        rest = entries[1:]
        ek = _encode_key(first_key)
        if isinstance(first_value, list) and all(isinstance(x, dict) for x in first_value):
            header_fields = _extract_tabular_header(first_value)
            if header_fields is not None:
                lines.append(
                    f"{indent}- "
                    + _format_array_header(len(first_value), first_key, header_fields)
                )
                row_indent = "  " * (depth + 2)
                for row in first_value:
                    lines.append(row_indent + ",".join(_encode_primitive(row[k]) for k in header_fields))
                if rest:
                    _encode_value(dict(rest), depth + 1, lines)
                return
        if _is_primitive(first_value):
            lines.append(f"{indent}- {ek}: {_encode_primitive(first_value)}")
        elif isinstance(first_value, list):
            if len(first_value) == 0:
                lines.append(f"{indent}- {ek}{_format_array_header(0)}")
            elif all(_is_primitive(x) for x in first_value):
                header = _format_array_header(len(first_value))
                joined = ",".join(_encode_primitive(v) for v in first_value)
                lines.append(f"{indent}- {ek}{header} {joined}")
            else:
                lines.append(f"{indent}- {ek}{_format_array_header(len(first_value))}")
                for sub in first_value:
                    _encode_list_item(sub, depth + 2, lines)
        elif isinstance(first_value, dict):
            lines.append(f"{indent}- {ek}:")
            if first_value:
                _encode_value(first_value, depth + 2, lines)
        if rest:
            _encode_value(dict(rest), depth + 1, lines)


def encode(value: Any) -> str:
    lines: List[str] = []
    _encode_value(value, 0, lines)
    return "\n".join(lines)
