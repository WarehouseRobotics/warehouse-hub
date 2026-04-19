---
type: design-guide
description: Practical conventions for text embeddings of documents and other content
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/architecture/Business API Architecture.md
---


# Business Foundation API Embeddings

This document describes the current technical design of text embeddings in the `business-api` codebase.

It is written against the current implementation, not the original scaffold plan, so developers can use it as a practical guide for modifying and extending the embedding system.

## Purpose

The embeddings subsystem gives the Business Foundation API a semantic search layer for selected business entities.

Today it is used to:

- turn structured business records into searchable text
- generate real embeddings through the configured local/private LLM API
- store embedding metadata plus vectors in SQLite
- run nearest-neighbor similarity search by entity type

The current implementation supports these entity types:

- `company_card`
- `contact`
- `document`
- `deal`
- `expense_invoice`
- `sales_invoice`
- `task`

## Main Files

The current embedding implementation lives primarily in:

- [embeddings.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/embeddings.ts)
- [embedding-provider.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/embedding-provider.ts)
- [llm-config.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/llm-config.ts)
- [connection.ts](/Users/denis/src/warehouse-hub/business-api/src/db/connection.ts)
- [embeddings.ts](/Users/denis/src/warehouse-hub/business-api/src/db/schema/embeddings.ts)

Embedding sync is currently triggered from these services:

- [company-card.ts](/Users/denis/src/warehouse-hub/business-api/src/services/company-card.ts)
- [contacts.ts](/Users/denis/src/warehouse-hub/business-api/src/services/contacts.ts)
- [documents.ts](/Users/denis/src/warehouse-hub/business-api/src/services/documents.ts)
- [deals.ts](/Users/denis/src/warehouse-hub/business-api/src/services/deals.ts)
- [expenses.ts](/Users/denis/src/warehouse-hub/business-api/src/services/expenses.ts)
- [sales-invoices.ts](/Users/denis/src/warehouse-hub/business-api/src/services/sales-invoices.ts)
- [tasks.ts](/Users/denis/src/warehouse-hub/business-api/src/services/tasks.ts)

## High-Level Flow

The embedding flow has four layers:

1. A service creates or updates a business entity.
2. The service maps that entity into a searchable text string with `computeEmbeddingText(...)`.
3. `upsertEmbedding(...)` generates an embedding vector for that text and stores it.
4. `findSimilar(...)` later generates an embedding for a query string and compares it against stored vectors.

In practice the flow looks like this:

```text
resource service
  -> computeEmbeddingText(entityType, entityPayload)
  -> upsertEmbedding(entityType, entityId, text)
    -> createEmbeddingVector(text)
      -> createTextEmbedding(text)
        -> local OpenAI-compatible /embeddings API
    -> store/update metadata row in entity_embeddings
    -> store/update vector row in vec_embeddings
```

## Configuration

Embedding provider configuration is loaded from YAML.

Current default config file:

- [llms.yaml](/Users/denis/src/warehouse-hub/business-api/config/llms.yaml)

The current code loads from:

1. `LLMS_CONFIG_PATH` if set
2. project-local `business-api/config/llms.yaml`
3. `~/.wrobo-hub/llms.yaml`

The embedding config section currently expects:

```yaml
llms:
  embedding:
    style: openai-compatible
    endpoint: http://host:port/v1
    model_name: your-embedding-model
    apiKey: "sk-..."
    default_dims: 768
```

Relevant runtime env vars in the current code:

- `LLMS_CONFIG_PATH`
- `EMBEDDING_API_TIMEOUT_MS`
- `EMBEDDING_ALLOW_STUB_FALLBACK`

`EMBEDDING_ALLOW_STUB_FALLBACK=false` is the normal production-style behavior.

When `EMBEDDING_ALLOW_STUB_FALLBACK=true`, provider failures fall back to deterministic stub vectors. This is mainly used to keep some test/dev scenarios resilient.

## Provider Design

The real provider client is implemented in [embedding-provider.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/embedding-provider.ts).

Current design choices:

- provider style is currently only `openai-compatible`
- the Business API calls `POST {endpoint}/embeddings`
- request body includes:
  - `model`
  - `input`
  - `dimensions` when configured
- authentication uses `Authorization: Bearer <apiKey>` when present
- response validation accepts OpenAI-style payloads and ignores extra top-level fields such as `object` and `usage`

Main exported functions:

- `createTextEmbeddings(inputs: string[])`
- `createTextEmbedding(input: string)`

These return:

- provider model name
- vector data
- vector dimensions

## Storage Design

There are two storage layers:

### 1. Metadata table

Defined in [src/db/schema/embeddings.ts](/Users/denis/src/warehouse-hub/business-api/src/db/schema/embeddings.ts):

- `id`
- `entity_type`
- `entity_id`
- `content_hash`
- `model`
- `created_at`

The migration creates a unique constraint on:

- `(entity_type, entity_id)`

This means each entity has at most one current embedding record.

### 2. Vector store

The actual vector payload is stored in `vec_embeddings`.

There are currently two runtime backends:

- `sqlite-vec`
- `json`

The backend is selected at DB initialization time in [connection.ts](/Users/denis/src/warehouse-hub/business-api/src/db/connection.ts).

#### sqlite-vec backend

Used when the native extension loads successfully.

Current shape:

```sql
CREATE VIRTUAL TABLE vec_embeddings USING vec0(
  embedding float[N]
)
```

Where `N` is taken from the configured embedding dimensions.

#### JSON fallback backend

Used when the native extension cannot load in the current environment.

Current shape:

```sql
CREATE TABLE vec_embeddings (
  rowid INTEGER PRIMARY KEY,
  embedding TEXT NOT NULL
)
```

The vector is stored as JSON text and similarity is computed in application code with cosine distance.

This fallback exists because the current Docker environment cannot load the packaged `sqlite-vec` binary.

## Text Representation Per Entity

The semantic quality of search depends heavily on `computeEmbeddingText(...)` in [embeddings.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/embeddings.ts).

The current implementation does not build a hand-written prose summary. Instead it:

1. Builds a small structured document for the entity type.
2. Removes empty values:
   - `null`
   - `undefined`
   - empty strings
   - empty arrays
   - empty objects
3. Recursively converts object keys to `snake_case`.
4. Serializes the normalized result into a deterministic YAML-like text block.

Important current formatting rules:

- strings are JSON-quoted
- arrays stay as YAML lists rather than being flattened into free text
- nested objects stay nested
- if every field normalizes away, the result is an empty string

### `company_card`

Includes:

- `entityType`
- `displayName`
- `legalName`
- `taxId`
- `email`
- `phone`
- `website`

### `contact`

Includes:

- `entityType`
- `displayName`
- `legalName`
- `roles`
- `taxId`
- `email`
- `notes`

### `document`

Includes:

- `entityType`
- `kind`
- `source`
- `originalFilename`
- `filename`
- `mimeType`
- `ocrStatus`
- `ocrText`
- `extractedData`

### `deal`

Includes:

- `entityType`
- `title`
- `stage`
- `notes`
- `lineItems`

`lineItems` are preserved as structured list items in the YAML output. They are not flattened into one text sentence.

### `expense_invoice`

Includes:

- `entityType`
- `supplierDisplayName`
- `supplierLegalName`
- `supplierEmail`
- `invoiceNumber`
- `invoiceDate`
- `dueDate`
- `currency`
- `net`
- `tax`
- `gross`
- `taxLines`
- `lineItems`
- `category`
- `notes`
- `status`

### `sales_invoice`

Includes:

- `entityType`
- `invoiceNumber`
- `status`
- `customerDisplayName`
- `customerLegalName`
- `customerEmail`
- `currency`
- `issueDate`
- `serviceDate`
- `dueDate`
- `notes`
- `lineItems`

Like `deal` and `expense_invoice`, `lineItems` remain structured in the output.

### `task`

Includes:

- `entityType`
- `title`
- `description`
- `status`
- `priority`

### Example Output Shape

For example, a sales invoice embedding text currently looks more like:

```yaml
entity_type: "sales_invoice"
invoice_number: "2026-0001"
status: "draft"
customer_display_name: "Acme Retail GmbH"
currency: "EUR"
line_items:
  -
    description: "Warehouse audit and automation proposal"
    quantity: "1"
    unit_price: "1500.00"
```

This exact structure matters for docs and tests. If you change the text-generation rules, update both the entity mapping and any tests that assert on the emitted YAML keys.

## Upsert Design

The central write path is `upsertEmbedding(entityType, entityId, text)`.

Current behavior:

1. Compute a SHA-256 `contentHash` from the text.
2. Look up an existing metadata row by `(entity_type, entity_id)`.
3. If the stored hash matches, do nothing.
4. Otherwise generate a fresh vector.
5. Validate that vector length matches the configured dimensions.
6. Update or insert metadata in `entity_embeddings`.
7. Replace the corresponding row in `vec_embeddings`.

Important implementation details:

- embedding writes are currently async
- service-layer callers schedule them as fire-and-forget background work
- the code includes a retry-safe path for unique-constraint races when create/update overlap
- closed-DB errors during test teardown are treated as benign and suppressed by service wrappers

## Query Design

The central read path is `findSimilar(entityType, query, limit)`.

Current behavior:

1. Generate a real embedding for the query text.
2. Restrict results to a single `entityType`.
3. Return the closest `entityId`s with a numeric `distance`.

Backend behavior differs by runtime mode:

### sqlite-vec mode

Runs nearest-neighbor search inside SQLite via `MATCH` and `distance`.

### JSON fallback mode

- loads stored vectors for the requested entity type
- computes cosine distance in application code
- sorts ascending by distance
- returns the top `limit`

## Why Embedding Sync Is Triggered In Services

The current code intentionally triggers embedding updates inside resource services, not routes and not generic DB hooks.

That keeps the text representation close to the mapped business payload and makes it easier to evolve entity-specific behavior.

Examples:

- company card service syncs after create/update
- document service syncs after upload
- expense service syncs after create/update
- sales invoice service syncs after generate/update

This fits the general Business API service design:

- routes stay thin
- services own business side effects
- API mapping and embedding mapping happen near each other

## Current Limitations

Developers should know these current constraints:

### sqlite-vec is not active in the current container

The code supports sqlite-vec, but the current Docker environment cannot load the native extension. The runtime falls back to the JSON backend.

This means:

- real embeddings are still generated correctly
- similarity search still works
- search is slower and less scalable than native sqlite-vec

### Embedding writes are fire-and-forget

Service-level embedding sync currently uses background async calls. That keeps CRUD requests simple, but means:

- embedding sync failures do not fail the main write operation
- eventual consistency is acceptable by design right now
- tests sometimes need a short wait before querying newly written embeddings

### Only text embeddings are implemented

There is no reranking stage, no chunked document embedding pipeline, and no OCR-to-embedding pipeline yet.

## How To Extend It

### Add a new entity type

To add embeddings for another resource:

1. Add the entity literal to `EmbeddingEntityType` in [embeddings.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/embeddings.ts).
2. Add a `computeEmbeddingText(...)` case for the entity.
3. Trigger `upsertEmbedding(...)` from the appropriate create/update service path.
4. Add tests for:
   - text construction
   - upsert behavior
   - similarity lookup behavior

### Improve text quality for an existing entity

The safest place is `computeEmbeddingText(...)`.

Guidelines:

- prefer meaningful business fields over raw IDs
- update `createEmbeddingDocument(...)` rather than appending prose later in the pipeline
- keep nested business data structured when it is meaningful for search
- remember that empty values are stripped before serialization
- remember that keys are emitted as `snake_case` in the final text
- keep representation deterministic

### Add another embedding provider style

That work belongs in:

- [llm-config.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/llm-config.ts)
- [embedding-provider.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/embedding-provider.ts)

You would typically:

1. extend config validation
2. branch provider behavior by `style`
3. normalize the provider response into the same `EmbeddingResult` shape

### Make writes synchronous

If a future feature requires strict consistency, service wrappers can `await upsertEmbedding(...)` instead of scheduling it in the background.

That would trade off request latency for stronger guarantees.

### Move fully to sqlite-vec

Once the runtime environment can load the native extension:

- the current code will automatically use `sqlite-vec`
- JSON fallback can remain as a safety net or be removed later

If removed, update:

- `connection.ts`
- `findSimilar(...)`
- related tests that currently tolerate fallback mode

## Recommended Developer Checklist

When touching embeddings, verify:

1. The provider config loads from the intended YAML file.
2. Returned vector dimensions match `default_dims`.
3. The entity text builder includes the most useful human/business concepts.
4. `upsertEmbedding(...)` is triggered from every write path that should refresh searchability.
5. `findSimilar(...)` still behaves correctly in both sqlite-vec and JSON fallback modes.
6. Mock tests and real API tests both pass.

## Current Test Coverage

Embedding-specific tests currently live in:

- [embeddings.mock.test.ts](/Users/denis/src/warehouse-hub/business-api/test/embeddings.mock.test.ts)
- [embeddings.real.test.ts](/Users/denis/src/warehouse-hub/business-api/test/embeddings.real.test.ts)

Additional service-level integration coverage exists in:

- [services.integration.test.ts](/Users/denis/src/warehouse-hub/business-api/test/services.integration.test.ts)

These tests currently cover:

- mocked provider behavior
- real configured provider behavior
- vector persistence
- similarity lookup
- sales invoice embedding text content
- sales invoice similarity search integration
