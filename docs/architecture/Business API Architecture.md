---
type: core-spec
description: Describes design principles of the Business API stack - foundational business management infrastructure for the Warehouse Hub
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
---

# Business API Architecture

* Node.js (Typescript)
* Express.js
* SQLite for database with asg017/sqlite-vec for vector storage
* Drizzle ORM and zod
* Winston for structured JSON logging
* MCP SDK

## API and CLI conventions for MVP

The first implementation pass should keep the transport conventions simple and predictable so the same operations map cleanly across REST, MCP and CLI.

Suggested conventions:

* REST base path: `/api/v1`
* primary resources use plural nouns: `/contacts`, `/expenses`, `/deals`, `/sales-invoices`
* prefer standard nested paths over custom action suffixes, for example `/contacts/resolve` and `/sales-invoices/{salesInvoiceId}/send`
* mutating endpoints accept optional idempotency keys for safe agent retries
* money values should be stored as strings in API payloads, not floating point numbers
* uploaded files should be stored as `documents` and linked from business records by ID
* sales invoice generation should be deterministic from `company_card + contact + deal + invoice options`
* CLI should mirror API nouns and verbs closely, for example `whub biz expenses create`
* MCP tools should follow the same resource naming to keep prompts and tool usage easy to learn

Suggested MVP resource set:

* `company_card`
* `contacts`
* `documents`
* `expenses`
* `deals`
* `sales_invoices`

Suggested persistence split in SQLite:

* relational business tables for deterministic lookups and bookkeeping
* document metadata and linkage tables
* vector index only for document search, OCR summaries and semantic recall, not as source of truth for accounting records

Logging conventions:

* runtime and operational diagnostics should go through a shared `winston` logger
* logs should be emitted as JSON so they are easy to ingest in Docker, local tooling, and future observability pipelines
* `LOG_LEVEL` controls verbosity across the API server, background work, and development scripts
* CLI command payloads should stay on stdout as JSON results, while diagnostic logging remains separate

Dev tools:

* Vitest
* ESLint + prettier


## Development environment

Two ways to run locally: directly and Docker.

We're developing this in two distinct environments - local laptop and a Raspberry Pi, which simulates the target deployment. 

For running and testing on the local laptop we'll need to have a Docker setup, so a docker-compose setup must be prepared.
