---
type: feature-guide
description: Concise Business API reference and extension spec for contacts
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/architecture/Business API Architecture.md
  - packages/business-schemas/src/contact.ts
  - business-api/src/routes/contacts.ts
  - business-api/src/services/contacts.ts
---

# Contacts in the Business API (Persons and Companies)

## Purpose

`contacts` is the shared registry of external and internal business counterparties used across CRM and accounting flows.

It stores:

* companies
* persons
* company-to-person relationships via `parentContactId`
* lightweight business metadata used by deals, expenses, payrolls, sales invoices, comments, document ingestion, and agent workflows

Contacts are not tenant/company-card records. They are reusable business entities that other objects point to by `contactId` or slug.

## Current Model

A contact has these business fields:

* identity: `contactId`, `slug`
* hierarchy: optional `parentContactId`
* type: `person` or `company`
* roles: one or more of `customer`, `supplier`, `employee`, `both`, `owned`, `contact`
* naming: `displayName`, optional `legalName`
* identifiers: optional `taxId`, `email`, `phone`
* billing address: optional structured address
* notes: optional free text
* lifecycle: `status` = `active` or `inactive`
* timestamps: `createdAt`, `updatedAt`

Service responses also include:

* `persons` on `GET /contacts/:id` for child person contacts of a company

## Rules and Invariants

* Soft delete only. Deleted rows are excluded by reads through `deletedAt IS NULL`.
* A nested contact must be a `person`.
* A nested `person` must have a parent contact whose type is `company`.
* Contacts are addressable by either stable ID or slug.
* API output is mapped business shape, not raw ORM rows.
* `roles` is persisted as JSON text in the DB but exposed as a string array in API/service responses.
* Create, update, and resolve may trigger embedding sync for search/agent usage. Benign embedding failures must not fail the main request.

## API Surface

REST base path: `/api/v1/contacts`

* `GET /`
  Filters:
  `query`, `role`, `type`, `parentContactId`
* `POST /`
  Creates a contact from `contactInputSchema`
* `POST /resolve`
  Resolves an existing contact or creates one when `autoCreate` is `true`
* `GET /:id`
  Accepts contact ID or slug
* `PATCH /:id`
  Partial update via `contactPatchSchema`
* `DELETE /:id`
  Soft delete, returns `204`

CLI surface:

* `contacts list`
* `contacts create <json>`
* `contacts get <id-or-slug>`
* `contacts resolve <json>`

## Resolve Semantics

`POST /resolve` is the agent-oriented dedupe entry point.

Input:

* `autoCreate: boolean`
* `matchBy: ("taxId" | "email" | "legalName" | "canonicalName")[]`
* `contact: ContactInput`

Behavior:

* matchers are evaluated in caller-provided order
* string matching is normalized with trim + lowercase
* `canonicalName` additionally strips punctuation and common legal suffixes such as `llc`, `ltd`, `sl`, `sa`, `gmbh`
* if one match is found, response is `{ contactId, resolution: "matched", matchedBy }`
* if `canonicalName` matches multiple contacts, service throws `422 contact_resolution_ambiguous`
* if nothing matches and `autoCreate` is `false`, service throws `404 not_found`
* if nothing matches and `autoCreate` is `true`, service creates a contact and returns `{ contactId, resolution: "created", matchedBy: null }`

## Where Contacts Are Used

Contacts are foundational references for:

* deals
* projects
* expenses
* payrolls
* sales invoices
* comments
* document ingestion and counterparty resolution

This means contact changes can have cross-domain effects. Preserve ID/slug lookup compatibility and core business fields unless the migration path is explicit.

## LLM Extension Spec

When extending contact support in code, follow these rules:

* Keep `business-api/src/routes/contacts.ts` thin. Parse query/body, validate with Zod, call services, return JSON.
* Put business rules, lookup logic, matching, slug/ID generation, side effects, and DB access in `business-api/src/services/contacts.ts`.
* Add shared transport fields to `packages/business-schemas/src/contact.ts` when they must be reused outside `business-api`.
* Do not expose DB-only storage details in the API contract.
* Preserve soft-delete behavior by excluding deleted contacts from list/get/resolve helpers.
* Preserve `id-or-slug` lookup behavior for fetch, update, and delete flows.
* Preserve parent validation: only persons can be children, and only under companies.
* Prefer extending `resolveContact` instead of adding duplicate matching logic elsewhere.
* Use `AppError` with stable `statusCode` and `code` for expected failures.
* Return mapped contact objects, never raw Drizzle rows.
* If adding searchable business text, keep embedding sync best-effort and non-blocking.
* If adding new fields, update all four layers together:
  `packages/business-schemas/src/contact.ts`,
  DB schema/migrations,
  `mapContact`,
  create/update flows
* Keep dashboard/API compatibility in mind: shared fields belong in `business-schemas`; backend-only helpers do not.

## Non-Goals for This Module

Do not turn contacts into:

* full CRM lead/opportunity objects
* tenant ownership records
* deep org charts
* implicit dedupe/merge orchestration beyond the explicit `resolve` flow

Those belong in separate domain services or dedicated workflows.
