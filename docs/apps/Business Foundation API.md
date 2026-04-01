---
type: core-spec
description: Describes the core of the Business API stack - foundational business management infrastructure for the Warehouse Hub
project_dir: business-api
frozen: false
see_also:
  - docs/architecture/Business API Architecture.md
---

# Warehouse Hub Business API Stack

The Business API stack is designed to be used as an underlying infrastructure tool for business management and CRM AI agents of the Warehouse Hub platform. Humans can interact with it via a webapp GUI too, but the API, MCP and CLI parts are designed with agent tool usage in mind.

The Business API stacks allows our AI agents to query and manage various business data objects to provide assistance for CRM, marketing, accounting and other tasks to business owners.

## Core Objects

* Base Infrastructure
    * entities
        * person (users, employees, contacts, etc)
        * company (admin company or companies, clients, suppliers, etc)
        * entity tags: owned, contact, supplier, customer, etc.
    * projects (belong entities)
    * task and subtask tickets (for basic task management)
    * document
* Accounting
    * documents
        * contract / agreement
        * invoice
        * expense/bill
        * payment
    * sub-document objects
        * taxes
        * fees
        * discounts
    * tax period
    * audit event
* CRM
    * products and services (basic inventory nomenclature/pricelist)
    * contact (from base infra)
    * prospective lead (company + persons + lead info)
    * customer (like a project group for tracking sales per customer)
        * notes/comments
        * invoice
        * sale (like a project per one particular sale)
        * subscription (for recurring sales)
        * task/subtasks (from base infra)
        * contracts/deals
    * interactions with leads and customers
        * email/call
        * meeting (as meeting notes)


Some objects are used across domains (invoices, legal entities etc.), some objects can be related inside and between domains, e.g. invoices are related to companies and persons and sales, contacts and documents are related to prospective leads and so on.

The owning tenant is either a user + company or a user (sole trader) entity.

## Core Stack

The accounting stack is this:

* API (Express.js) and MCP server
* CLI tool (API and MCP wrapper) to be used by internal agents
* UI client for the API (for basic accounting tasks)

For the first implementation pass, the API should optimize for deterministic CRUD-style business operations that AI agents can call safely and repeatedly. The API and CLI examples below assume a REST base path of `/api/v1` and JSON responses with stable IDs.

### Accounting Features (MVP)

* sales invoicing + expense capture
* VAT-ready bookkeeping
* country-specific compliance rails
* human accountant handoff
* empowers our AI accounting agent

## Base Infrastructure Stack

For MVP we should keep the base infrastructure intentionally small:

* one owned company card per workspace/user account
* a shared contacts registry for people and companies
* documents stored once and linked from expenses and sales invoices
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
* links to an owning business object such as `expense` or `sales_invoice`
* original filename, MIME type, checksum and upload timestamp


## CRM Stack

The CRM MVP should cover:

* contacts registry for customers and suppliers
* optional person records under a company contact
* basic deals/sales records
* invoice generation from company card + contact + deal data

Example contact roles for MVP:

* `customer`
* `supplier`
* `both`

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

#### 4. Sales registry and deals

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

#### 5. Sales invoice tracking and generation

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
  "pdfStatus": "pending"
}
```

Finalize or mark as sent:

`POST /api/v1/sales-invoices/sinv_000041/send`

```json
{
  "channel": "email",
  "to": ["ap@acme-retail.example"]
}
```

Example response:

```json
{
  "salesInvoiceId": "sinv_000041",
  "status": "sent",
  "sentAt": "2026-04-02T08:10:00Z"
}
```

Retrieve the invoice later:

* `GET /api/v1/sales-invoices/sinv_000041`
* `GET /api/v1/sales-invoices/sinv_000041/pdf`


### Accounting MCP

MCP can expose the same operations with safer structured inputs for agents. Suggested tool examples:

* `business.get_company_card`
* `business.upsert_company_card`
* `business.list_contacts`
* `business.resolve_contact`
* `business.create_expense`
* `business.get_expense`
* `business.create_deal`
* `business.generate_sales_invoice`
* `business.get_sales_invoice`
* `business.download_document`


### Accounting CLI

Suggested CLI style: one top-level binary such as `wrobo biz`, with noun-first subcommands and JSON output available by default for agents.

#### Company card

```bash
wrobo biz company-card set \
  --legal-name "Northwind Robotics SL" \
  --display-name "Northwind Robotics" \
  --tax-id "B12345678" \
  --email "billing@northwind.example" \
  --phone "+34 910 000 111" \
  --country ES \
  --city Madrid \
  --postal-code 28014 \
  --street1 "Calle de Alcala 42" \
  --currency EUR \
  --payment-terms-days 30 \
  --json
```

```bash
wrobo biz company-card get --json
```

#### Contacts

```bash
wrobo biz contacts create company \
  --role customer \
  --display-name "Acme Retail GmbH" \
  --legal-name "Acme Retail GmbH" \
  --tax-id "DE123456789" \
  --email "ap@acme-retail.example" \
  --city Berlin \
  --country DE \
  --json
```

```bash
wrobo biz contacts resolve company \
  --role supplier \
  --display-name "Papeleria Centro SL" \
  --tax-id "B87654321" \
  --email "facturas@papeleriacentro.example" \
  --auto-create \
  --json
```

```bash
wrobo biz contacts list --role supplier --query paper --json
```

#### Expenses and documents

```bash
wrobo biz documents upload \
  --kind expense_invoice \
  --source email_forward \
  --file ./samples/invoices/invoice-2026-0042.pdf \
  --json
```

```bash
wrobo biz expenses create \
  --supplier-contact-id ct_000301 \
  --document-id doc_000881 \
  --invoice-number FC-2026-0042 \
  --invoice-date 2026-03-25 \
  --due-date 2026-04-24 \
  --currency EUR \
  --net 120.00 \
  --tax 25.20 \
  --gross 145.20 \
  --category office_supplies \
  --note "Printer paper and toner." \
  --json
```

```bash
wrobo biz expenses get exp_000118 --json
wrobo biz documents download doc_000881 --output ./tmp/expense-invoice.pdf
```

#### Deals and sales invoices

```bash
wrobo biz deals create \
  --customer-contact-id ct_000245 \
  --title "Warehouse audit and automation proposal" \
  --stage won \
  --currency EUR \
  --expected-close-date 2026-04-02 \
  --line-item "Warehouse operations audit|1|900.00|21.00" \
  --line-item "Automation recommendations workshop|1|600.00|21.00" \
  --json
```

```bash
wrobo biz sales-invoices generate \
  --customer-contact-id ct_000245 \
  --deal-id deal_000072 \
  --issue-date 2026-04-02 \
  --service-date 2026-03-31 \
  --payment-terms-days 30 \
  --json
```

```bash
wrobo biz sales-invoices send sinv_000041 \
  --channel email \
  --to ap@acme-retail.example \
  --json
```

```bash
wrobo biz sales-invoices get sinv_000041 --json
wrobo biz sales-invoices pdf sinv_000041 --output ./tmp/sales-invoice-2026-0041.pdf
```

#### Suggested CLI behavior

* default to human-readable output for terminal users and `--json` for agent calls
* never require interactive prompts when all required flags are present
* return stable exit codes for not found, validation error and conflict
* support `--idempotency-key` on mutating commands for agent retries
