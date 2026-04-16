# Business API CLI Examples

The `business-api` CLI is typically run inside the Docker development container:


```bash
cd business-api
./container.sh exec npm run cli -- <command>
```

## Convenience wrapper

The `business-api/bin/wrobo-biz` is normally installed to /usr/bin and should be available system-wide. With this wrapper the calls tranform to something like this:

```bash
wrobo-biz invoices list
```

This is the preferred way for production and testing.

## Database and Company Card

Initialize or migrate the local database:

```bash
./container.sh exec npm run cli -- db init
./container.sh exec npm run cli -- db migrate
```

Create or update the owned company card:

```bash
./container.sh exec npm run cli -- company-card set '{
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
  }
}'
```

Read it back:

```bash
./container.sh exec npm run cli -- company-card get
```

or with the CLI wrapper, simply:

```bash
wrobo-biz company-card get
```

## Contacts

Create a supplier contact:

```bash
./container.sh exec npm run cli -- contacts create '{
  "type": "company",
  "status": "active",
  "roles": ["supplier"],
  "displayName": "Papeleria Centro SL",
  "legalName": "Papeleria Centro SL",
  "taxId": "B87654321",
  "email": "facturas@papeleriacentro.example"
}'
```

Resolve a contact, auto-creating if needed:

```bash
./container.sh exec npm run cli -- contacts resolve '{
  "autoCreate": true,
  "matchBy": ["taxId", "email", "canonicalName"],
  "contact": {
    "type": "company",
    "status": "active",
    "roles": ["customer"],
    "displayName": "Acme Retail GmbH",
    "legalName": "Acme Retail GmbH",
    "taxId": "DE123456789",
    "email": "ap@acme-retail.example"
  }
}'
```

List all contacts:

```bash
./container.sh exec npm run cli -- contacts list
```

## Documents

Upload a raw document:

```bash
./container.sh exec npm run cli -- documents upload ./samples/docs/reference.pdf '{
  "kind": "other",
  "source": "manual_upload"
}'
```

Ingest an expense invoice and let OCR extract bookkeeping data:

```bash
./container.sh exec npm run cli -- documents ingest ./test-data/expenses/invoice_do_2026_03.pdf '{
  "kind": "expense_invoice",
  "source": "email_forward",
  "overrides": {
    "invoiceDate": "2026-03-26",
    "category": "office_supplies"
  }
}'
```

List documents from a time window:

```bash
./container.sh exec npm run cli -- documents list --after 2026-04-01 --before 2026-05-01
```

## Expenses

Create an expense manually:

```bash
./container.sh exec npm run cli -- expenses create '{
  "supplierContactId": "ct_000245",
  "invoiceNumber": "FC-2026-0042",
  "invoiceDate": "2026-03-25",
  "dueDate": "2026-04-24",
  "currency": "EUR",
  "totals": {
    "net": "120.00",
    "tax": "25.20",
    "gross": "145.20"
  },
  "category": "office_supplies",
  "notes": "Printer paper and toner.",
  "status": "recorded"
}'
```

List recorded expenses:

```bash
./container.sh exec npm run cli -- expenses list --status recorded
```

Find an expense by semantic similarity within the last two months:

```bash
./container.sh exec npm run cli -- expenses list --similar "office toner cartridges from papeleria centro" --since 2m
```

Combine semantic search with an exact filter and an absolute range:

```bash
./container.sh exec npm run cli -- expenses list --status recorded --similar "warehouse printer toner invoice" --after 2026-02-01 --before 2026-04-01
```

## Sales Invoices

Generate a sales invoice:

```bash
./container.sh exec npm run cli -- sales-invoices generate '{
  "customerContactId": "ct_000310",
  "dealId": "deal_000041",
  "issueDate": "2026-04-02"
}'
```

List finalized sales invoices from the current month:

```bash
./container.sh exec npm run cli -- sales-invoices list --status finalized --after 2026-04-01 --before 2026-05-01
```

Find sales invoices by semantic similarity:

```bash
./container.sh exec npm run cli -- sales-invoices list --similar "warehouse audit consulting sprint" --since 1m
```

## Tasks and Projects

Create a project:

```bash
./container.sh exec npm run cli -- projects create '{
  "ownerEntityId": "comp_000001",
  "name": "Customer onboarding"
}'
```

Create a task:

```bash
./container.sh exec npm run cli -- tasks create '{
  "projectId": "proj_000101",
  "title": "Review Q2 expense backlog",
  "status": "todo",
  "priority": "high"
}'
```

List tasks:

```bash
./container.sh exec npm run cli -- tasks list
```
