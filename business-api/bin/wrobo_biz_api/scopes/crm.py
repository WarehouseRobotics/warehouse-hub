"""CRM scopes: contacts, deals, projects, tasks, comments."""

from __future__ import annotations

import urllib.parse
from typing import Any, List, Optional

from ..auth import require_credential, resolve_base_url
from ..errors import CliError
from ..flags import GlobalOptions, parse_flexible_flag_args
from ..http import call_api
from ._common import list_query_from_options, parse_json_positional


CONTACT_LIST_FILTERS = {
    "query": "query",
    "role": "role",
    "type": "type",
    "parent-contact-id": "parentContactId",
    "parentContactId": "parentContactId",
}


def handle_contacts(
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
            parsed.options, list_filter=False, scope_filters=CONTACT_LIST_FILTERS
        )
        return call_api("GET", "/api/v1/contacts", base_url=base_url, token=token, query=query)

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(parsed.positionals[0] if parsed.positionals else None, "contact")
        return call_api(
            "POST", "/api/v1/contacts", base_url=base_url, token=token, json_body=payload
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing contact id-or-slug")
        contact_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/contacts/{urllib.parse.quote(contact_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "resolve":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "contact resolve payload"
        )
        return call_api(
            "POST",
            "/api/v1/contacts/resolve",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown contacts subcommand: {subcommand or '(none)'}")


DEAL_LIST_FILTERS = {
    "stage": "stage",
    "customerContactId": "customerContactId",
    "customer-contact-id": "customerContactId",
}


def handle_deals(
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
            parsed.options, list_filter=False, scope_filters=DEAL_LIST_FILTERS
        )
        return call_api("GET", "/api/v1/deals", base_url=base_url, token=token, query=query)

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(parsed.positionals[0] if parsed.positionals else None, "deal")
        return call_api(
            "POST", "/api/v1/deals", base_url=base_url, token=token, json_body=payload
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing deal id-or-slug")
        deal_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/deals/{urllib.parse.quote(deal_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    raise CliError(f"Unknown deals subcommand: {subcommand or '(none)'}")


PROJECT_LIST_FILTERS = {
    "ownerEntityId": "ownerEntityId",
    "owner-entity-id": "ownerEntityId",
    "status": "status",
}


def handle_projects(
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
            parsed.options, list_filter=False, scope_filters=PROJECT_LIST_FILTERS
        )
        return call_api("GET", "/api/v1/projects", base_url=base_url, token=token, query=query)

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "project"
        )
        return call_api(
            "POST", "/api/v1/projects", base_url=base_url, token=token, json_body=payload
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing project id-or-slug")
        project_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/projects/{urllib.parse.quote(project_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    raise CliError(f"Unknown projects subcommand: {subcommand or '(none)'}")


TASK_LIST_FILTERS = {
    "projectId": "projectId",
    "project-id": "projectId",
    "status": "status",
    "parentTaskId": "parentTaskId",
    "parent-task-id": "parentTaskId",
}


def handle_tasks(
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
            parsed.options, list_filter=False, scope_filters=TASK_LIST_FILTERS
        )
        return call_api("GET", "/api/v1/tasks", base_url=base_url, token=token, query=query)

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(parsed.positionals[0] if parsed.positionals else None, "task")
        return call_api(
            "POST", "/api/v1/tasks", base_url=base_url, token=token, json_body=payload
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing task id-or-slug")
        task_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/tasks/{urllib.parse.quote(task_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing task id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing task patch JSON argument")
        task_id = parsed.positionals[0]
        payload = parse_json_positional(parsed.positionals[1], "task patch")
        return call_api(
            "PATCH",
            f"/api/v1/tasks/{urllib.parse.quote(task_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown tasks subcommand: {subcommand or '(none)'}")


COMMENT_LIST_FILTERS = {
    "commentable-type": "commentableType",
    "commentable-id": "commentableId",
    "commentable-slug": "commentableSlug",
    "author-contact-id": "authorContactId",
    "object-id": "commentableId",
}


def handle_comments(
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
            parsed.options, list_filter=False, scope_filters=COMMENT_LIST_FILTERS
        )
        return call_api("GET", "/api/v1/comments", base_url=base_url, token=token, query=query)

    if subcommand == "create":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        payload = parse_json_positional(
            parsed.positionals[0] if parsed.positionals else None, "comment"
        )
        return call_api(
            "POST", "/api/v1/comments", base_url=base_url, token=token, json_body=payload
        )

    if subcommand == "get":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if not parsed.positionals:
            raise CliError("Missing comment id-or-slug")
        comment_id = parsed.positionals[0]
        return call_api(
            "GET",
            f"/api/v1/comments/{urllib.parse.quote(comment_id, safe='')}",
            base_url=base_url,
            token=token,
        )

    if subcommand == "update":
        parsed = parse_flexible_flag_args(rest, boolean_keys={"json"})
        if len(parsed.positionals) < 1:
            raise CliError("Missing comment id-or-slug")
        if len(parsed.positionals) < 2:
            raise CliError("Missing comment patch JSON argument")
        comment_id = parsed.positionals[0]
        payload = parse_json_positional(parsed.positionals[1], "comment patch")
        return call_api(
            "PATCH",
            f"/api/v1/comments/{urllib.parse.quote(comment_id, safe='')}",
            base_url=base_url,
            token=token,
            json_body=payload,
        )

    raise CliError(f"Unknown comments subcommand: {subcommand or '(none)'}")
