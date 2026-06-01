---
name: business-api-invoice-create
description: Step-by-step workflows for recording incoming expense invoices and recording or generating outgoing sales invoices, including file-based ingestion from uploads.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["docker"], "env": ["HUB_TMP_DIR", "HUB_URL", "WROBO_PYTHON3_PATH", "WROBO_BUSINESS_API_PATH", "WROBO_API_BASE_URL", "WROBO_API_TOKEN"], "config": [] }
      },
  }
---

# Invoice Create Skill

Use this skill when you need to:

- Record an **incoming expense invoice** (a supplier billed you)
- Generate an **outgoing sales invoice** (you are billing a customer)
- Handle either case when a **PDF or image file** arrives via Slack, email forward, or another agent

Sales invoices and expenses must be created with "paid" status unless specified otherwise. Allowed invoice statuses are: "draft" | "sent" | "overdue" | "finalized" | "paid" | "cancelled". Let the user know which status you used when creating.

## Types of Invoices

```yaml
- type: Inbound — supplier bills you
  term: Expense invoice
  cli_scope: expenses / documents ingest
- type: Payroll - payments to employees (special kind of document)
  terms: Payrolls, payslips, salaries, etc.
  cli_scope: payrolls
- type: Outbound — you bill a customer
  term: Sales invoice
  cli_scope: sales-invoices / documents ingest
```

So we'll use kind 'expenses' for bills from suppliers, "sales-invoices" for our own invoices to clients and "payrolls" for salary payments to employees.

If the kind of the document isn't clear from user's input, **look at the provided image or the pdf to deduct the document kind.**

---

## Default Command Pattern

General pattern (wrobo-biz is linked to /usr/bin which is in PATH):

```bash
$WROBO_PYTHON3_PATH $WROBO_BUSINESS_API_PATH/bin/wrobo-biz <command> <subcommand> ...
```

## Inbound: Recording an Expense Invoice

### Path A — File received (PDF or image from Slack, email, etc.)

Copy the uploaded file to $HUB_TMP_DIR to make it available to the API in the container. Then use `documents ingest` with `kind: "expense_invoice"`. The OCR pipeline extracts totals, dates, and supplier info automatically. Use `overrides` only to correct or supplement what OCR may miss. The CLI ingest tool will also automatically match the document to the right contract or will automatically create a new contact. 

```bash
# Minimal — let OCR extract everything
wrobo-biz documents ingest supplier-invoice.pdf \
  '{"kind":"expense_invoice","source":"slack_upload"}'

# With overrides to fix or supplement OCR output
wrobo-biz documents ingest supplier-invoice.pdf \
  '{"kind":"expense_invoice","source":"email_forward","overrides":{"invoiceDate":"2026-04-15","category":"office_supplies","supplierContactId":"ct_000245"}}'
```

The command returns a document record and a linked expense record. Confirm both IDs from the response.

**When to add `overrides`:**
- `supplierContactId` — if you already know the supplier's contact ID (skips auto-resolve)
- `invoiceDate` / `dueDate` — if the PDF date is ambiguous or OCR gets it wrong
- `category` — to force a specific expense category
- `totals` — to correct OCR-extracted amounts (`{"net":"120.00","tax":"25.20","gross":"145.20"}`)


### Path B — Manual entry (when no file provided by the user)

Step 1: Resolve the supplier contact (creates it if absent):

```bash
wrobo-biz contacts resolve '{"autoCreate":true,"matchBy":["taxId","email","canonicalName"],"contact":{"type":"company","status":"active","roles":["supplier"],"displayName":"Papeleria Centro SL","taxId":"B87654321","email":"facturas@papeleriacentro.example"}}'
```

Step 2: Create the expense using the returned contact ID:

```bash
wrobo-biz expenses create '{"supplierContactId":"ct_000245","invoiceNumber":"FC-2026-0042","invoiceDate":"2026-04-15","dueDate":"2026-05-15","currency":"EUR","totals":{"net":"120.00","tax":"25.20","gross":"145.20"},"category":"office_supplies","notes":"Printer paper and toner.","status":"recorded"}'
```

### Mark an expense as paid

```bash
wrobo-biz expenses update exp_000123 '{"status":"paid","notes":"Paid via bank transfer on 2026-04-20."}'
```

---

## Outbound: Generating a Sales Invoice

### Path A — Generate from a deal (standard flow)

Step 1: Confirm the customer contact ID and deal ID:

```bash
wrobo-biz contacts list
wrobo-biz deals list
```

Step 2: Generate the invoice:

```bash
wrobo-biz sales-invoices generate '{"customerContactId":"ct_000310","dealId":"deal_000041","issueDate":"2026-04-19","paymentTermsDays":30}'
```

Step 3: Finalize when ready to send:

```bash
wrobo-biz sales-invoices update sinv_000087 '{"status":"finalized"}'
```

Step 4: Mark as paid when payment is received:

```bash
wrobo-biz sales-invoices update sinv_000087 '{"status":"paid"}'
```

### Path B — Ingest an externally created sales invoice PDF

Use this when a PDF of an outgoing invoice already exists and needs to be stored and linked:

```bash
wrobo-biz documents ingest my-sales-invoice.pdf \
  '{"kind":"sales_invoice","source":"manual_upload","overrides":{"customerContactId":"ct_000310","issueDate":"2026-04-19","status":"finalized"}}'
```

---

## Duplicate Prevention

Before creating any record manually, check whether it already exists:

```bash
# Search by semantic description
wrobo-biz expenses list --similar "papeleria centro april toner" --since 1m

# Search sales invoices by customer or period
wrobo-biz sales-invoices list --after 2026-04-01 --before 2026-05-01
```

`documents ingest` does not automatically deduplicate — if the same PDF is ingested twice, two records are created. Verify with a list or search first.

---

## What to Report to the User After Ingest

Once the ingest operation completes for one or more documents, report the following to the user:

* date, kind, employee/provider/client (as a link to the dashboard app), document number (like invoice number) and total amount for each document ingested
* signal if any of the documents were duplicates (and if the were reimported or ignored)
* if there were any issues when ingesting and some documents didn't go through - inform about the problem.

In your response, provide dashboard app links to the resulting contacts and documents:

```yaml
resource_url_format:
  contacts: $HUB_URL/contacts/<id>
  expenses: $HUB_URL/expenses/<id>
  payrolls: $HUB_URL/payrolls/<id>
  sales_invoices: $HUB_URL/sales-invoices/<id>
```


## Quick Reference

```yaml
quick_reference:
  - task: Ingest expense invoice PDF
    command: "documents ingest <path> '{\"kind\":\"expense_invoice\",...}'"
  - task: Ingest sales invoice PDF
    command: "documents ingest <path> '{\"kind\":\"sales_invoice\",...}'"
  - task: Create expense manually
    command: "expenses create '<json>'"
  - task: Resolve/create contact
    command: "contacts resolve '<json>'"
  - task: Generate sales invoice
    command: "sales-invoices generate '<json>'"
  - task: Finalize sales invoice
    command: "sales-invoices update <id> '{\"status\":\"finalized\"}'"
  - task: Mark expense paid
    command: "expenses update <id> '{\"status\":\"paid\",...}'"
  - task: Search expenses
    command: "expenses list --similar \"<text>\" --since <duration>"
  - task: Search sales invoices
    command: "sales-invoices list --after <date> --before <date>"
```
