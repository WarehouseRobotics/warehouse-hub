# 2026-04-06 Business Foundation API - Using Real Embeddings API Run Results

Implemented in this run:

- Replaced the stub-only embedding generation path with a real embedding provider client in `business-api/src/lib/embedding-provider.ts`.
- Added LLM embedding configuration loading from `business-api/config/llms.yaml` via `business-api/src/lib/llm-config.ts`.
- Extended `business-api/src/config.ts` with embedding-related config support:
  - `LLMS_CONFIG_PATH`
  - `EMBEDDING_API_TIMEOUT_MS`
  - `EMBEDDING_ALLOW_STUB_FALLBACK`
- Updated `business-api/src/lib/embeddings.ts` so embeddings now:
  - call the configured local OpenAI-compatible embeddings endpoint
  - validate returned vector dimensions
  - support async upsert and async similarity search
  - preserve optional stub fallback when explicitly enabled
  - handle concurrent insert/update races more safely

Embedding coverage now includes:

- `company_card`
- `contacts`
- `documents`
- `deals`
- `sales_invoices`
- `tasks`

Sales invoice embeddings were added in this run and now include rich searchable text built from:

- invoice number
- invoice status
- customer company display name
- customer legal name
- customer email
- currency
- issue date
- service date
- due date
- line item content / concepts

Service-layer embedding sync is now wired for:

- company card create/update
- contact create/update
- document upload
- deal create/update
- sales invoice generate/update
- task create/update

Tests added in this run:

- Mocked embedding-provider tests in `business-api/test/embeddings.mock.test.ts`
- Real configured API tests in `business-api/test/embeddings.real.test.ts`
- Additional integration assertions in `business-api/test/services.integration.test.ts` for sales-invoice similarity behavior and richer invoice embedding content

Verification completed:

- `./container.sh exec npm run typecheck`
- `./container.sh exec npm run test`

Current runtime note:

- The configured local embeddings API is working and the real API tests passed.
- The current Docker/container environment still cannot load the native `sqlite-vec` binary, so the system falls back to the JSON-backed vector storage/search path at runtime in this environment.
