# 2026-04-04 Business Foundation API Initial Scaffold Run Results

Implemented the remaining Business API scaffold for the MVP resource set.

Added new API/service/CLI coverage for:
- `contacts/resolve`
- `documents` upload, metadata fetch, download, delete
- `expenses` create/list/get/update/delete
- `deals` create/list/get/update/delete
- `sales-invoices` generate/list/get/update/delete
- `projects` create/list/get/update/delete
- `tasks` create/list/get/update/delete

Aligned the public API shapes toward the written spec:
- document creation now uses multipart upload semantics
- expenses use nested `totals` and structured `taxLines`
- deals compute totals from `lineItems`
- sales invoices generate from company card + customer + optional deal, with sequential `{YEAR}-{SEQ}` numbering

Expanded shared infrastructure:
- replaced money math with `decimal.js`-based helpers
- added reusable id-or-slug lookup helpers
- added embedding text generation and embedding upsert/query plumbing
- wired embeddings into company card, contacts, documents, deals, and tasks
- added sqlite-vec initialization plus a JSON fallback when the native extension is unavailable in the container
- added a compatibility fix for older local `company_card` schemas missing `vat_id`

Expanded the local CLI in `src/cli.ts` to cover the new resources and flows, including document upload/download.

Added integration tests for:
- company card bootstrap and default project creation
- contacts CRUD and resolve
- document upload/download
- expense lifecycle and status transitions
- deal total computation
- sales invoice generation and transitions
- project/task hierarchy behavior
- auth and route-level behavior

Verified in Docker with:
- `./container.sh exec npm run typecheck`
- `./container.sh exec npm run test`
- `./container.sh exec npm run cli -- company-card get`