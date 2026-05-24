"""Multipart upload and binary download helpers (used by the documents scope).

Both helpers reuse the auth-header logic and SSL/timeout settings from
``http``; they exist as separate functions because they need streaming
bodies / responses that ``call_api`` does not handle.
"""

from __future__ import annotations

import io
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, Optional, Tuple

from .auth import auth_headers_for_token
from .config import USER_AGENT
from .errors import CliError, HttpError
from .http import HttpResponse, http_error_from_response, join_url, ssl_context, timeout_secs


def _build_multipart_body(
    file_path: str,
    fields: Dict[str, str],
    *,
    file_field: str = "file",
    mime_type: str = "application/octet-stream",
) -> Tuple[bytes, str]:
    """Encode a multipart/form-data body using stdlib only.

    Mirrors the contract expected by routes/documents.ts:18-90: the file
    arrives in field ``file``; top-level scalars (kind, companyCardId,
    source, targetSalesInvoiceId) ride alongside as regular text fields;
    ``overrides`` is sent as a JSON-encoded string and decoded server-side
    by parseMultipartJson.
    """
    boundary = "----wrobo-biz-api-" + uuid.uuid4().hex
    buf = io.BytesIO()
    crlf = b"\r\n"
    bdy = ("--" + boundary).encode("utf-8")

    for name, value in fields.items():
        buf.write(bdy + crlf)
        disposition = f'Content-Disposition: form-data; name="{name}"'
        buf.write(disposition.encode("utf-8") + crlf + crlf)
        buf.write(value.encode("utf-8") + crlf)

    filename = os.path.basename(file_path) or "upload.bin"
    # RFC 7578 / RFC 2616 quoted-string: backslash-escape backslashes and
    # double-quotes so weird filenames cannot break out of the header.
    safe_filename = filename.replace("\\", "\\\\").replace('"', '\\"')
    buf.write(bdy + crlf)
    file_disp = (
        f'Content-Disposition: form-data; name="{file_field}"; filename="{safe_filename}"'
    )
    buf.write(file_disp.encode("utf-8") + crlf)
    buf.write(f"Content-Type: {mime_type}".encode("utf-8") + crlf + crlf)
    with open(file_path, "rb") as fh:
        buf.write(fh.read())
    buf.write(crlf)
    buf.write(("--" + boundary + "--").encode("utf-8") + crlf)

    content_type = f"multipart/form-data; boundary={boundary}"
    return buf.getvalue(), content_type


def upload_multipart(
    method: str,
    path: str,
    *,
    base_url: str,
    token: Optional[str],
    file_path: str,
    fields: Dict[str, str],
    mime_type: str = "application/octet-stream",
) -> Any:
    if not os.path.isfile(file_path):
        raise CliError(f"File not found: {file_path}", code="file_not_found")

    body, content_type = _build_multipart_body(file_path, fields, mime_type=mime_type)
    headers: Dict[str, str] = {"Content-Type": content_type}
    if token:
        headers.update(auth_headers_for_token(token))
    headers["Accept"] = "application/json"
    headers["User-Agent"] = USER_AGENT

    url = join_url(base_url, path)
    request = urllib.request.Request(url=url, data=body, method=method.upper(), headers=headers)
    try:
        with urllib.request.urlopen(
            request, timeout=timeout_secs(), context=ssl_context()
        ) as resp:
            raw = resp.read()
            response = HttpResponse(
                status_code=resp.status,
                headers={k: v for k, v in resp.headers.items()},
                body=raw,
            )
    except urllib.error.HTTPError as err:
        raw = err.read() if err.fp else b""
        response = HttpResponse(
            status_code=err.code,
            headers={k: v for k, v in (err.headers.items() if err.headers else [])},
            body=raw,
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

    if 200 <= response.status_code < 300:
        if response.status_code == 204 or not response.body:
            return None
        try:
            return response.json()
        except ValueError:
            return response.text
    raise http_error_from_response(response, url)


def download_binary(
    path: str,
    *,
    base_url: str,
    token: Optional[str],
    output_path: str,
) -> Dict[str, str]:
    """Stream GET <path> to ``output_path`` and return {filename, contentType}.

    Returns the parsed Content-Disposition filename (if any) and the
    Content-Type the server advertised, so the caller can build the same
    receipt as the local CLI in commands/documents.ts:90-91.
    """
    headers: Dict[str, str] = {"User-Agent": USER_AGENT}
    if token:
        headers.update(auth_headers_for_token(token))

    url = join_url(base_url, path)
    request = urllib.request.Request(url=url, method="GET", headers=headers)
    try:
        with urllib.request.urlopen(
            request, timeout=timeout_secs(), context=ssl_context()
        ) as resp:
            # urllib raises HTTPError for non-2xx (handled below), so
            # everything reaching this block is a 2xx success response.
            content_type = resp.headers.get("Content-Type", "") or ""
            disposition = resp.headers.get("Content-Disposition", "") or ""
            with open(output_path, "wb") as out_fh:
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    out_fh.write(chunk)
    except urllib.error.HTTPError as err:
        body = err.read() if err.fp else b""
        raise http_error_from_response(
            HttpResponse(
                status_code=err.code,
                headers={k: v for k, v in (err.headers.items() if err.headers else [])},
                body=body,
            ),
            url,
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

    return {"contentType": content_type, "filename": _parse_content_disposition_filename(disposition)}


_CD_FILENAME_STAR_RE = re.compile(r"filename\*\s*=\s*([^;]+)", re.IGNORECASE)
_CD_FILENAME_RE = re.compile(r'filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)', re.IGNORECASE)


def _parse_content_disposition_filename(value: str) -> str:
    if not value:
        return ""
    m_star = _CD_FILENAME_STAR_RE.search(value)
    if m_star:
        raw = m_star.group(1).strip()
        if "''" in raw:
            # RFC 5987 ext-value: charset'lang'pct-encoded.
            # Express today emits UTF-8'', but ISO-8859-1'' is also valid and
            # would mojibake if we always assumed UTF-8.
            charset, _, rest = raw.partition("'")
            _, _, encoded = rest.partition("'")
            charset_name = (charset or "utf-8").strip().lower() or "utf-8"
            try:
                return urllib.parse.unquote(encoded, encoding=charset_name, errors="replace")
            except (LookupError, Exception):
                try:
                    return urllib.parse.unquote(encoded)
                except Exception:
                    return encoded
        return raw
    m = _CD_FILENAME_RE.search(value)
    if m:
        return (m.group(1) or m.group(2) or "").strip()
    return ""
