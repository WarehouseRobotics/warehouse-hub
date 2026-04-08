---
type: iteration-report
date: 2026-04-07
goal: Implement basic document ingestion (expense and sales invoices) with OCR and text embeddings
workpaths: business-api/*; docs/*
---

# Smart Document Ingestion for Invoices and Contracts Agent Coding Run Results

## Summary

Implemented a full smart document ingestion flow in `business-api` and then fixed the sqlite-vec regression it exposed.

What changed:
- Added `POST /api/v1/documents/ingest` in [documents.ts](/Users/denis/src/warehouse-hub/business-api/src/routes/documents.ts)
- Added `wrobo biz documents ingest` in [cli.ts](/Users/denis/src/warehouse-hub/business-api/src/cli.ts)
- Added synchronous OCR + parsing pipeline in [document-ingestion.ts](/Users/denis/src/warehouse-hub/business-api/src/services/document-ingestion.ts) and [document-ocr.ts](/Users/denis/src/warehouse-hub/business-api/src/services/document-ocr.ts)
- Extended document persistence with OCR text, OCR status/error, extracted JSON, and linked entity metadata in [documents.ts](/Users/denis/src/warehouse-hub/business-api/src/db/schema/documents.ts) and [0001_document_ingestion.sql](/Users/denis/src/warehouse-hub/business-api/src/db/migrations/0001_document_ingestion.sql)
- Added imported/manual sales-invoice creation/attachment in [sales-invoices.ts](/Users/denis/src/warehouse-hub/business-api/src/services/sales-invoices.ts)
- Updated document embeddings to include OCR/extracted content in [embeddings.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/embeddings.ts)
- Added `pdftoppm` to the container in [Dockerfile](/Users/denis/src/warehouse-hub/business-api/Dockerfile)
- Fixed sqlite-vec insert/query behavior in [embeddings.ts](/Users/denis/src/warehouse-hub/business-api/src/lib/embeddings.ts)
- Verified with full container test run: `18 passed`

Important behavior:
- `expense_invoice` ingests a file, OCRs it, resolves/creates supplier contact, and creates an expense
- `sales_invoice` ingests a file, OCRs it, resolves/creates customer contact, and creates or attaches a sales invoice
- `contract` ingests a file, OCRs it, stores extracted metadata, and optionally links/creates a counterparty contact
- Generic `other` documents are still handled by the low-level raw upload route, not the smart ingest route
- Deals are still a separate resource; there is no “deal document ingestion” flow yet

## API Examples

Expense invoice ingest:
```bash
curl -X POST http://localhost:3100/api/v1/documents/ingest \
  -H "Authorization: Bearer test-api-key" \
  -F "kind=expense_invoice" \
  -F "source=email_forward" \
  -F 'overrides={"invoiceDate":"2026-03-26","category":"office_supplies"}' \
  -F "file=@./samples/invoices/supplier-invoice.png"
```

Sales invoice PDF ingest, creating or matching an invoice:
```bash
curl -X POST http://localhost:3100/api/v1/documents/ingest \
  -H "Authorization: Bearer test-api-key" \
  -F "kind=sales_invoice" \
  -F 'overrides={"status":"finalized","lineItems":[{"description":"Warehouse audit","quantity":"1","unitPrice":"1000.00"}]}' \
  -F "file=@./samples/invoices/outgoing-invoice.pdf"
```

Sales invoice PDF ingest, attaching to an existing sales invoice:
```bash
curl -X POST http://localhost:3100/api/v1/documents/ingest \
  -H "Authorization: Bearer test-api-key" \
  -F "kind=sales_invoice" \
  -F "targetSalesInvoiceId=sinv_000041" \
  -F 'overrides={"status":"finalized"}' \
  -F "file=@./samples/invoices/outgoing-invoice-updated.pdf"
```

Contract ingest:
```bash
curl -X POST http://localhost:3100/api/v1/documents/ingest \
  -H "Authorization: Bearer test-api-key" \
  -F "kind=contract" \
  -F 'overrides={"title":"Master Services Agreement","effectiveDate":"2026-04-03"}' \
  -F "file=@./samples/contracts/msa.pdf"
```

Raw generic document upload (`other`):
```bash
curl -X POST http://localhost:3100/api/v1/documents \
  -H "Authorization: Bearer test-api-key" \
  -F "kind=other" \
  -F "source=manual_upload" \
  -F "file=@./samples/docs/reference.pdf"
```

Deal creation remains separate:
```bash
curl -X POST http://localhost:3100/api/v1/deals \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "customerContactId": "ct_000245",
    "title": "Warehouse audit and automation proposal",
    "stage": "won",
    "currency": "EUR",
    "expectedCloseDate": "2026-04-10",
    "lineItems": [
      { "description": "Audit", "quantity": "1", "unitPrice": "1000.00", "taxRate": "21.00" }
    ]
  }'
```

**CLI Examples**

Basic expense invoice ingest:

```bash
./container.sh exec npm run cli -- documents ingest test-data/expenses/invoice_do_2026_03.pdf '{"kind": "expense_invoice"}'
```

Expense invoice ingest with overrides:
```bash
./container.sh exec npm run cli -- documents ingest test-data/expenses/invoice_do_2026_03.pdf '{
  "kind":"expense_invoice",
  "source":"email_forward",
  "overrides":{
    "invoiceDate":"2026-03-26",
    "category":"office_supplies"
  }
}'
```

Sales invoice ingest:
```bash
./container.sh exec npm run cli -- documents ingest ./samples/invoices/outgoing-invoice.pdf '{
  "kind":"sales_invoice",
  "overrides":{
    "status":"finalized",
    "lineItems":[
      { "description":"Warehouse audit", "quantity":"1", "unitPrice":"1000.00" }
    ]
  }
}'
```

Sales invoice attach to existing record:
```bash
./container.sh exec npm run cli -- documents ingest ./samples/invoices/outgoing-invoice-updated.pdf '{
  "kind":"sales_invoice",
  "targetSalesInvoiceId":"sinv_000041",
  "overrides":{
    "status":"finalized"
  }
}'
```

Contract ingest:
```bash
./container.sh exec npm run cli -- documents ingest ./samples/contracts/msa.pdf '{
  "kind":"contract",
  "overrides":{
    "title":"Master Services Agreement",
    "effectiveDate":"2026-04-03"
  }
}'
```

Raw generic document upload:
```bash
./container.sh exec npm run cli -- documents upload ./samples/docs/reference.pdf '{
  "kind":"other",
  "source":"manual_upload"
}'
```

If you want, I can also turn this into a short section for `docs/apps/Business Foundation API.md` so the new ingest flow is documented alongside the existing CRUD examples.