---
type: iteration-plan
date: 2026-03-29
goal: Scaffold the Express.js project and implement basic CRUD logic for the MVP feature set.
notes: Covers company card, contacts registry, expense and sales registries and some basic task management with API and CLI tools.
workpaths: business-api/*; docs/*
frozen: true
---

# Business Foundation API - Initial Scaffold Plan

**Goal:** Scaffold the Express.js project and implement basic CRUD logic for the MVP feature set.

## Scope

This first iteration covers:

1. Company card (single owned profile)
2. Contacts registry (persons and companies, with auto-create/resolve)
3. Expense registry (linked to contacts and documents)
4. Sales registry (deals and sales invoices, invoice generation)
5. Basic task management (projects, tasks, subtasks)

Out of scope for this iteration: MCP server, PDF generation, OCR/vector search, email sending, VAT compliance rails, webapp UI. But we have to keep it in mind for architectural decisions.

---

## Phase 1: Project Bootstrap

Set up the Node.js/TypeScript project inside `business-api/`.

### 1.1 Initialize project

- `package.json` with name `@warehouse-hub/business-api`
- TypeScript config (`tsconfig.json`) targeting ES2022, strict mode
- ESLint + Prettier config
- Vitest config
- `.env.example` with `PORT`, `DATABASE_PATH`, `UPLOAD_DIR`, `API_KEY`

### 1.2 Dependencies

**Runtime:**
- `express` + `@types/express`
- `better-sqlite3` + `@types/better-sqlite3` (underlying driver)
- `drizzle-orm` + `drizzle-orm/better-sqlite3` for type-safe schema, queries and migrations
- `sqlite-vec` (`@anthropic-ai/sqlite-vec` or built from `asg017/sqlite-vec`) for vector storage
- `zod` for API request/response validation (separate from Drizzle schema — zod validates HTTP payloads, Drizzle defines DB shape)
- `multer` for file uploads
- `nanoid` for internal ID generation (prefixed IDs like `ct_`, `exp_`, `deal_`, etc.)
- `dotenv`

**Dev:**
- `typescript`, `tsx` (for dev server)
- `drizzle-kit` for migration generation and management
- `vitest`
- `eslint`, `prettier`

### 1.3 Docker setup

- `Dockerfile` for the API (Node 22 alpine)
- `docker-compose.yml` with:
  - `business-api` service exposing port 3100
  - Mounted volume for SQLite database and uploads

### 1.4 Entry point and app structure

```
business-api/
  src/
    index.ts              # server entry point
    app.ts                # Express app factory
    config.ts             # env config with zod validation
    middleware/
      auth.ts             # API key authentication middleware
      validate.ts         # zod validation middleware
      error-handler.ts    # centralized error handler
    db/
      connection.ts       # SQLite connection + sqlite-vec extension loader
      schema/             # Drizzle table definitions
        company-card.ts
        contacts.ts
        documents.ts
        expenses.ts
        deals.ts
        sales-invoices.ts
        projects.ts
        tasks.ts
        embeddings.ts     # shared vector embedding tables
        index.ts          # barrel export
      seed.ts             # optional dev seed data
    lib/
      ids.ts              # prefixed nanoid generators
      slug-ids.ts         # dictionary-based random word ID generator, like 'blue-jazzy-train-lake'
      errors.ts           # AppError class
      money.ts            # string-based money helpers
      embeddings.ts       # embedding helpers: compute, store, query nearest
    routes/
      company-card.ts
      contacts.ts
      documents.ts
      expenses.ts
      deals.ts
      sales-invoices.ts
      projects.ts
      tasks.ts
    schemas/              # zod schemas per resource
      company-card.ts
      contact.ts
      document.ts
      expense.ts
      deal.ts
      sales-invoice.ts
      project.ts
      task.ts
    services/             # business logic per resource
      company-card.ts
      contacts.ts
      documents.ts
      expenses.ts
      deals.ts
      sales-invoices.ts
      projects.ts
      tasks.ts
  test/
    setup.ts              # in-memory SQLite for tests
    ...                   # mirrors src/ structure
  uploads/                # gitignored, local file storage
```

---

## Phase 2: Database Schema

Tables are defined as Drizzle schema files in `src/db/schema/`. Migrations are generated with `drizzle-kit generate` and applied on startup via `drizzle-kit migrate`. We use `TEXT` for money columns and prefixed string IDs. Every entity also carries a human-friendly `slug` column (see Phase 5.2).

The sqlite-vec extension is loaded at connection time to enable vector columns and nearest-neighbor queries. Embedding storage uses a dedicated virtual table (see 2.3).

### 2.1 Tables

**company_card** (singleton row)
- `id` TEXT PK
- `slug` TEXT UNIQUE
- `legal_name`, `display_name`, `tax_id`, `email`, `phone`, `website`
- `address_street1`, `address_street2`, `address_city`, `address_postal_code`, `address_country_code`
- `currency`, `payment_terms_days`, `vat_mode`
- `bank_iban_masked`, `bank_bic`
- `created_at`, `updated_at`
- `deleted_at` TEXT (nullable, soft delete)

**contacts**
- `id` TEXT PK (prefix `ct_`)
- `slug` TEXT UNIQUE
- `parent_contact_id` TEXT FK -> contacts (nullable; persons nest under companies)
- `type` TEXT (`person` | `company`)
- `roles` TEXT (JSON array, e.g. `["customer"]`)
- `display_name`, `legal_name`, `tax_id`, `email`, `phone`
- `billing_address_street1`, `billing_address_city`, `billing_address_postal_code`, `billing_address_country_code`
- `notes` TEXT
- `status` TEXT DEFAULT `active`
- `created_at`, `updated_at`
- `deleted_at` TEXT (nullable, soft delete)

Contact nesting: a `person` contact can have `parent_contact_id` pointing to a `company` contact, representing an employee/representative at that company. The resolve endpoint matches against the company first, then optionally the person underneath.

**documents**
- `id` TEXT PK (prefix `doc_`)
- `slug` TEXT UNIQUE
- `kind` TEXT (`expense_invoice`, `sales_invoice`, `contract`, `other`)
- `source` TEXT
- `original_filename`, `mime_type`, `file_path`, `checksum`
- `storage_status` TEXT DEFAULT `stored`
- `ocr_status` TEXT DEFAULT `pending`
- `created_at`
- `deleted_at` TEXT (nullable, soft delete)

**expenses**
- `id` TEXT PK (prefix `exp_`)
- `slug` TEXT UNIQUE
- `supplier_contact_id` TEXT FK -> contacts
- `document_id` TEXT FK -> documents (nullable)
- `invoice_number`, `invoice_date`, `due_date`
- `currency`
- `net`, `tax`, `gross` (all TEXT)
- `tax_lines` TEXT (JSON)
- `category`, `notes`
- `status` TEXT DEFAULT `recorded` (`recorded` | `paid` | `void`)
- `created_at`, `updated_at`
- `deleted_at` TEXT (nullable, soft delete)

**deals**
- `id` TEXT PK (prefix `deal_`)
- `slug` TEXT UNIQUE
- `customer_contact_id` TEXT FK -> contacts
- `title`, `stage` TEXT
- `currency`
- `expected_close_date`
- `line_items` TEXT (JSON array)
- `net`, `tax`, `gross` (all TEXT, computed on create)
- `notes`
- `created_at`, `updated_at`
- `deleted_at` TEXT (nullable, soft delete)

**sales_invoices**
- `id` TEXT PK (prefix `sinv_`)
- `slug` TEXT UNIQUE
- `invoice_number` TEXT UNIQUE
- `seller_company_id` TEXT FK -> company_card
- `customer_contact_id` TEXT FK -> contacts
- `deal_id` TEXT FK -> deals (nullable)
- `issue_date`, `service_date`, `due_date`
- `currency`, `payment_terms_days`
- `line_items` TEXT (JSON)
- `net`, `tax`, `gross` (all TEXT)
- `status` TEXT DEFAULT `draft` (`draft` | `finalized` | `paid` | `cancelled`)
- `pdf_document_id` TEXT FK -> documents (nullable)
- `created_at`, `updated_at`
- `deleted_at` TEXT (nullable, soft delete)

Note: the `sent` status is removed for this iteration since invoice sending is out of scope. Replaced with `finalized` to indicate the invoice is locked and ready.

**invoice_number_seq** (counter table for sequential invoice numbers)
- `year` INTEGER PK
- `last_number` INTEGER

Invoice number format: `{YEAR}-{SEQ}` (e.g. `2026-0041`). Will be made configurable on company card in a future iteration.

**projects**
- `id` TEXT PK (prefix `proj_`)
- `slug` TEXT UNIQUE
- `owner_entity_id` TEXT FK -> contacts or company_card (the owning entity)
- `owner_entity_type` TEXT (`company_card` | `contact`)
- `name`, `description`
- `status` TEXT DEFAULT `active`
- `created_at`, `updated_at`
- `deleted_at` TEXT (nullable, soft delete)

Projects are always linked to an entity (company or person). On first company card creation, a default "Tasks" project is auto-created for the owning tenant.

**tasks**
- `id` TEXT PK (prefix `task_`)
- `slug` TEXT UNIQUE
- `project_id` TEXT FK -> projects
- `parent_task_id` TEXT FK -> tasks (nullable, for subtasks)
- `title`, `description`
- `status` TEXT DEFAULT `open` (`open` | `in_progress` | `done` | `cancelled`)
- `priority` TEXT DEFAULT `medium`
- `due_date` TEXT (nullable)
- `created_at`, `updated_at`
- `deleted_at` TEXT (nullable, soft delete)

### 2.2 Drizzle / zod boundary

- **Drizzle schema** (`src/db/schema/*.ts`) defines the database tables, columns, types, defaults and relations. It is the source of truth for the DB shape and is used to generate migrations.
- **Zod schemas** (`src/schemas/*.ts`) validate incoming HTTP request bodies and shape outgoing API responses. They are deliberately separate from Drizzle because the API contract does not always mirror the DB 1:1 (e.g. nested address objects in API vs flat columns in DB, JSON fields parsed into typed objects, computed fields omitted from input).
- Services bridge the two: they accept zod-validated input, map it to Drizzle insert/update shapes, and map query results back to API response shapes.

### 2.3 Vector embeddings (sqlite-vec)

Entities that benefit from semantic search get vector embeddings. For this iteration, the following entities are embedding-enabled:

- **company_card** — find the company by natural-language description
- **contacts** — semantic search over contact names, notes, roles
- **documents** — search over OCR text / document metadata (prepared for future OCR pipeline)
- **deals** — search deals by title, description, line item content
- **tasks** — search tasks by title and description

**entity_embeddings** (sqlite-vec virtual table + metadata)

Metadata table (regular):
- `id` TEXT PK (prefix `emb_`)
- `entity_type` TEXT (`company_card` | `contact` | `document` | `deal` | `task`)
- `entity_id` TEXT (FK to the source entity)
- `content_hash` TEXT (hash of the text that was embedded, to skip re-embedding unchanged content)
- `model` TEXT (embedding model identifier, e.g. `text-embedding-3-small`)
- `created_at`

UNIQUE constraint on (`entity_type`, `entity_id`).

Vector table (sqlite-vec virtual table):
- `rowid` INTEGER (matches the rowid of the metadata table)
- `embedding` FLOAT[N] (dimension depends on model; scaffold for 1536-dim for now)

Created via:
```sql
CREATE VIRTUAL TABLE vec_embeddings USING vec0(
  rowid INTEGER PRIMARY KEY,
  embedding float[1536]
);
```

**Embedding workflow for this iteration:**

For now we'll use **stub embeddings**. The embedding pipeline is scaffolded but not fully automated yet:
1. A helper in `lib/embeddings.ts` exposes `computeEmbeddingText(entityType, entity)` which builds a plain-text representation for each entity type (e.g. for a contact: `"{displayName} {legalName} {roles} {notes}"`).
2. For now we just use stub emedding vectors. A service function `upsertEmbedding(entityType, entityId, text)` hashes the text, calls an embedding provider (stubbed/configurable), and inserts into both tables.
3. A query helper `findSimilar(entityType, queryEmbedding, limit)` runs a sqlite-vec nearest-neighbor search filtered by entity type.
4. For this iteration, embedding generation can be triggered manually via CLI (`wrobo biz embeddings sync`) or as a future background job. Services should call `upsertEmbedding` on create/update so the pipeline is wired but the actual embedding provider can be swapped in later.

---

## Phase 3: API Routes and Services

Each resource gets a route file, a zod schema file, and a service file. Services use Drizzle ORM for all database operations (queries, inserts, updates). Zod schemas validate HTTP input/output at the route layer. All endpoints require API key authentication (see Phase 5.6). All list queries exclude soft-deleted records by default.

### 3.1 Company Card

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| GET | `/api/v1/company-card` | `getCompanyCard()` | Returns the singleton row or 404 |
| PUT | `/api/v1/company-card` | `upsertCompanyCard(data)` | Insert or update. On first insert, auto-creates default "Tasks" project |

### 3.2 Contacts

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/contacts` | `createContact(data)` | Accepts optional `parentContactId` for nesting persons under companies |
| GET | `/api/v1/contacts` | `listContacts(filters)` | `?role=`, `?query=`, `?type=`, `?parentContactId=` |
| GET | `/api/v1/contacts/:id` | `getContact(id)` | Accepts `id` or `slug`. Includes nested persons if type=company |
| PATCH | `/api/v1/contacts/:id` | `updateContact(id, data)` | |
| DELETE | `/api/v1/contacts/:id` | `softDeleteContact(id)` | Sets `deleted_at` |
| POST | `/api/v1/contacts/resolve` | `resolveContact(data)` | Match by taxId/email/legalName, optionally auto-create |

### 3.3 Documents

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/documents` | `uploadDocument(file, meta)` | Multipart via multer |
| GET | `/api/v1/documents/:id` | `getDocumentMeta(id)` | Metadata only. Accepts `id` or `slug` |
| GET | `/api/v1/documents/:id/download` | `downloadDocument(id)` | Stream the file |
| DELETE | `/api/v1/documents/:id` | `softDeleteDocument(id)` | Sets `deleted_at` |

### 3.4 Expenses

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/expenses` | `createExpense(data)` | Validates supplier contact and document exist |
| GET | `/api/v1/expenses` | `listExpenses(filters)` | `?supplierContactId=`, `?category=`, `?status=` |
| GET | `/api/v1/expenses/:id` | `getExpense(id)` | Accepts `id` or `slug` |
| PATCH | `/api/v1/expenses/:id` | `updateExpense(id, data)` | Status transitions: `recorded` -> `paid` or `void` |
| DELETE | `/api/v1/expenses/:id` | `softDeleteExpense(id)` | Sets `deleted_at` |

### 3.5 Deals

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/deals` | `createDeal(data)` | Computes totals from line items |
| GET | `/api/v1/deals` | `listDeals(filters)` | `?stage=`, `?customerContactId=` |
| GET | `/api/v1/deals/:id` | `getDeal(id)` | Accepts `id` or `slug` |
| PATCH | `/api/v1/deals/:id` | `updateDeal(id, data)` | Stage transitions, line item edits |
| DELETE | `/api/v1/deals/:id` | `softDeleteDeal(id)` | Sets `deleted_at` |

### 3.6 Sales Invoices

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/sales-invoices` | `generateSalesInvoice(data)` | Pulls company card + contact + deal, assigns next invoice number |
| GET | `/api/v1/sales-invoices` | `listSalesInvoices(filters)` | `?status=`, `?customerContactId=` |
| GET | `/api/v1/sales-invoices/:id` | `getSalesInvoice(id)` | Accepts `id` or `slug` |
| PATCH | `/api/v1/sales-invoices/:id` | `updateSalesInvoice(id, data)` | Status transitions: `draft` -> `finalized` -> `paid`; or `draft`/`finalized` -> `cancelled` |
| DELETE | `/api/v1/sales-invoices/:id` | `softDeleteSalesInvoice(id)` | Sets `deleted_at` |

Note: the `/send` endpoint is removed from this iteration. Invoice sending will be added in a future iteration.

### 3.7 Projects

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/projects` | `createProject(data)` | Requires `ownerEntityId` + `ownerEntityType` |
| GET | `/api/v1/projects` | `listProjects(filters)` | `?ownerEntityId=`, `?status=` |
| GET | `/api/v1/projects/:id` | `getProject(id)` | Accepts `id` or `slug`. Includes task summary counts |
| PATCH | `/api/v1/projects/:id` | `updateProject(id, data)` | |
| DELETE | `/api/v1/projects/:id` | `softDeleteProject(id)` | Sets `deleted_at` |

### 3.8 Tasks

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/tasks` | `createTask(data)` | Supports `parentTaskId` for subtasks |
| GET | `/api/v1/tasks` | `listTasks(filters)` | `?projectId=`, `?status=`, `?parentTaskId=` |
| GET | `/api/v1/tasks/:id` | `getTask(id)` | Accepts `id` or `slug`. Includes subtasks |
| PATCH | `/api/v1/tasks/:id` | `updateTask(id, data)` | Status transitions |
| DELETE | `/api/v1/tasks/:id` | `softDeleteTask(id)` | Sets `deleted_at` |

---

## Phase 4: CLI Scaffolding

The existing `wrobo` shell script delegates `biz` subcommands to a Node.js script. The Node.js script can also be run directly for development and testing.

### 4.1 CLI structure

```
cli/
  src/
    biz/
      index.ts            # subcommand router, also works as standalone entry point
      client.ts           # HTTP client wrapper (base URL + API key from env/flag)
      commands/
        company-card.ts
        contacts.ts
        documents.ts
        expenses.ts
        deals.ts
        sales-invoices.ts
        projects.ts
        tasks.ts
      format.ts           # human-readable vs --json output
```

The `wrobo` shell script routes `wrobo biz <args>` to `node cli/dist/biz/index.js <args>` (or `tsx cli/src/biz/index.ts` in dev mode).

### 4.2 Priority commands for this iteration

```
wrobo biz company-card get|set
wrobo biz contacts create|list|get|resolve
wrobo biz expenses create|get|list|update
wrobo biz deals create|get|list
wrobo biz sales-invoices generate|get|list|update
wrobo biz documents upload|get|download
wrobo biz projects create|list|get
wrobo biz tasks create|list|get|update
```

All commands support `--json` for agent consumption and return stable exit codes (0 = success, 1 = not found, 2 = validation error, 3 = conflict).

All commands accept `--api-key` flag or read `WHUB_API_KEY` env var.

Resources can be referenced by `id` or `slug` in all commands (e.g. `wrobo biz contacts get swift-jazzy-train`).

---

## Phase 5: Shared Infrastructure and Cross-Cutting Concerns

### 5.1 Error handling

- `AppError` class with `statusCode`, `code` (machine-readable), `message`
- Express error handler middleware returns JSON `{ error: { code, message } }`
- Consistent across all routes

### 5.2 ID generation

Every entity gets two identifiers:

**Internal ID (nanoid):**
- Prefixed nanoid: `ct_`, `doc_`, `exp_`, `deal_`, `sinv_`, `proj_`, `task_`
- 12-char random suffix (e.g. `ct_a1b2c3d4e5f6`)
- Used as the primary key in the database and for FK references

**Human-friendly slug (word-based):**
- Generated from an internal dictionary of common English words
- Format: `{adjective}-{adjective}-{noun}-{noun}` (e.g. `swift-jazzy-train-sky`)
- Checked for uniqueness within the table before assignment
- Stored in the `slug` column (UNIQUE index)
- Used in API responses, CLI output, and agent interactions so LLMs can reliably reference entities without confusing random character sequences
- All GET-by-ID endpoints accept either the internal `id` or the `slug`

The dictionary should contain ~200-300 adjectives and ~200-300 nouns, providing millions of unique combinations. The generator picks random words, concatenates them, and retries on collision.

### 5.3 Money handling

- All money values stored and transmitted as strings
- Utility functions: `addMoney(a, b)`, `multiplyMoney(amount, quantity)`, `computeTaxLine(base, rate)`
- Used in deal total computation and invoice generation

### 5.4 Request validation

- Zod schemas validate all incoming request bodies
- Middleware wraps zod parse and throws 400 `AppError` on failure
- Schemas are the single source of truth for field types and constraints

### 5.5 Idempotency

- Optional `Idempotency-Key` header on POST/PUT endpoints
- Simple implementation: store key + response in an `idempotency_keys` table, return cached response on duplicate

### 5.6 Authentication

- All API endpoints require a valid API key via `Authorization: Bearer <key>` header
- The API key is configured via `API_KEY` environment variable
- Middleware rejects requests with 401 if the key is missing or invalid
- No public/unauthenticated endpoints except a `GET /health` check

### 5.7 Soft delete and cleanup

- All business entities have a `deleted_at` TEXT column (nullable)
- DELETE endpoints set `deleted_at = now()` instead of removing the row
- All list queries filter out records where `deleted_at IS NOT NULL` by default
- A background cleanup job (or CLI command `wrobo biz cleanup`) hard-deletes records where `deleted_at` is older than 30 days (configurable via `CLEANUP_RETENTION_DAYS` env var)

---

## Phase 6: Tests

### 6.1 Test strategy

- Use Vitest with an in-memory SQLite database (with sqlite-vec loaded)
- Each test file gets a fresh database with Drizzle migrations applied
- Focus on service-level tests first (business logic), then route-level integration tests

### 6.2 Priority test cases

1. **Company card:** upsert, retrieve, verify default project auto-creation
2. **Contacts:** create company, create nested person under company, list with filters, resolve (match existing vs auto-create)
3. **Expenses:** create with valid supplier, reject invalid supplier reference, status transitions (recorded -> paid, recorded -> void)
4. **Deals:** create with line items, verify computed totals
5. **Sales invoices:** generate from deal + contact + company card, verify line items and totals are pulled correctly, verify sequential invoice numbering, status transitions
6. **Tasks:** create project, create task, create subtask, status transitions
7. **Slug IDs:** uniqueness within table, collision retry, lookup by slug
8. **Auth:** reject missing/invalid API key, accept valid key
9. **Soft delete:** verify deleted records excluded from lists, verify GET-by-id returns 404 for deleted records
10. **Embeddings:** text builder produces expected content per entity type, upsert stores to vec table, nearest-neighbor returns correct matches

---

## Implementation Order

The recommended order minimizes blocked dependencies:

| Step | What | Depends on |
|------|------|------------|
| 1 | Project bootstrap (Phase 1) | nothing |
| 2 | Drizzle schema + sqlite-vec connection + initial migration (Phase 2) | Step 1 |
| 3 | Shared infra: IDs, slug IDs, errors, money, auth, validation middleware (Phase 5) | Step 1 |
| 4 | Company card service + route + test | Steps 2-3 |
| 5 | Contacts service + route + test (incl. nesting) | Steps 2-3 |
| 6 | Documents service + route (upload/download) | Steps 2-3 |
| 7 | Expenses service + route + test | Steps 5-6 |
| 8 | Deals service + route + test | Step 5 |
| 9 | Sales invoices service + route + test | Steps 4, 5, 8 |
| 10 | Projects + Tasks service + route + test | Steps 2-3 |
| 11 | Embedding scaffolding: helpers, vec table, CLI sync command (Phase 2.3) | Steps 2, 4-5, 8, 10 |
| 12 | CLI scaffolding (Phase 4) | Steps 4-11 |
| 13 | Docker setup | Step 1 |

Steps 4-6 can run in parallel. Steps 7-8 can run in parallel. Step 11 can begin once the core services it embeds are in place. Steps 12 and 13 can start as soon as the API routes are ready.

---

## Deliverables Checklist

- [ ] Express.js app boots and responds to health check
- [ ] API key authentication enforced on all endpoints
- [ ] Drizzle schema defined for all MVP tables
- [ ] SQLite database created with all tables via Drizzle migration on startup
- [ ] sqlite-vec extension loaded and vec_embeddings virtual table created
- [ ] Slug ID generator working with collision handling
- [ ] All entities addressable by internal ID or slug
- [ ] Company card GET/PUT working
- [ ] Default "Tasks" project auto-created on first company card insert
- [ ] Contacts CRUD + resolve working, with person nesting under companies
- [ ] Document upload and download working
- [ ] Expense creation, retrieval, and status transitions (recorded/paid/void) working
- [ ] Deal creation with computed totals working
- [ ] Sales invoice generation from deal + contact + company card working
- [ ] Sequential invoice numbering ({YEAR}-{SEQ}) working
- [ ] Sales invoice status transitions (draft/finalized/paid/cancelled) working
- [ ] Projects and tasks CRUD working
- [ ] Subtask nesting working
- [ ] Soft delete on all entities, excluded from list queries
- [ ] Embedding scaffolding: text builder, upsert, nearest-neighbor query helpers
- [ ] `wrobo biz embeddings sync` CLI command (with stubbed/configurable provider)
- [ ] CLI `wrobo biz` subcommands calling the API (shell delegates to Node.js)
- [ ] Vitest suite passing for all services
- [ ] Docker compose running the API
