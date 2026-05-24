"""Document-ingest CLI output formatter.

Python port of ``business-api/src/lib/cli-document-ingest-format.ts``.
Given a document-ingest response, produce the same human-readable
``"<label>\\n\\n```toon\\n<invoice>\\n```"`` block that the local CLI
emits on stdout.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from .toon import encode as toon_encode


def _ingest_party_name(response: Dict[str, Any]) -> Optional[str]:
    extracted = response.get("extracted") or {}
    linked = response.get("linkedEntity") or {}
    party_key = {
        "expense": "supplier",
        "sales_invoice": "customer",
        "payroll": "employee",
    }.get(linked.get("type"))
    if not party_key:
        return None
    party = extracted.get(party_key) or {}
    return party.get("name") or party.get("legalName")


_MISSING = object()


def _coalesce_js(*candidates: Any) -> Any:
    """Mirror JS ``a ?? b ?? c``: skip null/undefined, return first defined.

    Python's ``None`` stands in for both JS ``null`` and ``undefined``.
    Returns ``None`` if every candidate is None — which the TOON encoder
    serializes as ``null`` exactly as JS ``undefined`` normalizes to.
    """
    for c in candidates:
        if c is _MISSING:
            continue
        if c is not None:
            return c
    return None


def _g(d: Dict[str, Any], k: str) -> Any:
    return d.get(k, _MISSING)


def _build_ingest_invoice_payload(response: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    extracted = response.get("extracted") or {}
    linked = response.get("linkedEntity") or {}
    invoice_number = extracted.get("invoiceNumber")
    line_items = extracted.get("lineItems")
    party_name = _ingest_party_name(response)
    ltype = linked.get("type")
    data = linked.get("data") or {}

    if ltype in ("expense", "sales_invoice"):
        if (
            not invoice_number
            or not isinstance(line_items, list)
            or not line_items
            or not party_name
        ):
            return None

    if ltype == "expense":
        invoice: Dict[str, Any] = {
            "kind": "expense_invoice",
            "id": data.get("expenseId"),
            "slug": data.get("slug"),
            "supplier": {"name": party_name},
            "invoiceNumber": invoice_number,
            "invoiceDate": _coalesce_js(_g(extracted, "invoiceDate"), _g(data, "invoiceDate")),
            "dueDate": _coalesce_js(_g(extracted, "dueDate"), _g(data, "dueDate")),
            "currency": _coalesce_js(_g(extracted, "currency"), _g(data, "currency")),
            "totals": _coalesce_js(_g(extracted, "totals"), _g(data, "totals")),
            "taxLines": _coalesce_js(_g(extracted, "taxLines"), _g(data, "taxLines")),
            "lineItems": line_items,
            "category": _coalesce_js(_g(extracted, "category"), _g(data, "category")),
            "notes": _coalesce_js(_g(extracted, "notes"), _g(data, "notes")),
            "status": _coalesce_js(_g(extracted, "status"), _g(data, "status")),
        }
        return {"label": f"invoice {invoice_number} for {party_name} was ingested", "invoice": invoice}

    if ltype == "sales_invoice":
        invoice = {
            "kind": "sales_invoice",
            "id": data.get("salesInvoiceId"),
            "slug": data.get("slug"),
            "customer": {"name": party_name},
            "invoiceNumber": invoice_number,
            "issueDate": _coalesce_js(_g(extracted, "issueDate"), _g(data, "issueDate")),
            "serviceDate": _coalesce_js(_g(extracted, "serviceDate"), _g(data, "serviceDate")),
            "dueDate": _coalesce_js(_g(extracted, "dueDate"), _g(data, "dueDate")),
            "currency": _coalesce_js(_g(extracted, "currency"), _g(data, "currency")),
            "paymentTermsDays": _coalesce_js(_g(extracted, "paymentTermsDays"), _g(data, "paymentTermsDays")),
            "totals": _coalesce_js(_g(extracted, "totals"), _g(data, "totals")),
            "lineItems": line_items,
            "notes": _coalesce_js(_g(extracted, "notes")),
            "status": _coalesce_js(_g(extracted, "status"), _g(data, "status")),
        }
        return {"label": f"invoice {invoice_number} for {party_name} was ingested", "invoice": invoice}

    if ltype == "payroll":
        period_start = _coalesce_js(_g(extracted, "periodStart"), _g(data, "periodStart"))
        period_end = _coalesce_js(_g(extracted, "periodEnd"), _g(data, "periodEnd"))
        if not period_start or not period_end or not party_name:
            return None
        invoice = {
            "kind": "payroll",
            "id": data.get("payrollId"),
            "slug": data.get("slug"),
            "employee": {"name": party_name},
            "payrollNumber": _coalesce_js(_g(extracted, "payrollNumber"), _g(data, "payrollNumber")),
            "countryCode": _coalesce_js(_g(extracted, "countryCode"), _g(data, "countryCode")),
            "periodStart": period_start,
            "periodEnd": period_end,
            "paymentDate": _coalesce_js(_g(extracted, "paymentDate"), _g(data, "paymentDate")),
            "currency": _coalesce_js(_g(extracted, "currency"), _g(data, "currency")),
            "grossSalary": _coalesce_js(_g(extracted, "grossSalary"), _g(data, "grossSalary")),
            "netSalary": _coalesce_js(_g(extracted, "netSalary"), _g(data, "netSalary")),
            "employeeTaxWithheld": _coalesce_js(_g(extracted, "employeeTaxWithheld"), _g(data, "employeeTaxWithheld")),
            "employeeSocialContributions": _coalesce_js(
                _g(extracted, "employeeSocialContributions"), _g(data, "employeeSocialContributions")
            ),
            "employerSocialContributions": _coalesce_js(
                _g(extracted, "employerSocialContributions"), _g(data, "employerSocialContributions")
            ),
            "otherDeductions": _coalesce_js(_g(extracted, "otherDeductions"), _g(data, "otherDeductions")),
            "otherEarnings": _coalesce_js(_g(extracted, "otherEarnings"), _g(data, "otherEarnings")),
            "rawLines": _coalesce_js(_g(extracted, "rawLines"), _g(data, "rawLines")),
            "notes": _coalesce_js(_g(extracted, "notes"), _g(data, "notes")),
            "status": _coalesce_js(_g(extracted, "payrollStatus"), _g(data, "status")),
        }
        return {"label": f"payroll for {party_name} was ingested", "invoice": invoice}

    return None


def format_document_ingest_cli_output(response: Any) -> Optional[str]:
    if not isinstance(response, dict):
        return None
    payload = _build_ingest_invoice_payload(response)
    if not payload:
        return None
    return f"{payload['label']}\n\n```toon\n{toon_encode(payload['invoice'])}\n```"
