# Smart Document Ingestion for Invoices and Contracts

## Summary
Add a new synchronous ingestion flow in `business-api` that accepts an image or PDF, stores the original file in the existing document vault, runs local OCR with `tesseract.js`, normalizes and corrects extracted fields using known Business API data, applies caller-provided field overrides last, and then creates or updates the appropriate business record.

This v1 should support:
- `expense_invoice`: create a `documents` record plus an `expenses` record
- `sales_invoice`: create or update a `documents` record plus create or update a `sales_invoices` record
- `contract`: create a `documents` record with OCR/extraction metadata only

## Public API and CLI Changes
Add a new multipart endpoint and matching CLI command instead of overloading the existing plain upload route.

- New route: `POST /api/v1/documents/ingest`
- New CLI: `wrobo biz documents ingest <file-path> '<json-meta>'`

Multipart/body contract:
- `file`: required image or PDF
- `kind`: `expense_invoice | sales_invoice | contract`
- `companyCardId`: optional transport field for future multi-company support; for current MVP validate it matches the single owned company card when provided
- `source`: optional, same meaning as today
- `overrides`: optional JSON object; values here always win over OCR-derived values field-by-field
- `targetSalesInvoiceId`: optional, only for `sales_invoice`; when present, attach/update that invoice instead of creating a new one

Override shape:
- Shared: `invoiceNumber`, `invoiceDate`, `dueDate`, `currency`, `notes`
- Expense-only: `supplierContactId`, `supplierName`, `totals`, `taxLines`, `category`
- Sales-only: `customerContactId`, `customerName`, `status`, `paymentTermsDays`, `lineItems`, `issueDate`, `serviceDate`
- Contract-only: `title`, `counterpartyContactId`, `effectiveDate`

Response shape:
- `document`
- `ocr`
- `extracted`
- `appliedOverrides`
- `linkedEntity`
- `warnings`

## Implementation Changes
### 1. Document ingestion pipeline
Create a dedicated ingestion service, for example `src/services/document-ingestion.ts`, and keep `src/services/documents.ts` focused on raw storage/retrieval.

Pipeline for one request:
1. Validate kind and override payload.
2. Store the original file immediately using the existing document storage path.
3. Mark document OCR state as `processing`.
4. Extract OCR text:
   - Images: feed bytes directly to `tesseract.js`
   - PDFs: rasterize each page to images with `pdftoppm` inside the container, then OCR page-by-page and concatenate text
5. Parse normalized fields from OCR text with deterministic heuristics.
6. Correct data using known records:
   - company card for seller identity and default currency/payment terms
   - contacts lookup for supplier/customer matching
   - existing sales invoice lookup by invoice number when ingesting `sales_invoice`
7. Apply explicit overrides last.
8. Persist OCR/extraction metadata back onto the document.
9. Create/update the linked typed record.
10. Mark OCR state `completed` and return the final combined result.

Failure handling:
- If storage succeeds but OCR/parsing fails, keep the document and mark `ocrStatus=failed`
- Do not create/update `expenses` or `sales_invoices` on failed extraction
- Return a structured 422 for extraction/normalization failures and 500 only for unexpected runtime errors

### 2. Schema and persistence
Extend `documents` to hold actual OCR/extraction state, not just a stub status.

Add document columns for:
- `ocr_text`
- `ocr_error`
- `ocr_engine`
- `ocr_completed_at`
- `extracted_data_json`
- `linked_entity_type`
- `linked_entity_id`

Update document mapping/embedding so document search includes OCR text plus key extracted fields, not only filename/kind/source.

### 3. Expense ingestion behavior
For `expense_invoice`:
- Resolve supplier contact from override first, otherwise OCR-derived name/tax ID/email
- Use existing contact resolution logic style: match existing contact, otherwise create a supplier contact automatically
- Create the expense with `documentId` linked
- Require final normalized values for `supplierContactId`, `currency`, and `totals`; if OCR cannot produce them and overrides do not fill them, fail with 422

### 4. Sales invoice ingestion behavior
Current `sales_invoices` creation is generation-only from deal/contact data, so extend it to support imported/manual invoices.

Add a second service path such as `importSalesInvoice(...)` that can:
- create a sales invoice from OCR/manual fields without requiring a deal
- attach a `pdfDocumentId`
- preserve OCR/imported `invoiceNumber`, dates, totals, currency, status, and optional `lineItems`
- resolve or create the customer contact like expense ingestion does for suppliers

If `targetSalesInvoiceId` is provided:
- update that record’s `pdfDocumentId`
- backfill missing fields from OCR/overrides without overwriting explicit existing values unless the override explicitly says so

If no `targetSalesInvoiceId` is provided:
- try to find an existing sales invoice by invoice number before creating a duplicate
- otherwise create a new imported sales invoice record

### 5. Contracts
For `contract` ingestion:
- store the document
- run OCR and save extracted text/metadata
- resolve or create counterparty contact only if enough data exists
- do not create a new contract domain table in this pass

### 6. Container/runtime support
Update the `business-api` container to install the PDF rasterization tool needed for local PDF OCR:
- add Poppler utilities (`pdftoppm`) in `business-api/Dockerfile`
- run PDF page conversion inside the container via temp files under the existing writable runtime area

## Test Plan
Add route and service integration coverage for:
- image expense invoice ingestion creates both document and expense
- PDF expense invoice ingestion stores original file, OCRs pages, and links expense
- override precedence wins over OCR for invoice dates, totals, contact IDs, and other explicit fields
- supplier/customer auto-resolution matches existing contacts when possible and creates new ones otherwise
- sales invoice PDF ingestion creates a new imported sales invoice when no target exists
- sales invoice PDF ingestion updates/attaches to an existing invoice when `targetSalesInvoiceId` is provided
- contract ingestion stores OCR text and extracted metadata without creating a typed accounting record
- OCR/parsing failure leaves the document stored with `ocrStatus=failed`
- document embeddings include OCR/extracted content after ingestion

## Assumptions and Defaults
- Synchronous request/response is the intended MVP behavior.
- `documents upload` remains as the low-level raw file API; ingestion is a new higher-level workflow.
- `companyCardId` is accepted for API compatibility but only one owned company card exists today.
- PDF OCR uses local page rasterization plus `tesseract.js`; no cloud OCR service is introduced.
- Contracts remain document-only in this pass because the repo has no contract persistence model yet.
