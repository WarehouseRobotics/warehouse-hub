---
type: design-guide
description: Practical conventions for implementing internal Business API services in the current codebase.
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/architecture/Business API Architecture.md
---

# Business API Services Design

This guide documents the service design conventions that are already visible in the current `business-api` codebase. Use it when adding internal services for resources such as projects, invoices, contacts, deals, expenses, payrolls, and similar business objects.

The current pattern is a small vertical slice per resource:

* `src/db/schema/*.ts` defines storage shape
* `src/schemas/*.ts` defines request payloads
* `src/services/*.ts` holds business logic and DB access
* `src/routes/*.ts` stays thin and delegates to services

## Core Rules

### 1. Keep routes thin

Routes should do three things only:

* parse path/query parameters
* validate request bodies with zod middleware
* call a service and return the result

Current example:

```ts
contactsRouter.post("/", validateBody(contactInputSchema), (request, response) => {
  response.status(201).json(createContact(request.body));
});
```

Avoid putting query building, record mapping, ID generation, or cross-resource logic in routes.

### 2. Put business rules in services

A service owns:

* DB reads and writes
* ID and slug generation
* entity lookup rules
* mapping between DB rows and API shape
* side effects related to the resource lifecycle

Current example:

```ts
ensureDefaultTasksProject(id);
```

`upsertCompanyCard()` creates the company card and triggers creation of the default internal tasks project. That is the right place for this kind of deterministic side effect.

### 3. Keep API shape separate from DB shape

The current code intentionally does not expose raw DB rows.

Use service-level mapping functions to:

* convert flat DB columns into nested API objects
* parse serialized JSON fields
* rename internal columns into stable API names

Current example:

```ts
function mapContact(record: typeof contacts.$inferSelect) {
  return {
    contactId: record.id,
    roles: parseRoles(record.roles),
    billingAddress: {
      street1: record.billingAddressStreet1,
      city: record.billingAddressCity,
      postalCode: record.billingAddressPostalCode,
      countryCode: record.billingAddressCountryCode,
    },
  };
}
```

For new services, add a `mapX()` function early instead of returning Drizzle rows directly.

### 4. Validate inputs with zod before service entry

The route layer should pass only validated payloads into services.

Current example:

```ts
export const contactInputSchema = z.object({
  type: z.enum(["person", "company"]),
  roles: contactRolesSchema,
  displayName: z.string().min(1),
}).strict();
```

Practical rule:

* zod schema = transport contract
* Drizzle schema = persistence contract
* service = translation boundary between the two

### 5. Use service-local lookup helpers

If a resource is loaded repeatedly by ID or slug, create one helper and reuse it.

Current example:

```ts
function getContactRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(contacts)
    .where(
      and(
        isNull(contacts.deletedAt),
        or(eq(contacts.id, idOrSlug), eq(contacts.slug, idOrSlug)),
      ),
    )
    .get();
}
```

This keeps not-found behavior and soft-delete filtering consistent.

## Data Conventions

### IDs and slugs

Create stable prefixed IDs for each resource:

* `comp_` for company card
* `ct_` for contacts
* `proj_` for projects

Pattern:

```ts
const id = createPrefixedId("ct_");
const slug = createSlug(`${data.displayName}:${data.email ?? data.taxId ?? id}`);
```

For new resources, keep both:

* `id` for primary system identity
* `slug` for LLM-friendly alternative ID references and CLI/API ergonomics

A resource can be always specified as an id or a slug string. Search for a resource = check both id and slug.

### Timestamps

Services currently set timestamps explicitly with ISO strings:

```ts
const now = new Date().toISOString();
```

Use the same approach for:

* `createdAt`
* `updatedAt`
* `deletedAt`

### Soft delete by default

Current services treat rows as deleted by setting `deletedAt`, not by removing them.

Pattern:

```ts
.set({
  deletedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})
```

Practical rule:

* list/get queries should filter with `isNull(table.deletedAt)`
* delete operations should usually be soft delete
* hard delete should be a rare maintenance-only action

### Store structured lists as serialized JSON only when needed

Today `contacts.roles` is stored as JSON text and parsed in the service.

Pattern:

```ts
roles: JSON.stringify(data.roles)
```

and

```ts
return JSON.parse(raw) as string[];
```

If a field is naturally multi-valued but small and stable, this is acceptable for MVP. Keep serialization and parsing hidden inside the service layer.

## Error Handling Conventions

Use `AppError` for expected business failures.

Current example:

```ts
throw new AppError(`Contact not found: ${idOrSlug}`, { statusCode: 404, code: "not_found" });
```

Use this for:

* missing records
* invalid state transitions
* duplicate business constraints
* unsupported operations

Do not manually shape error responses inside services; the shared error middleware already handles `AppError` and `ZodError`.

## Service Shape

For a normal business resource, prefer this function set:

* `createX(data)`
* `listXs(filters?)`
* `getX(idOrSlug)`
* `updateX(idOrSlug, patch)`
* `softDeleteX(idOrSlug)`

This is already the pattern used by contacts.

For singleton resources, use explicit singleton verbs:

* `getCompanyCard()`
* `upsertCompanyCard(data)`

## Cross-Service Rules

Cross-service calls are acceptable when they are deterministic and lifecycle-related.

Good example from current code:

* creating the company card ensures the default tasks project exists

Good candidates for future services:

* creating a sales invoice can read company card defaults
* creating an expense can verify the supplier contact exists
* creating or importing a payroll can verify the employee contact exists
* creating a deal can attach to an existing customer contact

Avoid turning services into a large shared utility layer. Prefer resource ownership and only call another service when the business rule genuinely spans resources.

## Query Conventions

Current list endpoints support small, explicit filters.

Current example from contacts:

* `query`
* `role`
* `type`
* `parentContactId`

Practical rule for new services:

* keep filters shallow and explicit
* compose Drizzle conditions incrementally
* keep search behavior deterministic

Pattern:

```ts
const conditions = [isNull(table.deletedAt)];

if (filters.status) {
  conditions.push(eq(table.status, filters.status));
}
```

## Example Pattern For A New Service

Example shape for `sales-invoices.ts`:

```ts
function mapSalesInvoice(record: typeof salesInvoices.$inferSelect) {
  return {
    salesInvoiceId: record.id,
    invoiceNumber: record.invoiceNumber,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function createSalesInvoice(data: SalesInvoiceInput) {
  const now = new Date().toISOString();
  const id = createPrefixedId("sinv_");

  getOrm().insert(salesInvoices).values({
    id,
    slug: createSlug(`${data.customerContactId}:${id}`),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }).run();

  return getSalesInvoice(id);
}
```

Keep the first iteration simple:

* write one mapping function
* write one lookup helper
* centralize not-found behavior
* filter out soft-deleted rows everywhere

## Payroll Service Notes

Payrolls follow the normal resource pattern with one extra rule: import identity matters.

Short definitions:

* payroll = one employee payroll event for one period
* payroll document = the imported slip file linked to that payroll
* duplicate payroll import = update existing payroll and replace document, not create a revision chain

Current payroll-specific logic:

* payrolls are import-first, not generated from payroll rules
* `employeeContactId` should point to a `person` contact with role `employee`
* normalized payroll buckets stay intentionally small
* raw payroll lines preserve country-specific detail that does not fit the normalized buckets

Current dedupe rule:

* first match by `employeeContactId + periodStart + periodEnd + payrollNumber`
* if payroll number is missing, fall back to `employeeContactId + periodStart + periodEnd + paymentDate`
* if more than one match exists, fail with conflict instead of guessing

## Checklist For New Services

Before adding a new business service, check that it follows these conventions:

* route is thin and validates input before service call
* service owns DB access and business rules
* service exposes mapped API objects, not raw rows
* IDs use `createPrefixedId()`
* slugs use `createSlug()`
* reads ignore soft-deleted rows
* deletes set `deletedAt`
* expected failures throw `AppError`
* side effects are deterministic and close to the lifecycle event that triggers them

If a new service follows the `contacts` and `company-card` patterns, it will fit naturally into the current Business API design.
