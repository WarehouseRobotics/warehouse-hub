---
type: feature-guide
description: Architecture and usage notes for persistent data caches in the Business API.
project_dir: business-api
frozen: false
see_also:
  - docs/apps/business-api/services.md
  - docs/apps/business-api/cli.md
  - docs/openclaw/http-api.md
---

# Data Caches

Data caches are persistent reference datasets stored in the `business-api` SQLite database.

Use them for values that:

* should survive restarts
* need exact or nearest-key lookup
* may be imported manually
* may be fetched on demand through an OpenClaw agent

Examples:

* exchange rates by date
* supplier material prices
* sensor or benchmark values keyed by number or timestamp

## Architecture

The feature follows the standard Business API vertical slice:

* DB migration: `src/db/migrations/0005_data_caches.sql`
* Drizzle schema: `src/db/schema/data-caches.ts`
* request schemas: `src/schemas/data-caches.ts`
* service logic: `src/services/data-caches.ts`
* HTTP routes: `src/routes/data-caches.ts`
* CLI integration: `src/cli.ts`

The service is the system boundary. Routes and CLI commands validate input, call the service, and return mapped results.

## Data Model

Cache definition:

```yaml
table: data_caches
fields:
  id: "TEXT primary key, dche_ prefix"
  slug: "TEXT unique"
  display_name: "TEXT required"
  description: "TEXT nullable"
  key_type: "string | date | datetime | numeric"
  value_schema: "TEXT JSON Schema"
  fetcher_config: "TEXT JSON object, nullable"
  default_ttl_days: "INTEGER nullable"
  created_at: "TEXT ISO timestamp"
  updated_at: "TEXT ISO timestamp"
```

Cache entry:

```yaml
table: data_cache_entries
fields:
  id: "TEXT primary key, dce_ prefix"
  cache_id: "TEXT foreign key to data_caches.id"
  entry_key: "TEXT required"
  value: "TEXT JSON object"
  source: "fetcher | manual | import"
  fetched_at: "TEXT ISO timestamp"
  expires_at: "TEXT ISO timestamp, nullable"
  created_at: "TEXT ISO timestamp"
indexes:
  - "unique(cache_id, entry_key)"
  - "index(cache_id, entry_key)"
  - "index(cache_id, created_at desc)"
```

Notes:

* entries are updated in place for the same `(cache_id, entry_key)`
* this feature does not use soft delete
* entry values are always JSON objects

## Validation Model

Two validation layers are used:

* `zod` validates transport input for routes and CLI payloads
* `ajv` validates dynamic JSON Schema stored in `value_schema`

Why both:

* request bodies are known TypeScript-side contracts
* `value_schema` is runtime JSON data, not a TypeScript schema object
* entries and fetched agent responses must be checked against that stored schema at runtime

Default value schema:

```json
{
  "type": "object",
  "properties": {
    "value": {}
  },
  "required": ["value"]
}
```

Behavior:

* cache creation rejects invalid JSON Schema
* entry upsert rejects values that do not match the cache schema
* fetched agent payloads are validated before storage

## Lookup Behavior

Supported key types:

```yaml
key_types:
  string:
    ordered: false
    nearest_lookup: false
  date:
    ordered: true
    nearest_lookup: true
    sql_ordering: "ABS(julianday(entry_key) - julianday(?))"
  datetime:
    ordered: true
    nearest_lookup: true
    sql_ordering: "ABS(julianday(entry_key) - julianday(?))"
  numeric:
    ordered: true
    nearest_lookup: true
    sql_ordering: "ABS(CAST(entry_key AS REAL) - CAST(? AS REAL))"
```

Lookup strategies:

```yaml
fallback_only:
  - "return exact value when present and fresh"
  - "otherwise return nearest stored value for ordered key types"
  - "for string keys return null on miss"

fetch_on_miss:
  - "return exact value when present and fresh"
  - "otherwise try the fetcher once when configured"
  - "if fetch succeeds, store and return the fetched entry"
  - "if fetch fails, return nearest fallback for ordered key types"
  - "for string keys return null when nothing is fetched"

staleness_window:
  - "return exact value when present and fresh"
  - "for ordered key types, return nearest fallback when distance is within maxStalenessWindow"
  - "otherwise try the fetcher once when configured"
  - "if fetch fails, return nearest fallback for ordered key types"
  - "for string keys degrade to fetch_on_miss"
```

Lookup result shape:

```yaml
fields:
  key: "resolved entry key"
  value: "entry JSON object"
  source: "exact | fetched | fallback"
  fetchedAt: "ISO timestamp"
  isStale: "boolean"
  staleDays: "number, only for fallback on ordered key types"
```

Freshness rules:

* `expires_at` wins when present
* otherwise `default_ttl_days` is applied from the cache definition
* when neither is set, stored values are treated as non-expiring

## Fetcher Integration

Fetcher support is optional and configured per cache through `fetcher_config`.

Minimum config:

```yaml
prompt: "Prompt template with {{ key }} and optional {{ config.some_field }} placeholders"
```

Runtime behavior:

* interpolate the prompt
* append the cache JSON Schema as a fenced `json` block
* call the OpenClaw control API over HTTP
* parse a JSON object from the agent reply
* validate it against `value_schema`
* store it as a `fetcher` entry on success

Environment variables:

```yaml
OPENCLAW_CONTROL_API_HOST: "default 127.0.0.1"
OPENCLAW_CONTROL_API_PORT: "default 8181"
OPENCLAW_DATA_FETCHER_AGENT: "required only for fetch-enabled lookups"
OPENCLAW_GATEWAY_TOKEN: "required only for fetch-enabled lookups"
```

Control API request shape:

```json
[
  "agent",
  "--agent",
  "<OPENCLAW_DATA_FETCHER_AGENT>",
  "--message",
  "<interpolated prompt>",
  "--deliver"
]
```

JSON extraction order:

```yaml
steps:
  - "first fenced ```json ... ``` block"
  - "otherwise parse full stdout as JSON"
```

Fetch failures are non-fatal to lookup flow. The service logs the issue and continues with fallback behavior when possible.

## HTTP API

Base path:

```text
/api/v1/data-caches
```

Endpoints:

```yaml
routes:
  - "GET /api/v1/data-caches"
  - "POST /api/v1/data-caches"
  - "GET /api/v1/data-caches/:slug"
  - "GET /api/v1/data-caches/:slug/entries"
  - "POST /api/v1/data-caches/:slug/lookup"
  - "POST /api/v1/data-caches/:slug/entries"
  - "POST /api/v1/data-caches/:slug/import"
```

Route notes:

* `GET /entries` supports `key` and `limit`
* `POST /entries` is a manual upsert
* `POST /import` accepts `{ entries: [{ key, value, expiresAt? }] }`
* `POST /lookup` accepts `key`, `strategy`, and optional `maxStalenessWindow` and `fetchTimeoutMs`

## CLI

The feature is available through the `data-cache` CLI scope.

Commands:

```yaml
commands:
  - "data-cache list"
  - "data-cache create <slug> --name <display-name> --key-type <type>"
  - "data-cache get <slug>"
  - "data-cache lookup <slug> <key> --strategy <strategy>"
  - "data-cache upsert <slug> <key> --value <json>"
  - "data-cache import <slug> --file <path>"
```

Import behavior:

```yaml
json_file:
  accepted_shapes:
    - "{ entries: [{ key, value, expiresAt? }] }"
    - "[{ key, value, expiresAt? }]"
csv_file:
  requires:
    - "--key-col"
  behavior:
    - "with --value-col, map the row to { value: <cell> }"
    - "without --value-col, map all non-key columns into the value object"
```

## Current Scope

Implemented in this session:

* persistent cache definitions and entries
* runtime JSON Schema validation
* exact lookup, nearest fallback, staleness windows
* optional OpenClaw-backed fetch on miss
* HTTP API
* CLI support
* integration tests for service, route, and CLI paths

Not implemented yet:

* direct currency normalization integration into expenses, payrolls, or invoices
* dashboard UI for browsing or editing caches
* cache deletion endpoints
