---
type: feature-guide
description: Business API authentication implementation — schema, middleware, routes, CLI, config, and email integration for the v1 multi-user PAT model.
project_dir: business-api
frozen: false
see_also:
  - docs/authentication.md
  - docs/apps/Business Foundation API.md
  - docs/apps/business-api/services.md
  - docs/apps/business-api/cli.md
---

# Business API Authentication

This guide documents the v1 authentication implementation in `business-api`: basic API token (master account auth), per-user accounts, browser sessions, Personal Access Tokens (PATs) for humans and agents, magic-link email login, invitations, and the audit log.

Auth modality controlled by env vars: 

`HUB_AUTH_MODE` = "api-key" | "pam" (allows original single-user API key auth mode)
`HUB_PASSWORD_LOGIN` = "0" | "1" (allows login+password logins, if disabled - only api-key or magic links)

For cross-platform concepts (actors, tenancy, the agent workflow narrative), see [docs/authentication.md](../../authentication.md).

## Data model

Seven new tables, all in `src/db/schema/`, all registered in `src/db/schema/index.ts`. Conventions match the rest of the codebase: text PKs via `createPrefixedId()` ([src/lib/ids.ts](../../../business-api/src/lib/ids.ts)), ISO-8601 text timestamps, `deletedAt` for soft-delete where it applies, indexes on lookup columns.

### `workspaces`

Singleton in v1. Seeded on first boot from env vars; idempotent.

```ts
type Workspace = {
  id: string;          // ws_*
  slug: string;
  name: string;
  createdAt: string;
  deletedAt: string | null;
};
```

### `users`

```ts
type User = {
  id: string;          // usr_*
  workspaceId: string; // FK
  email: string;       // unique among active users in the workspace
  displayName: string;
  passwordHash: string | null;   // null for magic-link-only users
  role: "owner" | "admin" | "member";
  createdAt: string;
  lastLoginAt: string | null;
  deletedAt: string | null;
};
```

The owner is immutable. `softDeleteUser(ownerId)` throws, and the database enforces at most one active owner per workspace.

### `user_sessions`

Browser cookie sessions. Mirrors `contact_auth_tokens.ts` patterns.

```ts
type UserSession = {
  id: string;          // sess_*
  userId: string;
  tokenHash: string;   // SHA-256 of "sess_<24-byte base64url>"
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  userAgent: string | null;
};
```

TTL defaults to `SESSION_TTL_DAYS` (14). On each successful auth, both `expiresAt` and `lastUsedAt` are bumped — sliding renewal.

### `personal_access_tokens`

```ts
type PersonalAccessToken = {
  id: string;          // pat_*
  userId: string;
  name: string;        // user-supplied label, e.g. "Claude Desktop"
  tokenHash: string;   // SHA-256 of "wpat_<24-byte base64url>"
  scopes: string;      // JSON array, e.g. ["read","write"]
  actorType: "user" | "agent";
  expiresAt: string | null;   // nullable: tokens can be perpetual
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
```

Plaintext is returned exactly once at creation and never stored. `lastUsedAt` is updated asynchronously after a successful auth (never blocks the request).

### `magic_link_tokens`

```ts
type MagicLinkToken = {
  id: string;          // mlt_*
  email: string;
  tokenHash: string;   // SHA-256 of "mlt_<24-byte base64url>"
  purpose: "login" | "invite_accept";
  expiresAt: string;   // default: now + 15 min
  consumedAt: string | null;
  createdAt: string;
};
```

Single-use: `consumeMagicLink` sets `consumedAt` atomically and rejects further use.

### `user_invitations`

```ts
type UserInvitation = {
  id: string;          // inv_*
  email: string;
  invitedByUserId: string;
  role: "admin" | "member";
  magicLinkTokenId: string;     // FK; the accept flow piggybacks on magic-link infra
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
```

### `audit_log`

Append-only. Indexed on `at`, `actorUserId`, and `(objectType, objectId)`.

```ts
type AuditEntry = {
  id: string;          // aud_*
  at: string;
  actorUserId: string | null;   // null for system actions
  actorTokenId: string | null;  // null for cookie-session actions
  actorType: "user" | "agent" | "system";
  action: string;       // namespaced, e.g. "expense.create"
  objectType: string;
  objectId: string;
  requestId: string;
  metadata: string;     // JSON
};
```

## Token formats

```yaml
prefixes:
  ws_:    workspace
  usr_:   user
  sess_:  session (raw token: sess_<24-byte base64url>)
  pat_:   PAT row id
  wpat_:  PAT raw token (wpat_<24-byte base64url>)
  mlt_:   magic-link row id and raw token
  inv_:   invitation
  aud_:   audit log entry
```

All raw tokens use `crypto.randomBytes(24).toString("base64url")` and are stored as `crypto.createHash("sha256").update(raw).digest("hex")`. The same helper used by `contact-auth-tokens.ts` is reused.

## Middleware

### `requireAuth`

Replaces the legacy `requireApiKey` in [src/middleware/auth.ts](../../../business-api/src/middleware/auth.ts). Resolves credentials in priority order and attaches `req.context` for downstream use:

```ts
type RequestContext = {
  userId: string | null;
  role: "owner" | "admin" | "member" | null;
  scopes: Array<"read" | "write" | "admin">;
  actorType: "user" | "agent" | "system";
  sessionId: string | null;
  tokenId: string | null;
  source: "session" | "pat" | "legacy";
};
```

Resolution order:

1. `Cookie: wh_session=sess_*` → `requireActiveSession()` → context with `source: "session"`, `scopes: ["admin"]` (UI is the trust boundary).
2. `Authorization: Bearer wpat_*` or `X-Api-Key: wpat_*` → `requireActiveToken()` → context with `source: "pat"`, scopes/actorType from the token row. `lastUsedAt` updated async.
3. `Authorization: Bearer <legacy API_KEY>` → context with `source: "legacy"`, `actorType: "system"`, `scopes: ["admin"]`.
4. None of the above → `401 unauthorized`.

### `requireScope(scope)` and `requireRole(role)`

Helper middlewares for per-route gating.

```ts
requireScope("write");        // admin > write > read implication
requireRole("admin");          // for /users, /tokens, /workspace PATCH
```

### `audit` middleware

Post-route. On any non-GET response with status `< 400` and `res.locals.audit` set, writes one `audit_log` row. Routes opt in:

```ts
expensesRouter.post("/", validateBody(expenseInputSchema), (req, res) => {
  const expense = createExpense(req.body);
  res.locals.audit = { action: "expense.create", objectType: "expense", objectId: expense.expenseId };
  res.status(201).json(expense);
});
```

No inference — if a route omits `res.locals.audit`, no row is written. This keeps the trail trustworthy.

### Mount order in `src/app.ts`

```yaml
mountOrder:
  - public:                 # mounted BEFORE requireAuth
      - POST /api/v1/auth/login
      - POST /api/v1/auth/magic-link/request
      - POST /api/v1/auth/magic-link/consume
      - POST /api/v1/users/invitations/:token/accept
  - protected:              # mounted AFTER requireAuth
      - everything else under /api/v1
```

## API surface

All endpoints under `/api/v1`. Bodies are validated with Zod via `validateBody()` ([src/middleware/validate.ts](../../../business-api/src/middleware/validate.ts)).

### Auth

`POST /auth/login`

```json
// Request
{ "email": "owner@example.com", "password": "hunter2" }

// Response 200
{
  "userId": "usr_a1b2c3d4e5",
  "sessionToken": "sess_...",
  "expiresAt": "2026-05-29T22:00:00Z",
  "user": { "id": "usr_...", "email": "...", "displayName": "...", "role": "owner" }
}
```

Sets `Set-Cookie: wh_session=sess_...; HttpOnly; Secure; SameSite=Lax; Path=/`. The body also includes `sessionToken` for non-browser clients.

`POST /auth/magic-link/request`

```json
{ "email": "user@example.com", "purpose": "login" }
```

Always returns `204` regardless of whether the email maps to a user. No enumeration.

`POST /auth/magic-link/consume`

```json
{ "token": "mlt_..." }
```

Same response shape as `/auth/login`.

`POST /auth/logout` — revokes the current session.

`GET /auth/me`

```json
{
  "user": { "id": "usr_...", "email": "...", "displayName": "...", "role": "admin" },
  "workspace": { "id": "ws_...", "slug": "default", "name": "Northwind Robotics" }
}
```

### Users (admin scope)

```yaml
GET    /users                              # list workspace users
POST   /users/invitations                  # body: {email, role}; sends invite email; returns {invitationId, expiresAt, acceptUrl}
DELETE /users/invitations/:id              # revoke pending invitation
POST   /users/invitations/:token/accept    # public; body: {displayName, password?}; returns session
PATCH  /users/:id                          # change role / displayName
DELETE /users/:id                          # soft-delete; refuses owner
```

### Personal Access Tokens (current user)

`POST /tokens`

```json
// Request
{
  "name": "Claude Desktop",
  "actorType": "agent",
  "scopes": ["write"],
  "expiresAt": null
}

// Response 201 — plaintext returned ONCE
{
  "tokenId": "pat_a1b2c3d4e5",
  "plaintext": "wpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "Claude Desktop",
  "actorType": "agent",
  "scopes": ["write"],
  "expiresAt": null,
  "createdAt": "2026-05-15T09:00:00Z"
}
```

`GET /tokens` — lists current user's tokens (no plaintext, includes `lastUsedAt`).

`DELETE /tokens/:id` — revokes (sets `revokedAt`).

### Workspace

```yaml
GET   /workspace          # singleton info
PATCH /workspace          # admin only; update name/slug
```

## CLI surface

CLI commands follow the scope/subcommand pattern in `src/cli/commands/`. JSON output by default. See [cli.md](cli.md) for the wrapper details.

```bash
wrobo-biz auth login --email owner@example.com           # password from TTY/stdin or --password
wrobo-biz auth logout
wrobo-biz auth whoami --json
wrobo-biz auth magic-link request --email owner@example.com
wrobo-biz auth magic-link consume <token>

wrobo-biz users list --json
wrobo-biz users invite --email teammate@example.com --role member
wrobo-biz users revoke-invite <invitationId>
wrobo-biz users set-role <userId> --role admin
wrobo-biz users delete <userId>

wrobo-biz tokens create --name claude-desktop --actor-type agent --scopes write --json
wrobo-biz tokens list --json
wrobo-biz tokens revoke <tokenId>

wrobo-biz workspace get --json
wrobo-biz workspace set --name "Northwind Robotics"
```

### CLI session storage

`auth login` and `auth magic-link consume` write `~/.config/wrobo/session.json`:

```json
{
  "baseUrl": "http://localhost:3100",
  "sessionToken": "sess_...",
  "expiresAt": "2026-05-29T22:00:00Z"
}
```

All other commands read this on startup. Override via `--token <wpat_*>` flag or `WROBO_API_TOKEN` env var (the latter is the standard for CI and Docker).

The CLI dispatcher ([src/cli/index.ts](../../../business-api/src/cli/index.ts)) injects the credential into the API client before calling any handler — existing command files require no changes.

## Bootstrap

On first boot, `services/workspaces.ts` performs idempotent seeding:

1. If no row in `workspaces`, insert one using `WORKSPACE_NAME` and `WORKSPACE_SLUG`.
2. If `BOOTSTRAP_OWNER_EMAIL` is set and no user with that email exists, insert an owner user. If `BOOTSTRAP_OWNER_PASSWORD` is also set, hash it; otherwise the owner is magic-link-only (assuming `AUTH_MAGIC_LINK_ENABLED=true`).
3. Re-running this is a no-op.

## Email integration (Resend)

`src/services/email.ts` wraps the Resend SDK. Two templates in v1:

- `magicLinkLoginEmail({ to, url, expiresAt })`
- `userInviteEmail({ to, inviterName, workspaceName, url, expiresAt })`

The URL points at `${DASHBOARD_BASE_URL}/auth/consume?token=...` (login) or `${DASHBOARD_BASE_URL}/accept-invite/${token}` (invite). When `RESEND_API_KEY` is unset the service is a no-op that logs the would-be email at WARN level — useful for local dev without a Resend account.

## Config

Add to [src/config.ts](../../../business-api/src/config.ts) `envSchema` and mirror in `.env.example`:

```yaml
WORKSPACE_NAME:                 default "Default Workspace"
WORKSPACE_SLUG:                 default "default"
BOOTSTRAP_OWNER_EMAIL:          optional; first-boot owner seed
BOOTSTRAP_OWNER_PASSWORD:       optional; pairs with above
AUTH_PASSWORD_LOGIN_ENABLED:    default true
AUTH_MAGIC_LINK_ENABLED:        default true
SESSION_TTL_DAYS:               default 14
DASHBOARD_BASE_URL:             required for magic-link emails
RESEND_API_KEY:                 optional; email is a no-op when absent
```

`API_KEY` continues to be honoured during the v1 deprecation window (logged at WARN per request) so existing OpenClaw and CLI deployments do not break on upgrade.

## Migration notes

- First boot after upgrade: `services/workspaces.ts` seeds the singleton workspace + optional owner. Idempotent on subsequent boots.
- Regular `API_KEY` also still works (but is no longer the default auth mode)
- `contact_auth_tokens` is a separate subsystem (external contacts authenticating themselves) and is unaffected by this change.

## Tests

Vitest, mirroring [src/services/tax-reports.test.ts](../../../business-api/src/services/tax-reports.test.ts).

Unit:

- Token hash/expiry/revoke round-trip for sessions, PATs, magic links.
- Scope implication (`admin > write > read`).
- Bootstrap idempotency (re-running seed does not duplicate workspace or owner).
- Password verification (correct/wrong).
- Magic-link request returns `204` for unknown emails (enumeration safety).

Integration (against a temporary SQLite file, per route family):

- Login (password + magic-link) → create PAT → call protected route → revoke → confirm `401`.
- Read-only PAT cannot POST → `403`.
- Regular static `API_KEY` still works with WARN log.
- Invitation accept end-to-end.

## Related

- Cross-cutting model: [docs/authentication.md](../../authentication.md).
- Service conventions reused: [services.md](services.md).
- CLI wrapper details: [cli.md](cli.md).
- Implementation plan: `~/.claude/plans/let-s-prepare-authentication-specs-bright-pine.md` (and the 35 tasks scoped on the `business-api` and `dashboard` taskboards).
