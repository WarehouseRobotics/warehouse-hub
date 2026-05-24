# Plan: `wrobo-biz-api` — Remote HTTP CLI Wrapper for business-api

> **Note on final location:** the user asked for this plan to live at `docs/plans/cli-wrapper-api-transport.plan.md`. Copy it there after approval. (Plan-mode constraints kept the working copy under `~/.claude/plans/`.)

## Context

The existing `business-api/bin/wrobo-biz` wrapper [bin/wrobo-biz](business-api/bin/wrobo-biz) shells into the local Docker container and runs the in-process Node CLI ([src/cli.ts](business-api/src/cli.ts), [src/cli/registry.ts](business-api/src/cli/registry.ts), [src/cli/commands/*.ts](business-api/src/cli/commands)). That works on a developer host but cannot drive a **remote** business-api instance.

The MVP intentionally shipped only the local-container path. We now need an alternative wrapper, **`wrobo-biz-api`**, with the same command shape as `wrobo-biz`, that talks to a remote business-api over HTTP only. Constraints from the user:

- Host **must not** run Node.js — security boundary.
- Must be a thin script: Bash+curl, or single-file Python stdlib.
- Same CLI shape as `wrobo-biz`, deviating only where justified.

Outcome: a remote operator (developer, agent, scheduled job) can issue `wrobo-biz-api documents list --after 2026-04-01` against `https://hub.example.com` and get exactly the same JSON they would get from a local container call.

## Approach (recommended)

**Single-file Python 3 script using only the standard library** (`urllib.request`, `json`, `argparse`, `mimetypes`, `uuid`, `os`, `sys`, `pathlib`). Reasons over Bash+curl:

- JSON pass-through, multipart construction, and error-body parsing in Bash require `jq` (a dependency) or fragile sed/awk. `urllib` + `json` cover all four transports (JSON body, multipart upload, binary download, query-string GET) with no dep.
- Argument dispatch for ~25 command scopes × multiple subcommands is much cleaner as a data-driven Python table than nested Bash `case` statements.
- Stays single-file (`business-api/bin/wrobo-biz-api`), shebang `#!/usr/bin/env python3`, executable, no install step.

Falls inside the user's "Python with no dependencies" allowance. (`curl` itself isn't required.)

## CLI surface — mirror the existing wrapper

The new wrapper must accept the **same** `<scope> <subcommand> [args...] [flags...]` shape used by `wrobo-biz` today (see [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md) and [src/cli/registry.ts](business-api/src/cli/registry.ts)). Treat the canonical scope list from `registry.ts:27–55` as the authoritative inventory. Categories:

- **auth**: `login`, `logout`, `whoami`, `magic-link request`, `magic-link consume`
- **tokens**: `create`, `list`, `revoke`
- **users**: `list`, `set-role`, `delete`, `invite`, `revoke-invite`
- **workspace**: `get`, `set`
- **company-card**: `get`, `set`
- **contacts** (aliases unchanged), **deals**, **projects**, **tasks**, **comments**
- **documents**: `upload`, `ingest`, `list`, `get`, `download`
- **expenses**, **payrolls**, **sales-invoices** (with the `invoices` / `bills` / `purchase-invoices` aliases preserved)
- **bookings**, **booking-assignment-profiles**, **booking-availability-exceptions**
- **bank-accounts**, **bank-transactions**, **bank-balances**, **bank-imports**
- **tax-reports**, **tax-report-payment-links**, **tax-carryforwards**
- **data-cache**

### Justified deviations from `wrobo-biz`

| Area | Local `wrobo-biz` | Remote `wrobo-biz-api` | Why |
|------|-------------------|------------------------|-----|
| `serve`, `db init`, `db migrate` | In-process Node | **Not implemented** — fail with a clear "host-only command" error | Server lifecycle and migrations can't be driven over HTTP. |
| Session file path | `~/.config/wrobo/session.json` | `~/.config/wrobo-api/session.json` | Avoid collision so a developer can use both wrappers side by side. |
| `auth login` default | Reads `PORT` from server config | Requires `--base-url` or `WROBO_API_BASE_URL` | No local config to read; remote URL must be explicit. |
| Stdin password prompt | Interactive via stdin | Same behavior, but warn if no TTY rather than hang | Wrapper is often agent-driven. |
| `--in-docker`, `--verbose` Winston knobs | Honored | Dropped (`--verbose` becomes "curl-level trace") | No server-side process. |
| `documents ingest` Markdown summary | Rendered via [cli-document-ingest-format.ts](business-api/src/lib/cli-document-ingest-format.ts) | API returns the same JSON; wrapper formats it locally by **re-implementing the same formatter in <40 lines of Python** | The format is small and stable; keeps remote output parity. |

Otherwise the surface is byte-identical: same flag names, same positional ordering, same JSON arg blobs, same exit codes (`0` success, `1` error).

## Auth and session storage

Mirror the resolution order in [src/cli/auth-session.ts](business-api/src/cli/auth-session.ts:173-215):

1. `--token <value>` flag wins.
2. Else `WROBO_API_TOKEN` env var.
3. Else read session token from `~/.config/wrobo-api/session.json` (mode `0600`, JSON shape: `{ "baseUrl": "...", "sessionToken": "sess_...", "expiresAt": "..." }`).
4. Else error: "CLI authentication is required".

Header injection (matches [src/middleware/auth.ts](business-api/src/middleware/auth.ts:59-77)):

- Token starting with `sess_` → `Cookie: wh_session=<value>` (cookie path used by sessions).
- Token starting with `wpat_` → `Authorization: Bearer <value>` (also accepted as `x-api-key`; prefer Bearer).
- Legacy API key (no prefix) → `x-api-key: <value>`.

`auth login` flow:

- POST `/api/v1/auth/login` with `{email,password}` ([routes/auth.ts:72-92](business-api/src/routes/auth.ts:72)). 
- Response body matches [session-response.ts:44-59](business-api/src/routes/session-response.ts:44) (`sessionToken`, `expiresAt`, `user`).
- Persist `{ baseUrl, sessionToken, expiresAt }` to the session file with `chmod 600`; print the same JSON shape the local CLI prints.

`auth logout`: POST `/api/v1/auth/logout` (best-effort), then delete the local session file. Always exit 0 if the file ends up gone.

`auth whoami`: GET `/api/v1/auth/me`.

`tokens create`: POST `/api/v1/tokens` — the returned PAT is what an operator would then export as `WROBO_API_TOKEN` for non-interactive use.

## File layout

The wrapper ships as an executable shim plus a sibling Python package:

- `business-api/bin/wrobo-biz-api` — executable shim (sys.path bootstrap + call `wrobo_biz_api.main`).
- `business-api/bin/wrobo_biz_api/` — stdlib-only package: `config`, `errors`, `flags`, `session`, `auth`, `http`, `multipart`, `output`, `help_text`, `toon`, `ingest_format`, `cli` (dispatcher with `SCOPE_HANDLERS`), and `scopes/` (one module per scope family).
- `business-api/bin/wrobo_biz_api/scopes/<scope>.py` — each scope handler exposes `handle_<scope>(subcommand, rest, *, globals_)` and is registered in `SCOPE_HANDLERS` in `cli.py`. Shared helpers (`parse_json_positional`, `list_query_from_options`) live in `scopes/_common.py`.

> The original single-file `business-api/bin/wrobo-biz-api` was refactored into the package layout above after Task 1a/1b/2 landed (see task `wrobo-biz-api-refactor-9sty1y`). Behavior, CLI surface, and exit codes are unchanged. Adding a new scope is still a one-file change.

No other source changes are required on the business-api side; the HTTP surface already covers every CLI scope (see route mounts in [src/app.ts](business-api/src/app.ts), one router per CLI scope).

Documentation: add a short companion section to [docs/apps/business-api/cli.md](docs/apps/business-api/cli.md) describing remote usage, base-URL/token configuration, and the list of host-only commands that the API wrapper rejects.

## Command dispatch — data-driven table

Encode the CLI→HTTP mapping as a Python dict so adding a scope is a one-line change. Each entry:

```python
("documents", "list"): Route(
    method="GET", path="/api/v1/documents",
    query_from_list_filters=True,         # --similar/--limit/--since/--before/--after → query
    scope="read",
),
("documents", "upload"): Route(
    method="POST", path="/api/v1/documents",
    multipart=True,                        # positional[0]=file, positional[1]=JSON meta
    scope="write",
),
("documents", "download"): Route(
    method="GET", path="/api/v1/documents/{id}/download",
    positional_to_path=["id"],
    binary_to_output_path_arg=1,          # positional[1] is local output path
    scope="read",
),
("bank-accounts", "create"): Route(
    method="POST", path="/api/v1/bank-accounts",
    json_body_from_positional=0,           # positional[0] is JSON blob
    scope="write",
),
```

Categories of routes the dispatcher must handle (each shows up multiple times across scopes):

1. **JSON-body create/update/upsert/record**: positional[0] is a JSON string; POST/PATCH/PUT it as `application/json`.
2. **Positional-ID get/update/delete**: `/api/v1/<scope>/{id}` with id from positional[0]; for update, positional[1] is the JSON body.
3. **List with filters**: GET `/api/v1/<scope>` with the standard `--similar/--limit/--since/--before/--after` plus scope-specific filters (`--status`, `--country-code`, `--fiscal-year`, `--include-payrolls`, etc.). Reuse the same flag names as the existing CLI ([src/lib/list-filters.ts](business-api/src/lib/list-filters.ts), [src/cli/commands/accounting.ts](business-api/src/cli/commands/accounting.ts)).
4. **Multipart file upload**: `documents upload`, `documents ingest`, `tax-reports attach-receipt`, `bank-imports csv`. Build the multipart body in Python (`uuid4` boundary, MIME guessed by `mimetypes.guess_type`, fallback `application/octet-stream`). File goes in field `file`; remaining JSON metadata is flattened into form fields exactly the way the routes parse them — see [routes/documents.ts:69-75](business-api/src/routes/documents.ts:69) for the `documents/ingest` field shape (top-level scalars + `overrides` as a JSON string field).
5. **Binary download**: `documents download <id> <out>` → stream `GET /…/download` to the output path; emit the same `{ok,outputPath,filename}` JSON the local CLI emits ([cli/commands/documents.ts:90-91](business-api/src/cli/commands/documents.ts:90)).
6. **Action endpoints**: `bookings complete/cancel`, `sales-invoices send`, `bank-transactions match`, `tax-reports suggest-payments`, `tax-reports spain-position`, `tax-report-payment-links update` — POST to a sub-resource path with optional JSON body or flag-to-field translation.
7. **Aliases**: `invoices`/`bills`/`purchase-invoices`/`expense-invoices` → resolve through the same alias map that `registry.ts:79-85` defines (re-encode in Python; keep in sync via a comment pointing at the canonical source).
8. **Host-only**: `serve`, `db *` — print a Markdown error and exit `2`.

Flag parser: a small `parse_flags(argv)` that produces `(positional, options)` matching [parseFlexibleFlagArgs in src/cli/core.ts:118-155](business-api/src/cli/core.ts:118). Supports `--flag value` and `--flag=value`; booleans by membership in a per-command set.

## Output and error formatting

**Success**: write the API response body verbatim to stdout (it is already JSON in the shape the local CLI prints). For binary downloads, write the small `{ok,outputPath,filename}` summary like the local CLI.

**Errors**: business-api returns `{ "error": { "code, message, details?, statusCode? } }` ([middleware/error-handler.ts:33-46](business-api/src/middleware/error-handler.ts:33)). The wrapper should:

- Exit `1` on HTTP 4xx/5xx (and `2` for "host-only" / argument-shape errors).
- Render the failure as Markdown — same shape as `wrobo-biz`'s wrapper-facing output documented in [docs/apps/business-api/cli.md:57-85](docs/apps/business-api/cli.md:57):

  ```
  # Business API CLI Error
  ## Command
  `<scope> <subcommand> ...`
  ## Error Type
  `<error.code>`
  ## Error Message
  <error.message>
  ## Details
  <pretty-printed details, if any>
  ```

- On network/DNS errors, include the request URL and `urllib` reason. No stack trace.
- `--json` (if passed) flips error output to the raw JSON error body for machine consumption (matches the `--json` semantics elsewhere).

## Configuration surface

- `WROBO_API_BASE_URL` — default base URL; overridden by `--base-url`. No localhost default — fail clearly if neither is set.
- `WROBO_API_TOKEN` — PAT or session token, optional if a session file exists.
- `WROBO_API_TIMEOUT_SECS` — default `60`.
- `WROBO_API_CA_BUNDLE` — optional path passed to `ssl.create_default_context(cafile=...)` for self-signed remote instances.

## Delivery scope

**Full surface in one go**: every scope listed above, every subcommand the local CLI supports, in the first PR. The dispatch table makes this tractable — adding a scope is a single dict entry plus, for the rare odd-shaped command, a small handler function. Verification (below) is the long pole, not the wiring.

## Out of scope (explicit)

- No `serve`, no `db init`/`db migrate`, no `data-cache generate` if it triggers in-process embedding work that has no HTTP equivalent (verify; if HTTP route exists, include it; otherwise reject).
- No Node, no Docker, no `npm`. Wrapper runs anywhere with Python 3.9+.
- No retry/idempotency layer beyond what the API already provides (the user's brief asks for a thin wrapper; keep it thin).

## Verification

1. **Local round-trip parity test**: start `business-api` locally (`./container.sh build`), then run the same command through both wrappers and diff stdout:
   ```bash
   wrobo-biz contacts list --json > /tmp/local.json
   WROBO_API_BASE_URL=http://localhost:3000 WROBO_API_TOKEN=$(cat ~/.config/wrobo/session.json | python -c 'import json,sys;print(json.load(sys.stdin)["sessionToken"])') \
     wrobo-biz-api contacts list --json > /tmp/remote.json
   diff /tmp/local.json /tmp/remote.json
   ```
   Repeat for at least: `auth whoami`, `company-card get`, `contacts list`, `documents list`, `documents upload`, `documents ingest`, `documents download`, `expenses create` (JSON-blob style), `sales-invoices list --similar ...`, `bank-imports csv`, `tax-reports list`, `tax-reports attach-receipt`.

2. **Auth flow**: `wrobo-biz-api auth login --email ... --password ...` → confirm session file written with mode `0600`; subsequent `auth whoami` succeeds without `--token`; `auth logout` removes the file.

3. **Error rendering**: hit a 404 (`documents get doc_nonexistent`) and a 401 (no token) — confirm Markdown error block matches the documented shape.

4. **Host-only commands**: `wrobo-biz-api serve` and `wrobo-biz-api db init` must exit `2` with a clear "host-only" Markdown error.

5. **Manual smoke against a remote**: point `WROBO_API_BASE_URL` at a deployed staging instance and run a representative read-only command (`workspace get`, `tax-reports list --country-code ES`).
