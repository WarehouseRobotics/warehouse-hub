---
name: business-api-invoice-create
description: Step-by-step workflows for recording incoming expense invoices and recording or generating outgoing sales invoices, including file-based ingestion from uploads.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["docker"], "env": [], "config": [] }
      },
  }
---

# Invoice Create Skill

Use this skill when you need to:

- Record an **incoming expense invoice** (a supplier billed you)
- Generate an **outgoing sales invoice** (you are billing a customer)
- Handle either case when a **PDF file** arrives via Slack, email forward, or another agent

## Two Invoice Directions

```yaml
directions:
  - direction: Inbound — supplier bills you
    term: Expense invoice
    cli_scope: expenses / documents ingest
  - direction: Outbound — you bill a customer
    term: Sales invoice
    cli_scope: sales-invoices / documents ingest
```

---

## Inbound: Recording an Expense Invoice

### Path A — File received (PDF from Slack, email, etc.)

Use `documents ingest` with `kind: "expense_invoice"`. The OCR pipeline extracts totals, dates, and supplier info automatically. Use `overrides` only to correct or supplement what OCR may miss.

```bash
# Minimal — let OCR extract everything
wrobo-biz documents ingest /tmp/supplier-invoice.pdf \
  '{"kind":"expense_invoice","source":"slack_upload"}'

# With overrides to fix or supplement OCR output
wrobo-biz documents ingest /tmp/supplier-invoice.pdf \
  '{"kind":"expense_invoice","source":"email_forward","overrides":{"invoiceDate":"2026-04-15","category":"office_supplies","supplierContactId":"ct_000245"}}'
```

The command returns a document record and a linked expense record. Confirm both IDs from the response.

**When to add `overrides`:**
- `supplierContactId` — if you already know the supplier's contact ID (skips auto-resolve)
- `invoiceDate` / `dueDate` — if the PDF date is ambiguous or OCR gets it wrong
- `category` — to force a specific expense category
- `totals` — to correct OCR-extracted amounts (`{"net":"120.00","tax":"25.20","gross":"145.20"}`)

### Path B — Manual entry (no file)

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
wrobo-biz documents ingest /tmp/my-sales-invoice.pdf \
  '{"kind":"sales_invoice","source":"manual_upload","overrides":{"customerContactId":"ct_000310","issueDate":"2026-04-19","status":"finalized"}}'
```

---

## Handling Files from Agent Channels (Slack, etc.)

When a file arrives through a channel or is passed between agents:

1. Confirm the local file path is accessible (the file must exist on disk before calling any CLI command).
2. Pass the path directly to `documents ingest` — the CLI reads the file from disk.
3. Prefer `source` values that reflect origin: `"slack_upload"`, `"email_forward"`, `"manual_upload"`.

```bash
# File saved from Slack to /tmp/invoice_april.pdf
wrobo-biz documents ingest /tmp/invoice_april.pdf \
  '{"kind":"expense_invoice","source":"slack_upload"}'
```

If the file path is unknown or the file has not been saved yet, ask for the file path before proceeding.

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
