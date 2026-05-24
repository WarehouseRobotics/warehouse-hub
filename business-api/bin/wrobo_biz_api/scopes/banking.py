"""Banking scopes: bank-accounts, bank-transactions, bank-balances, bank-imports.

The ``bank-imports csv`` subcommand has no single API endpoint: the local
CLI in ``business-api/src/cli/commands/bank.ts`` uploads the CSV as an
evidence document, parses the rows client-side via
``business-api/src/lib/bank-csv.ts``, then upserts each transaction
through the bank-transactions service. The wrapper mirrors that flow
exactly — upload via POST /api/v1/documents (multipart, kind=bank_csv),
parse the CSV in Python with the same column-resolution and money/date
normalization rules, and POST /api/v1/bank-transactions/upsert per row —
so the JSON shape returned to stdout matches the local CLI's per-row
upsert results aggregated into ``{ created, updated, needsReview,
transactions }``.
"""

from __future__ import annotations

import os
import re
import urllib.parse
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Any, Dict, List, Optional

from ..auth import require_credential, resolve_base_url
from ..errors import CliError
from ..flags import GlobalOptions, parse_flexible_flag_args
from ..http import call_api
from ..multipart import upload_multipart
from ._common import list_query_from_options, parse_json_positional


BANK_TRANSACTION_LIST_FILTERS = {
    "bank-account-id": "bankAccountId",
    "bankAccountId": "bankAccountId",
    "status": "status",
    "kind": "kind",
}

BANK_BALANCE_LIST_FILTERS = {
    "bank-account-id": "bankAccountId",
    "bankAccountId": "bankAccountId",
}


def handle_bank_accounts(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        query: List = []
        for raw_key, value in parsed.options.items():
            if raw_key == "status":
                query.append(("status", str(value)))
            else:
                raise CliError(f"Unknown list option: --{raw_key}")
        return call_api(
            "GET",
            "/api/v1/bank-accounts",
            base_url=base_url,
            token=token,
            query=query,
        )

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "bank account"
        )
        return call_api(
            "POST",
            "/api/v1/bank-accounts",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing bank-account id-or-slug")
        account_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/bank-accounts/{urllib.parse.quote(account_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing bank-account id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing bank-account patch JSON argument")
        account_id = parsed.positionals[0]
        payload = parse_json_positional(parsed.positionals[1], "bank account patch")
        return call_api(
            "PATCH",
            f"/api/v1/bank-accounts/{urllib.parse.quote(account_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown bank-accounts subcommand: {subcommand or '(none)'}")


def handle_bank_transactions(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        query = list_query_from_options(
            parsed.options,
            list_filter=True,
            scope_filters=BANK_TRANSACTION_LIST_FILTERS,
        )
        return call_api(
            "GET",
            "/api/v1/bank-transactions",
            base_url=base_url,
            token=token,
            query=query,
        )

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "bank transaction"
        )
        return call_api(
            "POST",
            "/api/v1/bank-transactions",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "upsert":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "bank transaction"
        )
        return call_api(
            "POST",
            "/api/v1/bank-transactions/upsert",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing bank-transaction id-or-slug")
        transaction_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/bank-transactions/{urllib.parse.quote(transaction_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing bank-transaction id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing bank-transaction patch JSON argument")
        transaction_id = parsed.positionals[0]
        payload = parse_json_positional(parsed.positionals[1], "bank transaction patch")
        return call_api(
            "PATCH",
            f"/api/v1/bank-transactions/{urllib.parse.quote(transaction_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "match":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing bank-transaction id-or-slug")
        transaction_id = parsed.positionals[0]
        return call_api(
            "POST",
            f"/api/v1/bank-transactions/{urllib.parse.quote(transaction_id, safe='')}/match",
            base_url=base_url,
            token=token,
        )

    raise CliError(f"Unknown bank-transactions subcommand: {subcommand or '(none)'}")


def handle_bank_balances(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        query = list_query_from_options(
            parsed.options,
            list_filter=True,
            scope_filters=BANK_BALANCE_LIST_FILTERS,
        )
        return call_api(
            "GET",
            "/api/v1/bank-balance-snapshots",
            base_url=base_url,
            token=token,
            query=query,
        )

    if subcommand == "record":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "bank balance snapshot"
        )
        return call_api(
            "POST",
            "/api/v1/bank-balance-snapshots",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown bank-balances subcommand: {subcommand or '(none)'}")


# ---------------------------------------------------------------------------
# bank-imports csv: client-side parse + per-row upsert (no single HTTP route)
# ---------------------------------------------------------------------------


_CSV_OPTION_DEFAULTS: Dict[str, Any] = {
    "dateColumn": "date",
    "amountColumn": "amount",
    "descriptionColumn": "description",
    "referenceColumn": None,
    "balanceColumn": None,
    "currencyColumn": None,
    "defaultCurrency": None,
    "source": "bank_csv",
}

# strict zod schema (business-schemas/src/bank.ts:90) — unknown keys reject.
_CSV_OPTION_KEYS = set(_CSV_OPTION_DEFAULTS.keys())


def handle_bank_imports(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "csv":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing bank-account id")
        if len(parsed.positionals) < 2:
            raise CliError("Missing file path")
        if len(parsed.positionals) < 3:
            raise CliError("Missing bank CSV import options JSON argument")

        bank_account_id = parsed.positionals[0]
        file_path = parsed.positionals[1]
        raw_options = parse_json_positional(parsed.positionals[2], "bank CSV import options")
        if not isinstance(raw_options, dict):
            raise CliError("bank CSV import options must be a JSON object")

        options = _coerce_csv_options(raw_options)

        if not os.path.isfile(file_path):
            raise CliError(f"File not found: {file_path}", code="file_not_found")

        with open(file_path, "rb") as fh:
            file_bytes = fh.read()

        document = upload_multipart(
            "POST",
            "/api/v1/documents",
            base_url=base_url,
            token=token,
            file_path=file_path,
            fields={"kind": "bank_csv", "source": options["source"]},
            mime_type="text/csv",
        )
        if not isinstance(document, dict) or not document.get("documentId"):
            raise CliError(
                "Document upload did not return a documentId",
                code="unexpected_response",
            )
        document_id = document["documentId"]

        try:
            csv_text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            csv_text = file_bytes.decode("utf-8", errors="replace")
        rows = _parse_bank_csv_rows(csv_text, options)

        created = 0
        updated = 0
        needs_review = 0
        transactions: List[Any] = []
        for row in rows:
            payload: Dict[str, Any] = {
                "bankAccountId": bank_account_id,
                "transactionDate": row["transactionDate"],
                "amount": row["amount"],
                "currency": row["currency"],
                "description": row["description"],
                "source": options["source"],
                "confidence": "high",
                "kind": "bank_transaction",
                "status": "recorded",
                "documentId": document_id,
            }
            if row.get("reference") is not None:
                payload["reference"] = row["reference"]
            if row.get("runningBalance") is not None:
                payload["runningBalance"] = row["runningBalance"]

            result = call_api(
                "POST",
                "/api/v1/bank-transactions/upsert",
                base_url=base_url,
                token=token,
                json_body=payload,
            )
            if not isinstance(result, dict):
                raise CliError(
                    "Unexpected bank-transactions/upsert response shape",
                    code="unexpected_response",
                )
            action = result.get("action")
            transaction = result.get("transaction") or {}
            if action == "created":
                created += 1
            elif action == "updated":
                updated += 1
            if isinstance(transaction, dict) and transaction.get("status") == "needs_review":
                needs_review += 1
            transactions.append(transaction)

        return {
            "created": created,
            "updated": updated,
            "needsReview": needs_review,
            "transactions": transactions,
        }

    raise CliError(f"Unknown bank-imports subcommand: {subcommand or '(none)'}")


def _coerce_csv_options(raw: Dict[str, Any]) -> Dict[str, Any]:
    for key in raw:
        if key not in _CSV_OPTION_KEYS:
            raise CliError(f"Unknown bank CSV import option: {key}")
    out: Dict[str, Any] = dict(_CSV_OPTION_DEFAULTS)
    for key, value in raw.items():
        if value is None:
            continue
        if not isinstance(value, str):
            raise CliError(f"bank CSV import option {key!r} must be a string")
        if not value:
            raise CliError(f"bank CSV import option {key!r} must be non-empty")
        out[key] = value
    if out.get("defaultCurrency") is not None and len(out["defaultCurrency"]) != 3:
        raise CliError("bank CSV import option 'defaultCurrency' must be a 3-letter code")
    return out


def _parse_csv_line(line: str) -> List[str]:
    cells: List[str] = []
    current = ""
    quoted = False
    i = 0
    while i < len(line):
        char = line[i]
        nxt = line[i + 1] if i + 1 < len(line) else ""
        if char == '"' and quoted and nxt == '"':
            current += '"'
            i += 2
            continue
        if char == '"':
            quoted = not quoted
            i += 1
            continue
        if char == "," and not quoted:
            cells.append(current.strip())
            current = ""
            i += 1
            continue
        current += char
        i += 1
    cells.append(current.strip())
    return cells


_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SLASH_DATE_RE = re.compile(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$")


def _normalize_date(value: str) -> str:
    trimmed = value.strip()
    if _ISO_DATE_RE.match(trimmed):
        return trimmed
    m = _SLASH_DATE_RE.match(trimmed)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    raise CliError(
        f"Invalid bank CSV transaction date: {value}", code="invalid_bank_csv_date"
    )


_MONEY_VALID_RE = re.compile(r"^-?\d+(\.\d+)?$")


def _normalize_money_string(value: str) -> str:
    # Mirror business-api/src/lib/money.ts ``normalizeDecimalString`` exactly:
    # accept "-340,01", "7809,90", "1.234,56", "1,234.56", "-340.01",
    # "1'234.56" (Swiss apostrophes, straight or curly), and "1 234,56"
    # (whitespace as thousands separator); produce a canonical 2-decimal string.
    trimmed = (value or "").strip()
    # Match TS: .trim().replace(/\s+/g, "").replace(/['’]/g, "")
    cleaned = re.sub(r"\s+", "", trimmed)
    cleaned = cleaned.replace("'", "").replace("’", "")
    if not cleaned:
        raise CliError(f"Invalid money value: {value!r}", code="invalid_money_value")

    has_comma = "," in cleaned
    has_dot = "." in cleaned

    if has_comma and has_dot:
        last_comma = cleaned.rfind(",")
        last_dot = cleaned.rfind(".")
        if last_dot > last_comma:
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(".", "").replace(",", ".")
    elif has_comma:
        # Single comma with up to 2 trailing digits → decimal comma.
        # Otherwise (multiple commas, or >2 trailing digits) → US thousands.
        parts = cleaned.split(",")
        if len(parts) == 2 and parts[1] and len(parts[1]) <= 2:
            cleaned = f"{parts[0]}.{parts[1]}"
        else:
            cleaned = cleaned.replace(",", "")
    elif has_dot:
        # Multiple dots → all-but-last are thousands separators.
        parts = cleaned.split(".")
        if len(parts) > 2:
            decimal_part = parts[-1]
            cleaned = f"{''.join(parts[:-1])}.{decimal_part}"

    if not _MONEY_VALID_RE.match(cleaned):
        raise CliError(
            f"Invalid money value: {value!r}", code="invalid_money_value"
        )
    try:
        decimal = Decimal(cleaned)
    except InvalidOperation as err:
        raise CliError(
            f"Invalid money value: {value!r}", code="invalid_money_value"
        ) from err
    quantized = decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{quantized:.2f}"


def _require_column(headers: List[str], column: str) -> int:
    try:
        return headers.index(column)
    except ValueError as err:
        raise CliError(
            f"Bank CSV is missing required column: {column}",
            code="missing_bank_csv_column",
        ) from err


def _optional_column(headers: List[str], column: Optional[str]) -> Optional[int]:
    if not column:
        return None
    try:
        return headers.index(column)
    except ValueError:
        return None


def _parse_bank_csv_rows(csv_text: str, options: Dict[str, Any]) -> List[Dict[str, Any]]:
    lines = [line.strip() for line in re.split(r"\r?\n", csv_text)]
    lines = [line for line in lines if line]
    if len(lines) < 2:
        return []

    headers = [h.strip() for h in _parse_csv_line(lines[0])]
    date_index = _require_column(headers, options["dateColumn"])
    amount_index = _require_column(headers, options["amountColumn"])
    description_index = _require_column(headers, options["descriptionColumn"])
    reference_index = _optional_column(headers, options.get("referenceColumn"))
    balance_index = _optional_column(headers, options.get("balanceColumn"))
    currency_index = _optional_column(headers, options.get("currencyColumn"))

    rows: List[Dict[str, Any]] = []
    for row_index, line in enumerate(lines[1:]):
        cells = _parse_csv_line(line)

        def cell(idx: Optional[int]) -> Optional[str]:
            if idx is None or idx >= len(cells):
                return None
            return cells[idx]

        currency_value = cell(currency_index) if currency_index is not None else options.get("defaultCurrency")
        if currency_value is not None:
            currency_value = currency_value.strip()
        if not currency_value:
            raise CliError(
                f"Bank CSV row {row_index + 2} is missing currency",
                code="missing_bank_csv_currency",
            )

        reference_value: Optional[str] = None
        if reference_index is not None:
            ref_cell = cell(reference_index)
            reference_value = ref_cell if ref_cell else None

        running_balance: Optional[str] = None
        if balance_index is not None:
            bal_cell = cell(balance_index)
            if bal_cell:
                running_balance = _normalize_money_string(bal_cell)

        rows.append(
            {
                "transactionDate": _normalize_date(cell(date_index) or ""),
                "amount": _normalize_money_string(cell(amount_index) or ""),
                "description": cell(description_index) or "",
                "reference": reference_value,
                "runningBalance": running_balance,
                "currency": currency_value,
            }
        )

    return rows
