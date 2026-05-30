# Data Caches — Specification

A **data cache** is a named, persistently-stored reference dataset backed by SQLite. Unlike in-memory caches, data cache entries survive restarts and are queryable by the business API, CLI, and agent tools. Each cache has a configurable key type, a value JSON schema, and an optional fetcher instruction workflow for missing values.

## Use Cases

- **Currency exchange rates** — `key_type: date`, keys like `"2024-03-15"` for the pair `USD/EUR`. On a cache miss, lookup can return an instruction prompt that a calling agent uses to fetch and submit the rate.
- **Material prices (BOM)** — `key_type: string`, keys are supplier SKUs. Updated weekly via a bulk CSV import. When a price is missing the fetcher prompt can include the supplier data URL and submission instructions.

---

## Database Schema

### `data_caches`

One row per named dataset.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | `dche_` nanoid prefix |
| `slug` | TEXT UNIQUE | Human-friendly identifier, e.g. `currency-rates` |
| `display_name` | TEXT | |
| `description` | TEXT | nullable |
| `key_type` | TEXT | `string` \| `date` \| `datetime` \| `numeric` |
| `value_schema` | TEXT (JSON) | JSON Schema for the value object — see [Value Schema](#value-schema) |
| `fetcher_config` | TEXT (JSON) | nullable — see [Fetcher Config](#fetcher-config) |
| `default_ttl_days` | INTEGER | nullable; how long an entry is considered fresh before being treated as stale |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `data_cache_entries`

One row per stored data point.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | `dce_` nanoid prefix |
| `cache_id` | TEXT FK | → `data_caches.id` |
| `entry_key` | TEXT | Always stored as a string; ordering behaviour depends on `key_type` |
| `value` | TEXT (JSON) | Validated against the cache's `value_schema` at write time |
| `source` | TEXT | `fetcher` \| `manual` \| `import` |
| `fetched_at` | TEXT | ISO timestamp of when this value was obtained |
| `expires_at` | TEXT | nullable; overrides `default_ttl_days` for this entry |
| `created_at` | TEXT | |

**Unique constraint:** `(cache_id, entry_key)`

**Index:** `(cache_id, entry_key)` for exact lookup; ordered proximity queries use `ORDER BY` on the key column with type-appropriate casting (see [Key Type Ordering](#key-type-ordering)).

---

## Value Schema

The `value_schema` column holds a JSON Schema object that describes the shape of `entry.value`.

**Default schema** (when not specified at cache creation):

```json
{ "type": "object", "properties": { "value": {} }, "required": ["value"] }
```

**Custom example** — exchange rate entry:

```json
{
  "type": "object",
  "properties": {
    "rate": { "type": "string" },
    "base": { "type": "string" },
    "target": { "type": "string" }
  },
  "required": ["rate", "base", "target"]
}
```

**Custom example** — material price with min/mean/max:

```json
{
  "type": "object",
  "properties": {
    "price_mean": { "type": "string" },
    "price_min":  { "type": "string" },
    "price_max":  { "type": "string" },
    "currency":   { "type": "string" },
    "unit":       { "type": "string" }
  },
  "required": ["price_mean", "currency"]
}
```

All writes to `data_cache_entries.value` are validated against the owning cache's `value_schema`. Validation failures are returned as errors to the caller.

---

## Fetcher Config

`fetcher_config` is a JSON object stored on the cache. When present, lookup can return a `needs_fetch` instruction for the calling agent.

### Required Field

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | Prompt template. Supports `{{ key }}` and `{{ config.<field> }}` placeholders. |

### Optional Fields

Any additional fields in `fetcher_config` are available as `{{ config.<field> }}` in the prompt template.

### Prompt Template Variables

| Variable | Description |
|----------|-------------|
| `{{ key }}` | The lookup key being fetched (e.g. `"2024-03-15"` or `"SKU-001"`) |
| `{{ config.<field> }}` | Any other field from `fetcher_config` |

After interpolating the prompt, lookup appends the cache's value schema and API submission instructions:

```
JSON response schema:
```json
<value_schema>
```
```

### Example — Currency Rates Cache

```json
{
  "prompt": "Look up the {{ config.base_currency }}/{{ config.target_currency }} exchange rate for {{ key }}. Use the rates feed at {{ config.data_url }} if available. Reply with ONLY a JSON object matching the schema below.",
  "base_currency": "EUR",
  "target_currency": "USD",
  "data_url": "https://api.example.com/rates"
}
```

### Example — Material Prices Cache

```json
{
  "prompt": "Retrieve the current price for material SKU {{ key }} from the supplier price list at {{ config.price_list_url }}. Return a JSON object matching the schema below.",
  "price_list_url": "https://supplier.example.com/pricelist.csv"
}
```

---

## Generic Agent Fetch Workflow

Lookup does not call an external agent directly. It returns a `needs_fetch` payload when a fresh value is missing and `fetcher_config` is present. The caller should use the returned `instructionPrompt`, fetch the value with whatever local or remote tools it has, submit the JSON object to the returned submission endpoint, then retry the lookup.

### `needs_fetch` Response

```json
{
  "key": "2026-04-26",
  "source": "needs_fetch",
  "instructionPrompt": "Look up the EUR/USD exchange rate for 2026-04-26...\n\nJSON response schema:\n```json\n...\n```\n\nPOST /api/v1/data-caches/currency-rates/fetch-submissions...",
  "valueSchema": {
    "type": "object",
    "properties": {
      "rate": { "type": "string" }
    },
    "required": ["rate"]
  },
  "submission": {
    "method": "POST",
    "path": "/api/v1/data-caches/currency-rates/fetch-submissions",
    "bodyExample": {
      "key": "2026-04-26",
      "value": {}
    }
  },
  "retry": {
    "method": "POST",
    "path": "/api/v1/data-caches/currency-rates/lookup",
    "body": {
      "key": "2026-04-26",
      "strategy": "fetch_on_miss"
    }
  }
}
```

### Submission Request

```http
POST /api/v1/data-caches/:slug/fetch-submissions
Content-Type: application/json
Authorization: Bearer <business-api-token>
```

```json
{
  "key": "2026-04-26",
  "value": {
    "rate": "1.0823"
  },
  "expiresAt": "2026-04-27T00:00:00.000Z"
}
```

The submitted `value` is validated against `value_schema` and stored with `source: "fetcher"`. `fetchTimeoutMs` remains accepted on lookup requests for compatibility, but it is ignored.

---

## Key Type Ordering

Key ordering is used for "nearest entry" and "last known value" fallback queries. Behaviour by `key_type`:

| `key_type` | Ordering mechanism | Nearest query |
|------------|-------------------|---------------|
| `date` | ISO date string lexicographic sort | `ORDER BY ABS(julianday(entry_key) - julianday(?))` |
| `datetime` | ISO datetime string lexicographic sort | `ORDER BY ABS(julianday(entry_key) - julianday(?))` |
| `numeric` | Cast to REAL in SQL | `ORDER BY ABS(CAST(entry_key AS REAL) - CAST(? AS REAL))` |
| `string` | No meaningful order | Nearest/fallback not applicable; exact match only |

For `string` key types, the `staleness_window` strategy degrades to `fetch_on_miss` (no proximity query is possible).

---

## Lookup Strategies

Every `lookup()` call specifies a strategy. The strategy controls whether a missing fresh value returns a `needs_fetch` instruction and how fallback to previously known values works.

### `fallback_only`

Simplest strategy — no fetcher invocation.

1. Query for exact `(cache_id, entry_key)` match.
2. If found and not expired → return with `source: "exact"`.
3. For ordered key types: find the nearest stored entry (no time-range bound) → return with `source: "fallback"`.
4. For `string` key types: return `null`.

### `fetch_on_miss`

Returns an agent instruction on a cache miss when `fetcher_config` exists.

1. Query for exact `(cache_id, entry_key)` match.
2. If found and not expired → return with `source: "exact"`.
3. If not found and `fetcher_config` exists → return `source: "needs_fetch"` with submission and retry instructions.
4. If no `fetcher_config` exists, for ordered key types: fall back to nearest stored entry → return with `source: "fallback"`.
5. Return `null` if no fallback available.

### `staleness_window`

Most complete strategy. Accepts a `maxStalenessWindow` parameter (in days) that bounds how far a fallback value can be from the requested key before a fetch instruction is returned.

1. Query for exact `(cache_id, entry_key)` match.
2. If found and not expired → return with `source: "exact"`.
3. If not found → query for the nearest stored entry within `maxStalenessWindow` distance from the requested key.
4. If a within-window entry exists → return with `source: "fallback"`, `isStale: true`, `staleDays: <distance>`.
5. If no within-window entry and `fetcher_config` exists → return `source: "needs_fetch"` with submission and retry instructions.
6. If no `fetcher_config` exists, fall back to the nearest stored entry regardless of distance → return with `source: "fallback"`, `isStale: true`.
7. Return `null` if no entries exist at all.

> **Note:** For `string` key types, `staleness_window` degrades to `fetch_on_miss` — steps 3–4 are skipped and the last-resort fallback in step 7 is also skipped.

---

## Service API

```typescript
// src/services/data-caches.ts

interface DataCacheInput {
  slug: string
  displayName: string
  description?: string
  keyType: 'string' | 'date' | 'datetime' | 'numeric'
  valueSchema?: JsonObject          // defaults to { type: 'object', properties: { value: {} }, required: ['value'] }
  fetcherConfig?: FetcherConfig
  defaultTtlDays?: number
}

interface FetcherConfig {
  prompt: string
  [key: string]: unknown            // additional fields become {{ config.X }} template variables
}

interface LookupOptions {
  strategy: 'fallback_only' | 'fetch_on_miss' | 'staleness_window'
  maxStalenessWindow?: number       // days; required for staleness_window
  fetchTimeoutMs?: number           // accepted for compatibility; ignored
}

interface FoundLookupResult {
  key: string
  value: JsonObject
  source: 'exact' | 'fallback'
  fetchedAt: string
  isStale: boolean
  staleDays?: number                // only set when source === 'fallback'
}

interface NeedsFetchLookupResult {
  key: string
  source: 'needs_fetch'
  instructionPrompt: string
  valueSchema: JsonObject
  submission: {
    method: 'POST'
    path: string
    bodyExample: { key: string; value: JsonObject }
  }
  retry: {
    method: 'POST'
    path: string
    body: { key: string; strategy: LookupOptions['strategy']; maxStalenessWindow?: number }
  }
}

type LookupResult = FoundLookupResult | NeedsFetchLookupResult

class DataCacheService {
  // Cache definitions
  createCache(input: DataCacheInput): Promise<DataCache>
  getCache(slug: string): Promise<DataCache>
  listCaches(): Promise<DataCache[]>

  // Entries
  upsertEntry(cacheSlug: string, key: string, value: JsonObject, source?: 'manual' | 'import'): Promise<DataCacheEntry>
  submitFetchedEntry(cacheSlug: string, key: string, value: JsonObject, expiresAt?: string): Promise<DataCacheEntry>
  bulkImport(cacheSlug: string, entries: { key: string; value: JsonObject }[]): Promise<{ inserted: number; updated: number }>

  // Lookup
  lookup(cacheSlug: string, key: string, opts: LookupOptions): Promise<LookupResult | null>
}
```

---

## HTTP API Routes

All routes are under the `/api/v1/` prefix.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/data-caches` | List all cache definitions |
| `POST` | `/data-caches` | Create a cache |
| `GET` | `/data-caches/:slug` | Get cache metadata |
| `GET` | `/data-caches/:slug/entries` | List entries — query params: `?key=&limit=` |
| `POST` | `/data-caches/:slug/lookup` | Lookup with strategy — body: `{ key, strategy, maxStalenessWindow?, fetchTimeoutMs? }` |
| `POST` | `/data-caches/:slug/entries` | Upsert a single entry — body: `{ key, value }` |
| `POST` | `/data-caches/:slug/fetch-submissions` | Submit an agent-fetched value — body: `{ key, value, expiresAt? }` |
| `POST` | `/data-caches/:slug/import` | Bulk import — body: `{ entries: [{ key, value }] }` |

---

## CLI Commands

```bash
# List all caches
data-cache list

# Create a cache
data-cache create <slug> \
  --name "Currency Rates EUR/USD" \
  --key-type date \
  --value-schema '{"type":"object","properties":{"rate":{"type":"string"}},"required":["rate"]}' \
  --fetcher-config '{"prompt":"Look up EUR/USD rate for {{ key }}. JSON only."}' \
  --ttl-days 1

# Get cache info
data-cache get <slug>

# Lookup with strategy
data-cache lookup <slug> <key> \
  --strategy staleness_window \
  --max-staleness-days 7

# Upsert a single entry
data-cache upsert <slug> <key> --value '{"rate":"1.0823"}'

# Bulk import from a JSON file (array of { key, value } objects)
data-cache import <slug> --file ./rates.json

# Bulk import from a CSV file (specify which columns map to key and value fields)
data-cache import <slug> --file ./prices.csv \
  --key-col "SKU" \
  --value-col "Price" \
  --value-currency-col "Currency"
```

---

## Environment Variables

No data-cache-specific agent environment variables are required. Callers use the normal Business API base URL and authentication token when submitting fetched values.

---

## Integration Example — Currency Normalisation

A utility function in `src/lib/currency.ts` wraps the cache lookup for use in the expenses service:

```typescript
export async function convertCurrency(
  amount: string,
  from: string,
  to: string,
  date: Date,
  strategy: LookupOptions['strategy'] = 'staleness_window'
): Promise<{ convertedAmount: string; rate: string; source: string } | null>
```

Internally it calls:

```typescript
DataCacheService.lookup('currency-rates', `${from}/${to}:${toIsoDate(date)}`, {
  strategy,
  maxStalenessWindow: 7,
})
```

The expenses list and aggregate routes can optionally accept a `normalizeCurrency` query parameter that triggers this conversion, returning amounts in the company card's base currency alongside the original.

---

## Implementation Sequence

1. **Migration** — `data_caches` + `data_cache_entries` tables, unique constraint, proximity indexes.
2. **Drizzle schema** — two schema files added to `src/db/schema/`, exported from `index.ts`.
3. **`DataCacheService`** — `createCache`, `upsertEntry`, `bulkImport`, and `lookup` with all three strategies.
4. **Fetcher instructions** — prompt interpolation, JSON Schema block, submission endpoint, and retry endpoint.
5. **API routes** — thin Express layer over the service, including fetch submissions.
6. **CLI** — `data-cache` command scope.
7. **`convertCurrency` utility** — thin wrapper for the currency normalisation use case.
8. **Expense normalisation** — optional `normalizeCurrency` param on list/aggregate expense endpoints.
