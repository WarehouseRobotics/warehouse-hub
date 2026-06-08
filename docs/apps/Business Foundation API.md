---
type: core-spec
description: Describes the core of the Business API stack - foundational business management infrastructure for the Warehouse Hub
project_dir: business-api
frozen: false
see_also:
  - docs/architecture/Business API Architecture.md
  - docs/apps/business-api/cli.md
  - docs/apps/business-api/services.md
  - docs/apps/business-api/bookings.md
  - docs/apps/business-api/banking.md
  - docs/tax-reports.md
  - docs/mcp/Business API MCP.md
---

# Warehouse Hub Business API Stack

The Business API stack is designed to be used as an underlying infrastructure tool for business management and CRM AI agents of the Warehouse Hub platform. Humans can interact with it via a webapp GUI too, but the API, MCP and CLI parts are designed with agent tool usage in mind.

The Business API stacks allows our AI agents to query and manage various business data objects to provide assistance for CRM, marketing, accounting and other tasks to business owners.

## Core Objects

Items below tagged _(planned)_ are part of the intended object model but are **not** implemented in `business-api` yet. Everything else has a backing table and service. For the authoritative list of implemented tables and services, see [services.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/services.md).

* Base Infrastructure
    * entities — implemented as a `contacts` registry plus a singleton owned `company_card`; there is no unified `entity` table
        * person (users, employees, contacts, etc) — `contacts` with `type: person`
        * company (clients, suppliers, etc) — `contacts` with `type: company`; the owned company is the separate `company_card`
        * entity tags — implemented as contact `roles`: `owned`, `contact`, `customer`, `supplier`, `employee`, `both`
    * projects (belong to entities)
    * task and subtask tickets (for basic task management)
    * document
* Accounting
    * documents (typed by `kind`, e.g. `expense_invoice`, `sales_invoice`, `payroll`, `bank_csv`, `tax_declaration`)
        * contract / agreement _(planned)_
        * invoice
        * expense/bill
        * payroll slip
        * payment _(planned as a first-class object; payment evidence today lives in bank transactions and tax-report payment links)_
    * sub-document objects
        * taxes — stored as `taxLines` on expenses/invoices, not a standalone table
        * fees _(planned)_
        * discounts _(planned)_
    * tax period — implemented more broadly as the tax-reports lifecycle (reports, facts, carryforwards, payment links); see [tax-reports.md](/Users/denis/src/warehouse-hub/docs/tax-reports.md)
    * audit event — implemented as `audit_log`
    * bank accounts, transactions, balance snapshots, and transaction matches — implemented; see [banking.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/banking.md)
* CRM
    * products and services (basic inventory nomenclature/pricelist) _(planned)_
    * contact (from base infra)
    * prospective lead (company + persons + lead info) _(planned)_
    * customer (like a project group for tracking sales per customer) _(planned as a dedicated object; today modeled via contacts + deals + projects)_
        * notes/comments — implemented as `comments` attachable to objects
        * booking / appointment — implemented; see [bookings.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/bookings.md)
        * invoice
        * sale (like a project per one particular sale) _(planned; deals cover the commercial record today)_
        * subscription (for recurring sales) _(planned)_
        * task/subtasks (from base infra)
        * contracts/deals — `deals` implemented; standalone contract objects _(planned)_
    * interactions with leads and customers _(planned)_
        * email/call _(planned)_
        * meeting (as meeting notes) _(planned)_


Some objects are used across domains (invoices, legal entities etc.), some objects can be related inside and between domains, e.g. invoices are related to companies and persons and sales, contacts and documents are related to prospective leads and so on.

The owning tenant is either a user + company or a user (sole trader) entity.

## Core Stack

The accounting stack is this:

* API (Express.js); an MCP server is _(planned)_ — see [Business API MCP.md](/Users/denis/src/warehouse-hub/docs/mcp/Business API MCP.md)
* CLI tool (`wrobo-biz`, an HTTP API wrapper) to be used by internal agents — see [cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md)
* UI client for the API (for basic accounting tasks)

For the first implementation pass, the API should optimize for deterministic CRUD-style business operations that AI agents can call safely and repeatedly. The API and CLI examples below assume a REST base path of `/api/v1` and JSON responses with stable IDs.

### Accounting Features (MVP)

* sales invoicing + expense capture
* imported payroll tracking
* VAT-ready bookkeeping
* country-specific compliance rails
* human accountant handoff
* empowers our AI accounting agent

## Base Infrastructure Stack

For MVP we should keep the base infrastructure intentionally small:

* one owned company card per workspace/user account
* a shared contacts registry for people and companies
* documents stored once and linked from expenses, payrolls, and sales invoices
* audit-friendly status fields instead of implicit state

## Tasks

Tasks help agents (and internal human users) organize, plan and structure the work. Tasks can be one of the main channels of collaboration between AI agents and internal human users.

* tasks are associated with projects and projects are linked to companies. 
* internal tasks are tasks for projects that belong to the owner entity (company or sole trader)
* tasks can be nested, but one level depth only, for simplicity: tasks with a parent task cannot have child tasks

## Documents

The most common example of a special document type is an invoice (expense or sale).

For MVP, documents should support:

* binary file upload and retrieval
* metadata extraction status
* links to an owning business object such as `expense`, `payroll`, or `sales_invoice`
* original filename, MIME type, checksum and upload timestamp


## CRM Stack

The CRM MVP should cover:

* contacts registry for customers and suppliers
* optional person records under a company contact
* basic bookings for scheduled small-business work
* basic deals/sales records
* invoice generation from company card + contact + deal data

Contact roles (the `roles` array enum):

* `customer`
* `supplier`
* `employee`
* `both`
* `owned`
* `contact`

## Bookings Subset

Bookings should be modeled as scheduled service commitments between the owned business and customer contacts. In the platform object model, bookings sit between CRM, operational work, and billing:

* CRM context: who the booking is for and what was agreed
* operational context: when and where the work should happen
* workflow context: what task, project, deal, or invoice it is related to

This plays well with the existing business context approach because `booking` is another stable business object that links existing primitives together instead of introducing a parallel scheduling domain.

For MVP, the intended split is:

* `booking` for the scheduled customer-facing commitment
* `booking_assignment_profile` for default employee booking availability
* `booking_availability_exception` for one-off overrides such as time off or blocked windows

High-level rules:

* bookings must remain operational records, not accounting records
* deals remain the source of commercial scope and pricing
* tasks remain the place for execution detail
* sales invoices remain the billing and tax source of truth
* employee availability should stay simple and rule-based for the first pass

MVP scope should include:

* booking CRUD and rescheduling flows
* employee assignment validation against availability configuration
* optional links from bookings to `project`, `deal`, `task`, and `sales_invoice`
* agent-friendly date-range agenda queries

Implemented v1 also includes booking completion/cancellation audit fields, booking comments and embeddings, direct assignment conflict inspection, and CLI commands for bookings, assignment profiles, and availability exceptions. MCP tools remain future-facing and are not implemented in `business-api` yet.

Detailed booking specs, API examples, availability rules, MCP tools, and CLI examples live in [docs/apps/business-api/bookings.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/bookings.md).

### Accounting API

The examples below are intended as spec material, not final locked schemas. They show a practical first iteration that is easy to expose via REST, MCP and CLI.

#### 1. Company card

Store and retrieve the owned company profile used for outgoing invoices.

`PUT /api/v1/company-card`

```json
{
  "legalName": "Northwind Robotics SL",
  "displayName": "Northwind Robotics",
  "taxId": "B12345678",
  "email": "billing@example.com",
  "phone": "+34 123 456 789",
  "website": "https://northwind.example",
  "address": {
    "street1": "Calle de Alcala 42",
    "city": "Madrid",
    "postalCode": "28014",
    "countryCode": "ES"
  },
  "invoiceDefaults": {
    "currency": "EUR",
    "paymentTermsDays": 30,
    "vatMode": "standard"
  },
  "bankDetails": {
    "ibanMasked": "ES76***********1234",
    "bic": "BBVAESMM"
  }
}
```

Example response:

```json
{
  "companyId": "comp_owned_001",
  "legalName": "Northwind Robotics SL",
  "displayName": "Northwind Robotics",
  "taxId": "B12345678",
  "address": {
    "street1": "Calle de Alcala 42",
    "city": "Madrid",
    "postalCode": "28014",
    "countryCode": "ES"
  },
  "invoiceDefaults": {
    "currency": "EUR",
    "paymentTermsDays": 30,
    "vatMode": "standard"
  },
  "updatedAt": "2026-03-31T09:15:22Z"
}
```

`GET /api/v1/company-card`

Use case: fetch defaults before generating a sales invoice.

#### 2. Contacts registry

Create or list customers and suppliers in one shared registry.

`POST /api/v1/contacts`

```json
{
  "type": "company",
  "roles": ["customer"],
  "displayName": "Acme Retail GmbH",
  "legalName": "Acme Retail GmbH",
  "taxId": "DE123456789",
  "email": "ap@example.com",
  "phone": "+49 30 555 010",
  "billingAddress": {
    "street1": "Unter den Linden 10",
    "city": "Berlin",
    "postalCode": "10117",
    "countryCode": "DE"
  },
  "notes": "Prefers invoices by email."
}
```

Example response:

```json
{
  "contactId": "ct_000245",
  "type": "company",
  "roles": ["customer"],
  "displayName": "Acme Retail GmbH",
  "status": "active",
  "createdAt": "2026-03-31T09:30:00Z"
}
```

`GET /api/v1/contacts?role=supplier&query=paper`

Use case: agent searches for an existing supplier before creating a new one.

Automatic creation for agent workflows:

`POST /api/v1/contacts/resolve`

```json
{
  "autoCreate": true,
  "matchBy": ["taxId", "email", "legalName"],
  "contact": {
    "type": "company",
    "roles": ["supplier"],
    "displayName": "Papeleria Centro SL",
    "taxId": "B87654321",
    "email": "facturas@papeleriacentro.example"
  }
}
```

Example response when created on demand:

```json
{
  "contactId": "ct_000301",
  "resolution": "created",
  "matchedBy": null
}
```

#### 3. Expense registry with document vault

Register an incoming supplier bill and store the source invoice file.

Step 1: upload the document.

`POST /api/v1/documents`

Multipart form fields:

* `file`: `invoice-2026-0042.pdf`
* `kind`: `expense_invoice`
* `source`: `email_forward`

Example response:

```json
{
  "documentId": "doc_000881",
  "kind": "expense_invoice",
  "filename": "invoice-2026-0042.pdf",
  "mimeType": "application/pdf",
  "storageStatus": "stored",
  "ocrStatus": "pending"
}
```

Step 2: create the expense record linked to the document and supplier.

`POST /api/v1/expenses`

```json
{
  "supplierContactId": "ct_000301",
  "documentId": "doc_000881",
  "invoiceNumber": "FC-2026-0042",
  "invoiceDate": "2026-03-25",
  "dueDate": "2026-04-24",
  "currency": "EUR",
  "totals": {
    "net": "120.00",
    "tax": "25.20",
    "gross": "145.20"
  },
  "taxLines": [
    {
      "name": "IVA",
      "rate": "21.00",
      "base": "120.00",
      "amount": "25.20"
    }
  ],
  "category": "office_supplies",
  "notes": "Printer paper and toner."
}
```

Example response:

```json
{
  "expenseId": "exp_000118",
  "status": "recorded",
  "supplierContactId": "ct_000301",
  "documentId": "doc_000881",
  "bookedAt": "2026-03-31T09:42:14Z"
}
```

`GET /api/v1/expenses/exp_000118`

Use case: retrieve the structured expense record later.

`GET /api/v1/documents/doc_000881/download`

Use case: retrieve the original invoice PDF later.

#### 4. Payroll registry with imported payroll slips

Payrolls are imported accounting records, not generated payroll calculations.

The source of truth is the payroll slip document received from an accountant or payroll provider. The system extracts a small normalized payroll record and keeps the original document linked for later review.

`POST /api/v1/documents/ingest`

Multipart form fields:

* `file`: `test_nomina.pdf`
* `kind`: `payroll`
* `source`: `accountant_upload`

Example extracted payroll shape:

```json
{
  "linkedEntity": {
    "type": "payroll",
    "data": {
      "payrollId": "pay_000041",
      "employeeContactId": "ct_000411",
      "documentId": "doc_000990",
      "payrollNumber": "NOM-2026-03-01",
      "countryCode": "ES",
      "periodStart": "2026-03-01",
      "periodEnd": "2026-03-31",
      "paymentDate": "2026-03-31",
      "currency": "EUR",
      "grossSalary": "3000.00",
      "netSalary": "2310.00",
      "employeeTaxWithheld": "345.00",
      "employeeSocialContributions": "210.00",
      "employerSocialContributions": "690.00",
      "otherDeductions": "135.00",
      "otherEarnings": "0.00",
      "status": "recorded"
    }
  }
}
```

Minimal payroll notes:

* payroll contact base entity = `person` contact with role `employee`
* payroll status tracks payment state of the payroll event
* payroll slips may contain country-specific lines; normalized totals stay small and raw lines preserve detail
* duplicate imports update the existing payroll and replace the linked document instead of creating a revision chain

Standalone payroll CRUD is also available:

* `POST /api/v1/payrolls`
* `GET /api/v1/payrolls`
* `GET /api/v1/payrolls/pay_000041`
* `PATCH /api/v1/payrolls/pay_000041`

Use case: retrieve the structured payroll record later without reparsing the document.

#### 5. Sales registry and deals

Record a deal before invoice issuance.

`POST /api/v1/deals`

```json
{
  "customerContactId": "ct_000245",
  "title": "Warehouse audit and automation proposal",
  "stage": "won",
  "currency": "EUR",
  "expectedCloseDate": "2026-04-02",
  "lineItems": [
    {
      "description": "Warehouse operations audit",
      "quantity": "1",
      "unitPrice": "900.00",
      "taxRate": "21.00"
    },
    {
      "description": "Automation recommendations workshop",
      "quantity": "1",
      "unitPrice": "600.00",
      "taxRate": "21.00"
    }
  ],
  "notes": "Approved by procurement on email thread 2026-03-29."
}
```

Example response:

```json
{
  "dealId": "deal_000072",
  "customerContactId": "ct_000245",
  "stage": "won",
  "totals": {
    "net": "1500.00",
    "tax": "315.00",
    "gross": "1815.00"
  }
}
```

`GET /api/v1/deals?stage=won&customerContactId=ct_000245`

Use case: list completed sales for a customer.

#### 6. Sales invoice tracking and generation

Generate a draft sales invoice using company card + customer contact + deal data. In this version of the spec, invoice generation is represented as a normal create operation on `sales-invoices`, with the payload referencing the source deal and invoice options.

`POST /api/v1/sales-invoices`

```json
{
  "customerContactId": "ct_000245",
  "dealId": "deal_000072",
  "issueDate": "2026-04-02",
  "serviceDate": "2026-03-31",
  "paymentTermsDays": 30,
  "invoiceNumberStrategy": "next"
}
```

Example response:

```json
{
  "salesInvoiceId": "sinv_000041",
  "invoiceNumber": "2026-0041",
  "status": "draft",
  "sellerCompanyId": "comp_owned_001",
  "customerContactId": "ct_000245",
  "dealId": "deal_000072",
  "totals": {
    "net": "1500.00",
    "tax": "315.00",
    "gross": "1815.00"
  },
  "pdfDocumentId": null
}
```

The PDF is rendered asynchronously; `pdfDocumentId` is populated once the document exists.

_(planned)_ A dedicated send action with delivery options:

`POST /api/v1/sales-invoices/sinv_000041/send`

```json
{
  "channel": "email",
  "to": ["ap@acme-retail.example"]
}
```

This endpoint is **not implemented yet**. Today, lifecycle transitions (`draft` → `sent`/`finalized`/`overdue`/`paid`/`cancelled`) are made by patching the invoice:

`PATCH /api/v1/sales-invoices/sinv_000041`

```json
{
  "status": "sent"
}
```

Retrieve the invoice later:

* `GET /api/v1/sales-invoices/sinv_000041`
* The rendered invoice PDF is referenced by `pdfDocumentId` and downloaded via the documents endpoint — `GET /api/v1/documents/{pdfDocumentId}/download`. There is no dedicated `/sales-invoices/:id/pdf` route; the `wrobo-biz sales-invoices pdf <id> <out>` CLI command performs the fetch-then-download in two calls (see [cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md)).


### Accounting MCP _(planned)_

> **Status:** The MCP server is not implemented in `business-api` yet. The tools below are a design sketch of how the same operations would be exposed to agents with safer structured inputs. Until it lands, agents drive the API through the `wrobo-biz` CLI ([cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md)) or direct HTTP. See [Business API MCP.md](/Users/denis/src/warehouse-hub/docs/mcp/Business API MCP.md) for the MCP plan.

Suggested tool examples:

* `business.get_company_card`
* `business.upsert_company_card`
* `business.list_contacts`
* `business.resolve_contact`
* `business.create_expense`
* `business.get_expense`
* `business.create_payroll`
* `business.get_payroll`
* `business.create_deal`
* `business.generate_sales_invoice`
* `business.get_sales_invoice`
* `business.download_document`


### Accounting CLI

The CLI is a single binary, `wrobo-biz`, with noun-first subcommands (`wrobo-biz <scope> <verb>`). It is an HTTP wrapper around the API and is the agent-facing entry point. Create/update commands are **JSON-payload-first** — the object is passed as a single JSON argument rather than as individual flags — while `list`/filter subcommands take `--` flags. Inside the repo container the same surface is reachable as `./container.sh exec npm run cli -- <scope> <verb>`.

The examples below are an orientation only. The authoritative, full CLI reference — every scope, all filter flags, the `wrobo-biz` HTTP wrapper, auth, and remote configuration — lives in [cli.md](/Users/denis/src/warehouse-hub/docs/apps/business-api/cli.md).

#### Company card

```bash
wrobo-biz company-card set '{
  "legalName": "Northwind Robotics SL",
  "displayName": "Northwind Robotics",
  "taxId": "B12345678",
  "address": { "street1": "Calle de Alcala 42", "city": "Madrid", "postalCode": "28014", "countryCode": "ES" },
  "invoiceDefaults": { "currency": "EUR", "paymentTermsDays": 30, "vatMode": "standard" }
}'

wrobo-biz company-card get
```

#### Contacts

```bash
wrobo-biz contacts create '{
  "type": "company",
  "status": "active",
  "roles": ["customer"],
  "displayName": "Acme Retail GmbH",
  "legalName": "Acme Retail GmbH",
  "taxId": "DE123456789",
  "email": "ap@acme-retail.example"
}'

wrobo-biz contacts resolve '{
  "autoCreate": true,
  "matchBy": ["taxId", "email", "canonicalName"],
  "contact": { "type": "company", "roles": ["supplier"], "displayName": "Papeleria Centro SL", "taxId": "B87654321" }
}'

wrobo-biz contacts list --role supplier --query paper
```

#### Expenses and documents

```bash
wrobo-biz documents upload ./samples/invoices/invoice-2026-0042.pdf '{ "kind": "expense_invoice", "source": "email_forward" }'

wrobo-biz expenses create '{
  "supplierContactId": "ct_000301",
  "documentId": "doc_000881",
  "invoiceNumber": "FC-2026-0042",
  "invoiceDate": "2026-03-25",
  "dueDate": "2026-04-24",
  "currency": "EUR",
  "totals": { "net": "120.00", "tax": "25.20", "gross": "145.20" },
  "category": "office_supplies",
  "notes": "Printer paper and toner."
}'

wrobo-biz expenses get exp_000118
wrobo-biz documents download doc_000881 ./tmp/expense-invoice.pdf
```

#### Payrolls

```bash
wrobo-biz documents ingest ./data/tmp/test_nomina.pdf '{ "kind": "payroll", "source": "accountant_upload" }'

wrobo-biz payrolls get pay_000041
```

Payroll notes:

* v1 payrolls are imported from slips, not generated from contract rules
* dedupe identity is employee + period + payroll number, with payment date as fallback
* duplicate import replaces the linked document and updates the payroll in place

#### Deals and sales invoices

```bash
wrobo-biz deals create '{
  "customerContactId": "ct_000245",
  "title": "Warehouse audit and automation proposal",
  "stage": "won",
  "currency": "EUR",
  "expectedCloseDate": "2026-04-02",
  "lineItems": [
    { "description": "Warehouse operations audit", "quantity": "1", "unitPrice": "900.00", "taxRate": "21.00" },
    { "description": "Automation recommendations workshop", "quantity": "1", "unitPrice": "600.00", "taxRate": "21.00" }
  ]
}'

wrobo-biz sales-invoices generate '{
  "customerContactId": "ct_000245",
  "dealId": "deal_000072",
  "issueDate": "2026-04-02",
  "serviceDate": "2026-03-31",
  "paymentTermsDays": 30
}'

# Lifecycle transitions are PATCH-based; there is no `sales-invoices send` command (the send route is planned).
wrobo-biz sales-invoices update sinv_000041 '{ "status": "sent" }'

wrobo-biz sales-invoices get sinv_000041
# Wrapper-only: fetches the invoice, then downloads the referenced pdfDocumentId document.
wrobo-biz sales-invoices pdf sinv_000041 ./tmp/sales-invoice-2026-0041.pdf
```

#### CLI behavior

* output is JSON on stdout; errors render as a Markdown block on stderr (or `--json` for a `{"error": {...}}` envelope)
* commands never require interactive prompts — required fields come from the JSON payload or flags
* stable exit codes: `0` success, `1` HTTP/network failure, `2` argument-shape / configuration / host-only failure
* host-only commands (`serve`, `db *`) are rejected by the `wrobo-biz` HTTP wrapper

> Not yet implemented: a `--idempotency-key` for safe agent retries on mutating commands. Treat retries as non-idempotent for now.
