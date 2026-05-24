"""Bookings scopes: bookings, booking-assignment-profiles, booking-availability-exceptions.

These three scopes are the first in the wrapper to drive request bodies
from flags rather than a positional JSON blob. The local CLI in
``business-api/src/cli/commands/bookings.ts`` accepts *both* shapes
("``{ ... }``"-style JSON-first positional or flag-driven) — this
wrapper mirrors that contract: if the first positional argument starts
with ``{`` it is treated as a JSON body (positional-JSON mode, same as
every other scope), otherwise the flags are assembled into a body
object whose field names match the TypeScript ``parseBookingInputArg``
family. Repeatable flags (``--assigned-contact-id``,
``--availability``, ``--booking-type``) accumulate into arrays via
``parse_flexible_flag_args``'s ``repeatable_keys`` set.
"""

from __future__ import annotations

import urllib.parse
from typing import Any, Dict, List, Optional, Tuple

from ..auth import require_credential, resolve_base_url
from ..errors import CliError
from ..flags import GlobalOptions, parse_flexible_flag_args
from ..http import call_api
from ._common import parse_json_positional


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _strip_none(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def _looks_like_json_blob(args: List[str]) -> bool:
    return bool(args) and args[0].strip().startswith("{")


def _parse_number(value: Optional[str], *, field: str) -> Optional[float]:
    if value is None:
        return None
    try:
        if "." in value or "e" in value or "E" in value:
            return float(value)
        return int(value)
    except ValueError as err:
        raise CliError(f"Option --{field} must be numeric, got: {value!r}") from err


def _parse_booking_location(options: Dict[str, str]) -> Optional[Dict[str, Any]]:
    # Mirror parseBookingLocation in commands/bookings.ts:39-59.
    if not options.get("location-kind"):
        return None

    has_address = any(
        options.get(flag)
        for flag in ("street1", "city", "postal-code", "country")
    )
    address: Optional[Dict[str, Any]] = None
    if has_address:
        address = _strip_none(
            {
                "street1": options.get("street1"),
                "street2": options.get("street2"),
                "city": options.get("city"),
                "postalCode": options.get("postal-code"),
                "countryCode": options.get("country"),
            }
        )

    return _strip_none(
        {
            "kind": options["location-kind"],
            "label": options.get("location-label"),
            "address": address,
            "remoteUrl": options.get("remote-url"),
            "notes": options.get("location-notes"),
        }
    )


def _parse_booking_input(rest: List[str]) -> Dict[str, Any]:
    if _looks_like_json_blob(rest):
        body = parse_json_positional(rest[0], "booking")
        if not isinstance(body, dict):
            raise CliError("booking body must be a JSON object")
        return body

    parsed = parse_flexible_flag_args(
        rest,
        boolean_keys={"json"},
        repeatable_keys={"assigned-contact-id"},
    )
    payload: Dict[str, Any] = {
        "customerContactId": parsed.options.get("customer-contact-id"),
        "projectId": parsed.options.get("project-id"),
        "dealId": parsed.options.get("deal-id"),
        "taskId": parsed.options.get("task-id"),
        "salesInvoiceId": parsed.options.get("sales-invoice-id"),
        "title": parsed.options.get("title"),
        "serviceType": parsed.options.get("service-type"),
        "status": parsed.options.get("status"),
        "scheduledStartAt": parsed.options.get("start"),
        "scheduledEndAt": parsed.options.get("end"),
        "timezone": parsed.options.get("timezone"),
        "location": _parse_booking_location(parsed.options),
        "assignedContactIds": parsed.repeated.get("assigned-contact-id", []),
        "notes": parsed.options.get("notes"),
    }
    return _strip_none(payload)


def _parse_booking_patch(rest_after_id: List[str]) -> Dict[str, Any]:
    # update accepts only positional JSON in the local CLI; mirror that.
    if not rest_after_id:
        raise CliError("Missing booking patch JSON argument")
    body = parse_json_positional(rest_after_id[0], "booking patch")
    if not isinstance(body, dict):
        raise CliError("booking patch body must be a JSON object")
    return body


def _parse_booking_complete(rest_after_id: List[str]) -> Dict[str, Any]:
    if _looks_like_json_blob(rest_after_id):
        body = parse_json_positional(rest_after_id[0], "booking completion")
        if not isinstance(body, dict):
            raise CliError("booking completion body must be a JSON object")
        return body
    parsed = parse_flexible_flag_args(
        rest_after_id, boolean_keys={"create-follow-up-task", "json"}
    )
    payload: Dict[str, Any] = {
        "completionNotes": parsed.options.get("completion-notes"),
        "createFollowUpTask": "create-follow-up-task" in parsed.booleans,
        "followUpTaskTitle": parsed.options.get("follow-up-task-title"),
    }
    return _strip_none(payload)


def _parse_booking_cancel(rest_after_id: List[str]) -> Dict[str, Any]:
    if _looks_like_json_blob(rest_after_id):
        body = parse_json_positional(rest_after_id[0], "booking cancellation")
        if not isinstance(body, dict):
            raise CliError("booking cancellation body must be a JSON object")
        return body
    parsed = parse_flexible_flag_args(rest_after_id, boolean_keys={"json"})
    reason = parsed.options.get("reason")
    if not reason:
        raise CliError("Missing --reason for booking cancellation")
    return {"reason": reason}


def _parse_conflict_check(rest: List[str]) -> Dict[str, Any]:
    if _looks_like_json_blob(rest):
        body = parse_json_positional(rest[0], "booking conflict check")
        if not isinstance(body, dict):
            raise CliError("booking conflict check body must be a JSON object")
        return body
    parsed = parse_flexible_flag_args(
        rest, boolean_keys={"json"}, repeatable_keys={"assigned-contact-id"}
    )
    payload: Dict[str, Any] = {
        "bookingId": parsed.options.get("booking-id"),
        "serviceType": parsed.options.get("service-type"),
        "scheduledStartAt": parsed.options.get("start"),
        "scheduledEndAt": parsed.options.get("end"),
        "timezone": parsed.options.get("timezone"),
        "assignedContactIds": parsed.repeated.get("assigned-contact-id", []),
    }
    return _strip_none(payload)


def _parse_availability_entries(values: List[str]) -> List[Dict[str, Any]]:
    # Mirror parseBookingAvailabilityEntries in commands/bookings.ts:114-126:
    # group windows by dayOfWeek, preserving first-seen day order.
    by_day: "Dict[str, List[Dict[str, str]]]" = {}
    order: List[str] = []
    for value in values:
        parts = value.split("|")
        if len(parts) != 3 or not parts[0] or not parts[1] or not parts[2]:
            raise CliError(
                f"Invalid availability value: {value}. Expected day|HH:MM|HH:MM"
            )
        day_of_week, start, end = parts
        if day_of_week not in by_day:
            by_day[day_of_week] = []
            order.append(day_of_week)
        by_day[day_of_week].append({"start": start, "end": end})

    return [
        {"dayOfWeek": day, "windows": by_day[day]} for day in order
    ]


def _parse_assignment_profile(rest_after_id: List[str]) -> Dict[str, Any]:
    if _looks_like_json_blob(rest_after_id):
        body = parse_json_positional(rest_after_id[0], "booking assignment profile")
        if not isinstance(body, dict):
            raise CliError("booking assignment profile body must be a JSON object")
        return body

    parsed = parse_flexible_flag_args(
        rest_after_id,
        boolean_keys={"json", "not-bookable"},
        repeatable_keys={"availability", "booking-type"},
    )
    payload: Dict[str, Any] = {
        "isBookable": "not-bookable" not in parsed.booleans,
        "timezone": parsed.options.get("timezone"),
        "weeklyAvailability": _parse_availability_entries(
            parsed.repeated.get("availability", [])
        ),
        "bufferBeforeMinutes": _parse_number(
            parsed.options.get("buffer-before-minutes"),
            field="buffer-before-minutes",
        ),
        "bufferAfterMinutes": _parse_number(
            parsed.options.get("buffer-after-minutes"),
            field="buffer-after-minutes",
        ),
        "maxBookingsPerDay": _parse_number(
            parsed.options.get("max-bookings-per-day"),
            field="max-bookings-per-day",
        ),
        "bookingTypes": parsed.repeated.get("booking-type") or None,
        "effectiveFrom": parsed.options.get("effective-from"),
        "effectiveTo": parsed.options.get("effective-to"),
        "notes": parsed.options.get("notes"),
    }
    return _strip_none(payload)


def _parse_availability_exception(rest: List[str]) -> Dict[str, Any]:
    if _looks_like_json_blob(rest):
        body = parse_json_positional(rest[0], "booking availability exception")
        if not isinstance(body, dict):
            raise CliError("booking availability exception body must be a JSON object")
        return body
    parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
    payload: Dict[str, Any] = {
        "contactId": parsed.options.get("contact-id"),
        "kind": parsed.options.get("kind"),
        "startAt": parsed.options.get("start"),
        "endAt": parsed.options.get("end"),
        "reason": parsed.options.get("reason"),
        "notes": parsed.options.get("notes"),
    }
    return _strip_none(payload)


# ---------------------------------------------------------------------------
# bookings
# ---------------------------------------------------------------------------


_BOOKINGS_LIST_FILTERS: Dict[str, str] = {
    "from": "from",
    "to": "to",
    "status": "status",
    "customer-contact-id": "customerContactId",
    "assigned-contact-id": "assignedContactId",
    "project-id": "projectId",
    "deal-id": "dealId",
}


def handle_bookings(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        query: List[Tuple[str, str]] = []
        for raw_key, value in parsed.options.items():
            if raw_key in _BOOKINGS_LIST_FILTERS:
                query.append((_BOOKINGS_LIST_FILTERS[raw_key], str(value)))
            else:
                raise CliError(f"Unknown list option: --{raw_key}")
        return call_api(
            "GET", "/api/v1/bookings", base_url=base_url, token=token, query=query
        )

    if subcommand == "create":
        payload = _parse_booking_input(rest)
        return call_api(
            "POST",
            "/api/v1/bookings",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "get":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking id-or-slug")
        booking_id = rest[0]
        return call_api(
            "GET",
            f"/api/v1/bookings/{urllib.parse.quote(booking_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking id-or-slug")
        booking_id = rest[0]
        payload = _parse_booking_patch(rest[1:])
        return call_api(
            "PATCH",
            f"/api/v1/bookings/{urllib.parse.quote(booking_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "complete":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking id-or-slug")
        booking_id = rest[0]
        payload = _parse_booking_complete(rest[1:])
        return call_api(
            "POST",
            f"/api/v1/bookings/{urllib.parse.quote(booking_id, safe='')}/complete",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "cancel":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking id-or-slug")
        booking_id = rest[0]
        payload = _parse_booking_cancel(rest[1:])
        return call_api(
            "POST",
            f"/api/v1/bookings/{urllib.parse.quote(booking_id, safe='')}/cancel",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "delete":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking id-or-slug")
        booking_id = rest[0]
        call_api(
            "DELETE",
            f"/api/v1/bookings/{urllib.parse.quote(booking_id, safe='')}",
            base_url=base_url,
            token=token,
        )
        return {"ok": True}

    if subcommand == "check-assignment-conflicts":
        payload = _parse_conflict_check(rest)
        return call_api(
            "POST",
            "/api/v1/bookings/check-assignment-conflicts",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown bookings subcommand: {subcommand or '(none)'}")


# ---------------------------------------------------------------------------
# booking-assignment-profiles
# ---------------------------------------------------------------------------


def handle_booking_assignment_profiles(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        return call_api(
            "GET",
            "/api/v1/booking-assignment-profiles",
            base_url=base_url,
            token=token,
        )

    if subcommand == "get":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking assignment profile contact-id")
        contact_id = rest[0]
        return call_api(
            "GET",
            f"/api/v1/booking-assignment-profiles/"
            f"{urllib.parse.quote(contact_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "set":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking assignment profile contact-id")
        contact_id = rest[0]
        payload = _parse_assignment_profile(rest[1:])
        return call_api(
            "PUT",
            f"/api/v1/booking-assignment-profiles/"
            f"{urllib.parse.quote(contact_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "delete":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking assignment profile contact-id")
        contact_id = rest[0]
        call_api(
            "DELETE",
            f"/api/v1/booking-assignment-profiles/"
            f"{urllib.parse.quote(contact_id, safe='')}",
            base_url=base_url,
            token=token,
        )
        return {"ok": True}

    raise CliError(
        f"Unknown booking-assignment-profiles subcommand: {subcommand or '(none)'}"
    )


# ---------------------------------------------------------------------------
# booking-availability-exceptions
# ---------------------------------------------------------------------------


_AVAILABILITY_EXCEPTION_LIST_FILTERS = {
    "contact-id": "contactId",
    "kind": "kind",
}


def handle_booking_availability_exceptions(
    subcommand: Optional[str],
    rest: List[str],
    *,
    globals_: GlobalOptions,
) -> Any:
    base_url = resolve_base_url(globals_.base_url)
    token = require_credential(globals_.token)

    if subcommand == "list":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        query: List[Tuple[str, str]] = []
        for raw_key, value in parsed.options.items():
            if raw_key in _AVAILABILITY_EXCEPTION_LIST_FILTERS:
                query.append(
                    (_AVAILABILITY_EXCEPTION_LIST_FILTERS[raw_key], str(value))
                )
            else:
                raise CliError(f"Unknown list option: --{raw_key}")
        return call_api(
            "GET",
            "/api/v1/booking-availability-exceptions",
            base_url=base_url,
            token=token,
            query=query,
        )

    if subcommand == "create":
        payload = _parse_availability_exception(rest)
        return call_api(
            "POST",
            "/api/v1/booking-availability-exceptions",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "get":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking availability exception id-or-slug")
        exception_id = rest[0]
        return call_api(
            "GET",
            f"/api/v1/booking-availability-exceptions/"
            f"{urllib.parse.quote(exception_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking availability exception id-or-slug")
        if len(rest) < 2:
            raise CliError(
                "Missing booking availability exception patch JSON argument"
            )
        exception_id = rest[0]
        payload = parse_json_positional(
            rest[1], "booking availability exception patch"
        )
        if not isinstance(payload, dict):
            raise CliError(
                "booking availability exception patch body must be a JSON object"
            )
        return call_api(
            "PATCH",
            f"/api/v1/booking-availability-exceptions/"
            f"{urllib.parse.quote(exception_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    if subcommand == "delete":
        if not rest or rest[0].startswith("--"):
            raise CliError("Missing booking availability exception id-or-slug")
        exception_id = rest[0]
        call_api(
            "DELETE",
            f"/api/v1/booking-availability-exceptions/"
            f"{urllib.parse.quote(exception_id, safe='')}",
            base_url=base_url,
            token=token,
        )
        return {"ok": True}

    raise CliError(
        f"Unknown booking-availability-exceptions subcommand: {subcommand or '(none)'}"
    )
