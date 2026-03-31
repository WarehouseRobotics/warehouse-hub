---
type: iteration-plan
date: 2026-03-29
goal: Scaffold the Express.js project and implement basic CRUD logic for the MVP feature set.
notes: Covers copmany card, contacts registry, expense and sales registries and some basic task management with API and CLI tools.
workpaths: business-api/*; docs/*
frozen: false
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
- `.env.example` with `PORT`, `DATABASE_PATH`, `UPLOAD_DIR`

### 1.2 Dependencies

**Runtime:**
- `express` + `@types/express`
- `better-sqlite3` + `@types/better-sqlite3`
- `zod` for request/response validation
- `multer` for file uploads
- `nanoid` for ID generation (prefixed IDs like `ct_`, `exp_`, `deal_`, etc.)
- `dotenv`

**Dev:**
- `typescript`, `tsx` (for dev server)
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
    db/
      connection.ts       # SQLite connection singleton
      migrate.ts          # migration runner
      migrations/         # SQL migration files (ordered)
    lib/
      ids.ts              # prefixed nanoid generators
      errors.ts           # AppError class + error handler middleware
      money.ts            # string-based money helpers
    routes/
      company-card.ts
      contacts.ts
      documents.ts
      expenses.ts
      deals.ts
      sales-invoices.ts
      tasks.ts
    schemas/              # zod schemas per resource
      company-card.ts
      contact.ts
      document.ts
      expense.ts
      deal.ts
      sales-invoice.ts
      task.ts
    services/             # business logic per resource
      company-card.ts
      contacts.ts
      documents.ts
      expenses.ts
      deals.ts
      sales-invoices.ts
      tasks.ts
  test/
    setup.ts              # in-memory SQLite for tests
    ...                   # mirrors src/ structure
  uploads/                # gitignored, local file storage
```

---

## Phase 2: Database Schema

A single migration file creates all MVP tables. We use `TEXT` for money columns and prefixed string IDs.

### 2.1 Tables

**company_card** (singleton row)
- `id` TEXT PK
- `legal_name`, `display_name`, `tax_id`, `email`, `phone`, `website`
- `address_street1`, `address_street2`, `address_city`, `address_postal_code`, `address_country_code`
- `currency`, `payment_terms_days`, `vat_mode`
- `bank_iban_masked`, `bank_bic`
- `created_at`, `updated_at`

**contacts**
- `id` TEXT PK (prefix `ct_`)
- `type` TEXT (`person` | `company`)
- `roles` TEXT (JSON array, e.g. `["customer"]`)
- `display_name`, `legal_name`, `tax_id`, `email`, `phone`
- `billing_address_street1`, `billing_address_city`, `billing_address_postal_code`, `billing_address_country_code`
- `notes` TEXT
- `status` TEXT DEFAULT `active`
- `created_at`, `updated_at`

**documents**
- `id` TEXT PK (prefix `doc_`)
- `kind` TEXT (`expense_invoice`, `sales_invoice_pdf`, `contract`, `other`)
- `source` TEXT
- `original_filename`, `mime_type`, `file_path`, `checksum`
- `storage_status` TEXT DEFAULT `stored`
- `ocr_status` TEXT DEFAULT `pending`
- `created_at`

**expenses**
- `id` TEXT PK (prefix `exp_`)
- `supplier_contact_id` TEXT FK -> contacts
- `document_id` TEXT FK -> documents (nullable)
- `invoice_number`, `invoice_date`, `due_date`
- `currency`
- `net`, `tax`, `gross` (all TEXT)
- `tax_lines` TEXT (JSON)
- `category`, `notes`
- `status` TEXT DEFAULT `recorded`
- `created_at`, `updated_at`

**deals**
- `id` TEXT PK (prefix `deal_`)
- `customer_contact_id` TEXT FK -> contacts
- `title`, `stage` TEXT
- `currency`
- `expected_close_date`
- `line_items` TEXT (JSON array)
- `net`, `tax`, `gross` (all TEXT, computed on create)
- `notes`
- `created_at`, `updated_at`

**sales_invoices**
- `id` TEXT PK (prefix `sinv_`)
- `invoice_number` TEXT UNIQUE
- `seller_company_id` TEXT FK -> company_card
- `customer_contact_id` TEXT FK -> contacts
- `deal_id` TEXT FK -> deals (nullable)
- `issue_date`, `service_date`, `due_date`
- `currency`, `payment_terms_days`
- `line_items` TEXT (JSON)
- `net`, `tax`, `gross` (all TEXT)
- `status` TEXT DEFAULT `draft` (`draft` | `sent` | `paid` | `cancelled`)
- `sent_at`, `pdf_document_id` TEXT FK -> documents (nullable)
- `created_at`, `updated_at`

**invoice_number_seq** (counter table for sequential invoice numbers)
- `year` INTEGER PK
- `last_number` INTEGER

**projects**
- `id` TEXT PK (prefix `proj_`)
- `owner_contact_id` TEXT FK -> contacts (nullable, for customer projects)
- `name`, `description`
- `status` TEXT DEFAULT `active`
- `created_at`, `updated_at`

**tasks**
- `id` TEXT PK (prefix `task_`)
- `project_id` TEXT FK -> projects
- `parent_task_id` TEXT FK -> tasks (nullable, for subtasks)
- `title`, `description`
- `status` TEXT DEFAULT `open` (`open` | `in_progress` | `done` | `cancelled`)
- `priority` TEXT DEFAULT `medium`
- `due_date` TEXT (nullable)
- `created_at`, `updated_at`

---

## Phase 3: API Routes and Services

Each resource gets a route file, a zod schema file, and a service file. Services talk to SQLite directly via `better-sqlite3` prepared statements.

### 3.1 Company Card

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| GET | `/api/v1/company-card` | `getCompanyCard()` | Returns the singleton row or 404 |
| PUT | `/api/v1/company-card` | `upsertCompanyCard(data)` | Insert or update |

### 3.2 Contacts

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/contacts` | `createContact(data)` | |
| GET | `/api/v1/contacts` | `listContacts(filters)` | `?role=`, `?query=`, `?type=` |
| GET | `/api/v1/contacts/:id` | `getContact(id)` | |
| PATCH | `/api/v1/contacts/:id` | `updateContact(id, data)` | |
| POST | `/api/v1/contacts/resolve` | `resolveContact(data)` | Match by taxId/email/legalName, optionally auto-create |

### 3.3 Documents

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/documents` | `uploadDocument(file, meta)` | Multipart via multer |
| GET | `/api/v1/documents/:id` | `getDocumentMeta(id)` | Metadata only |
| GET | `/api/v1/documents/:id/download` | `downloadDocument(id)` | Stream the file |

### 3.4 Expenses

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/expenses` | `createExpense(data)` | Validates supplier contact and document exist |
| GET | `/api/v1/expenses` | `listExpenses(filters)` | `?supplierContactId=`, `?category=`, `?status=` |
| GET | `/api/v1/expenses/:id` | `getExpense(id)` | |

### 3.5 Deals

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/deals` | `createDeal(data)` | Computes totals from line items |
| GET | `/api/v1/deals` | `listDeals(filters)` | `?stage=`, `?customerContactId=` |
| GET | `/api/v1/deals/:id` | `getDeal(id)` | |
| PATCH | `/api/v1/deals/:id` | `updateDeal(id, data)` | Stage transitions, line item edits |

### 3.6 Sales Invoices

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/sales-invoices` | `generateSalesInvoice(data)` | Pulls company card + contact + deal, assigns next invoice number |
| GET | `/api/v1/sales-invoices` | `listSalesInvoices(filters)` | `?status=`, `?customerContactId=` |
| GET | `/api/v1/sales-invoices/:id` | `getSalesInvoice(id)` | |
| POST | `/api/v1/sales-invoices/:id/send` | `markSalesInvoiceSent(id, data)` | Updates status to `sent` |

### 3.7 Tasks

| Method | Path | Service function | Notes |
|--------|------|------------------|-------|
| POST | `/api/v1/projects` | `createProject(data)` | |
| GET | `/api/v1/projects` | `listProjects(filters)` | |
| GET | `/api/v1/projects/:id` | `getProject(id)` | Includes task summary counts |
| POST | `/api/v1/tasks` | `createTask(data)` | Supports `parentTaskId` for subtasks |
| GET | `/api/v1/tasks` | `listTasks(filters)` | `?projectId=`, `?status=`, `?parentTaskId=` |
| GET | `/api/v1/tasks/:id` | `getTask(id)` | Includes subtasks |
| PATCH | `/api/v1/tasks/:id` | `updateTask(id, data)` | Status transitions, reassignment |

---

## Phase 4: CLI Scaffolding

Extend the existing `wrobo` CLI with `biz` subcommands. Each command calls the REST API using `fetch`.

### 4.1 CLI structure

```
cli/
  src/
    biz/
      index.ts            # subcommand router
      client.ts           # HTTP client wrapper (base URL from env/flag)
      commands/
        company-card.ts
        contacts.ts
        documents.ts
        expenses.ts
        deals.ts
        sales-invoices.ts
        tasks.ts
      format.ts           # human-readable vs --json output
```

### 4.2 Priority commands for this iteration

Focus on the commands that the accounting agent needs most:

```
wrobo biz company-card get|set
wrobo biz contacts create|list|resolve
wrobo biz expenses create|get|list
wrobo biz deals create|get|list
wrobo biz sales-invoices generate|get|list|send
wrobo biz documents upload|get|download
wrobo biz projects create|list|get
wrobo biz tasks create|list|get|update
```

All commands support `--json` for agent consumption and return stable exit codes (0 = success, 1 = not found, 2 = validation error, 3 = conflict).

---

## Phase 5: Shared Infrastructure and Cross-Cutting Concerns

### 5.1 Error handling

- `AppError` class with `statusCode`, `code` (machine-readable), `message`
- Express error handler middleware returns JSON `{ error: { code, message } }`
- Consistent across all routes

### 5.2 ID generation

- Prefixed nanoid: `ct_`, `doc_`, `exp_`, `deal_`, `sinv_`, `proj_`, `task_`
- 12-char random suffix (e.g. `ct_a1b2c3d4e5f6`)

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

---

## Phase 6: Tests

### 6.1 Test strategy

- Use Vitest with an in-memory SQLite database
- Each test file gets a fresh database with migrations applied
- Focus on service-level tests first (business logic), then route-level integration tests

### 6.2 Priority test cases

1. **Company card:** upsert and retrieve
2. **Contacts:** create, list with filters, resolve (match existing vs auto-create)
3. **Expenses:** create with valid supplier, reject invalid supplier reference
4. **Deals:** create with line items, verify computed totals
5. **Sales invoices:** generate from deal + contact + company card, verify line items and totals are pulled correctly, verify sequential invoice numbering
6. **Tasks:** create project, create task, create subtask, status transitions

---

## Implementation Order

The recommended order minimizes blocked dependencies:

| Step | What | Depends on |
|------|------|------------|
| 1 | Project bootstrap (Phase 1) | nothing |
| 2 | Database schema + migration runner (Phase 2) | Step 1 |
| 3 | Shared infra: IDs, errors, money, validation middleware (Phase 5) | Step 1 |
| 4 | Company card service + route + test | Steps 2-3 |
| 5 | Contacts service + route + test | Steps 2-3 |
| 6 | Documents service + route (upload/download) | Steps 2-3 |
| 7 | Expenses service + route + test | Steps 5-6 |
| 8 | Deals service + route + test | Step 5 |
| 9 | Sales invoices service + route + test | Steps 4, 5, 8 |
| 10 | Projects + Tasks service + route + test | Steps 2-3 |
| 11 | CLI scaffolding (Phase 4) | Steps 4-10 |
| 12 | Docker setup | Step 1 |

Steps 4-6 can run in parallel. Steps 7-8 can run in parallel. Step 11 and 12 can start as soon as the API routes are in place.

---

## Deliverables Checklist

- [ ] Express.js app boots and responds to health check
- [ ] SQLite database created with all MVP tables on startup
- [ ] Company card GET/PUT working
- [ ] Contacts CRUD + resolve working
- [ ] Document upload and download working
- [ ] Expense creation and retrieval working
- [ ] Deal creation with computed totals working
- [ ] Sales invoice generation from deal + contact + company card working
- [ ] Sequential invoice numbering working
- [ ] Projects and tasks CRUD working
- [ ] Subtask nesting working
- [ ] CLI `wrobo biz` subcommands calling the API
- [ ] Vitest suite passing for all services
- [ ] Docker compose running the API
