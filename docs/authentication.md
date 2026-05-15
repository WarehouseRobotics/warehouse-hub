---
type: design-guide
description: Cross-cutting authentication concepts for the Warehouse Hub platform — actors, tenancy, credentials, scopes, and how the Business API, Dashboard, CLI, and AI agents fit together.
frozen: false
see_also:
  - docs/apps/business-api/authentication.md
  - docs/apps/Business Foundation API.md
  - docs/apps/Dashboard.md
---

# Warehouse Hub Authentication

Warehouse Hub is an agentic platform: humans, internal AI agents (OpenClaw, Claude Desktop, scheduled jobs), and external service callers all reach the Business API through the same authentication surface. The auth model has to do three things well: tell humans apart from agents, let owners revoke a leaked credential within seconds, and stay simple enough that an SMB owner can onboard a teammate without reading a manual.

## Actors

The platform recognises three actor kinds at the auth boundary:

```yaml
actorTypes:
  user:
    description: A human signed into the Dashboard or using the CLI as themselves.
    credentials: [session_cookie, personal_access_token]
  agent:
    description: An autonomous caller acting on behalf of a user — Claude Desktop, OpenClaw skills, scheduled jobs.
    credentials: [personal_access_token]
  system:
    description: Bootstrap, migrations, and the global API_KEY auth alternative.
    credentials: [api_key]
```

Every mutating call records its actor in the audit log. This is the foundation for the "you stay in the loop" guarantee — owners can see exactly which token did what, and revoke it instantly.

## Tenancy

v1 is **single-workspace per deployment**. There is exactly one `workspace` row per running Business API instance, materialised on first boot from `WORKSPACE_NAME` and `WORKSPACE_SLUG` env vars. All users, tokens, contacts, invoices, and audit log entries belong implicitly to this workspace.


## Identities and roles

A `user` is a human account inside the workspace. Every user has exactly one role:

```yaml
roles:
  owner:
    description: The bootstrap user; immutable, exactly one per workspace, cannot be deleted.
    permissions: All admin actions plus full data access.
  admin:
    description: Manages users, invitations, and PATs in the workspace.
    permissions: All admin actions plus full data access.
  member:
    description: Day-to-day operator (sales, accounting, etc).
    permissions: Data access bounded by the scopes on whatever credential they present.
```

v1 does not bind roles to per-domain permissions (e.g. "accountant can only see accounting"). That is what scopes are for, applied at the credential level.

## Credentials

Three credential kinds reach the Business API. The middleware resolves them in this priority:

```yaml
credentials:
  session_cookie:
    format: "wh_session=sess_<24-byte base64url>"
    issued_by: POST /auth/login or POST /auth/magic-link/consume
    storage: HttpOnly, Secure, SameSite=Lax cookie
    ttl: 14 days sliding, capped at 30 days from creation by default
    use: Dashboard browser sessions only
    scope: implicit "admin" — the UI is the trust boundary
  personal_access_token:
    format: "wpat_<24-byte base64url>"
    issued_by: Dashboard Settings → API Tokens, or `wrobo-biz tokens create`
    storage: User stores plaintext; server stores SHA-256 hash only
    ttl: Configurable per token; nullable (no expiry)
    use: CLI, agent integrations (Claude Desktop, OpenClaw, jobs), MCP
    scope: Coarse — read | write | admin (set at creation, immutable)
    actorType: user | agent (set at creation, drives audit log attribution)
  api_key:
    format: arbitrary string from API_KEY env var
    issued_by: deployment configuration
    use: Can still be used in single-user setups where user sessions aren't needed
    scope: implicit admin user (account owner)
```

If a request presents both a stale session cookie and another credential, the
Business API tries PAT and legacy API-key auth before returning the session
failure. This keeps browser-cookie leftovers from blocking CLI or agent calls
that send an explicit bearer token.

Plaintext PATs are returned exactly once at creation, never stored. A leaked PAT is dead the instant the owner clicks "Revoke" in Settings → API Tokens (single SQL update; the next request lookup misses).

## How a human signs in

Two methods are first-class in v1, controlled by independent feature flags so a deployment can run either or both:

- **Email + password.** Classic flow. `bcrypt` for hashing. Off when `AUTH_PASSWORD_LOGIN_ENABLED=false` (magic-link-only mode).
- **Email magic link.** User enters email; the API issues a 15-minute single-use `mlt_*` token and emails it via [Resend](https://resend.com); user clicks the link, the dashboard `/auth/consume` page POSTs the token, and a session is issued. Off when `AUTH_MAGIC_LINK_ENABLED=false`.

Magic-link request always returns `204` regardless of whether the email maps to a real user and performs comparable token-creation work for both known and unknown emails — this prevents account enumeration.

If neither method is enabled, the deployment is locked to `BOOTSTRAP_OWNER_*` plus PATs only.

## How an agent gets credentials

Agents do not log in; they carry a PAT minted by a human:

```yaml
agentOnboarding:
  - Owner signs into Dashboard.
  - Settings → API Tokens → "Create token".
  - Picks: name (e.g. "Claude Desktop"), actorType=agent, scopes (default: write).
  - One-time modal shows wpat_xxx with a copy button and an explicit warning.
  - Owner pastes into the agent's config:
      - Claude Desktop MCP server: Authorization: Bearer wpat_xxx
      - OpenClaw secret store: WROBO_API_TOKEN=wpat_xxx
      - Scheduled jobs: same env var.
  - Every mutation by that agent lands in audit_log with
    actorType=agent, actorTokenId=<id>, actorUserId=<owner>.
```

The owner can revoke the token in one click. Audit trail survives revocation.

## Scopes

v1 ships three coarse scopes:

```yaml
scopes:
  read:   GET on any resource.
  write:  POST/PATCH/PUT/DELETE on data resources (implies read).
  admin:  User management, invitations, PAT management, workspace settings (implies write).
```

A namespaced vocabulary is reserved in code so v2 can refine without invalidating issued tokens:

```yaml
futureNamespace:
  - accounting:read | accounting:write
  - crm:read | crm:write
  - documents:read | documents:write
  - tasks:read | tasks:write
  - admin:workspace | admin:users | admin:tokens
```

Today, every existing route asks for `read` or `write`. Per-domain enforcement is opt-in later without a breaking change.

## Audit

Every non-GET response with status `< 400` writes one `audit_log` row:

```ts
type AuditEntry = {
  at: string;           // ISO-8601
  actorUserId: string | null;
  actorTokenId: string | null;
  actorType: "user" | "agent" | "system";
  action: string;       // e.g. "expense.create"
  objectType: string;   // e.g. "expense"
  objectId: string;
  requestId: string;
  metadata: Record<string, unknown>;
};
```

Routes opt in by setting `res.locals.audit` before responding. The audit middleware does no inference — if a route does not set it, no audit row is written. This keeps the trail trustworthy.

## Component map

```yaml
components:
  business-api:
    middleware/auth.ts:        Resolves credential → req.context = {userId, user, role, scopes, actorType, source}.
    middleware/audit.ts:       Writes audit_log row from req.context + res.locals.audit.
    services/users.ts:         User CRUD + bcrypt password hashing.
    services/user-sessions.ts: Cookie sessions (sess_*).
    services/personal-access-tokens.ts: PAT lifecycle (wpat_*).
    services/magic-link-tokens.ts: Single-use mlt_* tokens.
    services/user-invitations.ts:  Wraps magic-link for invite_accept; sends email.
    services/email.ts:         Resend wrapper; no-op + WARN log when key absent.
    services/audit-log.ts:     Append-only writer + query helper.
    routes/{auth,users,tokens,workspace}.ts: HTTP surface.
    cli/commands/{auth,users,tokens,workspace}.ts: Same surface from the CLI.
  dashboard:
    lib/api.ts:                Sends cookie credentials; dispatches wh:auth:expired on 401.
    lib/session.ts:            Real session shape from GET /auth/me.
    pages/login-page.tsx:      Password + magic-link forms.
    pages/auth-consume-page.tsx:    Magic-link landing.
    pages/accept-invite-page.tsx:   Invitation acceptance.
    pages/team-page.tsx:       Settings → Team (admin only).
    pages/api-tokens-page.tsx: Settings → API Tokens with one-time-display modal.
  agents:
    Claude Desktop, OpenClaw, scheduled jobs: hold a PAT; no login flow of their own.
```

The MCP server is a separate, future component. When it lands, it accepts the same `Authorization: Bearer wpat_*` PATs through the same middleware — no MCP-specific credential type.

## Cross-references

- API-specific schema, endpoints, and middleware behavior: [docs/apps/business-api/authentication.md](apps/business-api/authentication.md).
- Business API overview: [docs/apps/Business Foundation API.md](apps/Business%20Foundation%20API.md).
- Dashboard overview: [docs/apps/Dashboard.md](apps/Dashboard.md).
