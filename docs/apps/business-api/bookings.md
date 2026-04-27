---
type: feature-guide
description: Implemented booking and employee availability scope for the Business API
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/architecture/Business API Architecture.md
  - docs/apps/business-api/contacts.md
  - docs/apps/business-api/cli.md
  - packages/business-schemas/src/booking.ts
---

# Bookings in the Business API

## Purpose

Bookings are implemented as scheduled service commitments between the owned business and customer contacts. They sit between CRM, operational work, and billing:

* CRM context: who the booking is for and what was agreed
* operational context: when and where the work should happen
* workflow context: which project, deal, task, or sales invoice the booking relates to

Bookings are operational records. They do not calculate prices, taxes, invoice numbers, or payments. Deals remain the commercial scope and pricing record, tasks remain the execution checklist, and sales invoices remain the accounting source of truth.

The implemented MVP covers:

* booking create, list, get, update, soft-delete, complete, and cancel flows
* date-range agenda queries for day/week views
* assignment validation against employee booking profiles and availability exceptions
* optional links to `project`, `deal`, `task`, and `sales_invoice`
* optional follow-up task creation when completing a booking
* comments and embeddings for `booking` records
* REST and CLI surfaces

Not implemented in this pass:

* staff shift planning
* recurrence rules
* resource/equipment capacity
* public self-serve booking pages
* automatic availability optimization
* payment capture at booking time
* MCP tools

## Data Model

The implementation uses three SQLite/Drizzle tables:

* `bookings`
  scheduled customer-facing service commitments
* `booking_assignment_profiles`
  one active employee availability profile per employee contact
* `booking_availability_exceptions`
  one-off blocks or overrides for an employee

Shared API contracts live in `packages/business-schemas/src/booking.ts`.

### Booking

Implemented booking fields:

* `bookingId`
* `slug`
* `customerContactId`
* `projectId` optional
* `dealId` optional
* `taskId` optional
* `salesInvoiceId` optional
* `title`
* `serviceType`
* `status`
* `scheduledStartAt`
* `scheduledEndAt`
* `timezone`
* `location` optional
* `assignedContactIds`
* `notes` optional
* `completionNotes` optional
* `completedAt` optional
* `cancelledAt` optional
* `cancellationReason` optional
* `createdAt`
* `updatedAt`

Supported booking statuses:

* `tentative`
* `confirmed`
* `in_progress`
* `completed`
* `cancelled`
* `no_show`

Supported service types:

* `consultation`
* `visit`
* `installation`
* `maintenance`
* `workshop`
* `training`
* `other`

Supported location kinds:

* `on_site`
* `remote`
* `phone`
* `office`
* `other`

Example booking input:

```json
{
  "customerContactId": "ct_000245",
  "projectId": "proj_000018",
  "dealId": "deal_000072",
  "taskId": "task_000310",
  "salesInvoiceId": "sinv_000041",
  "title": "Warehouse automation discovery visit",
  "serviceType": "visit",
  "status": "confirmed",
  "scheduledStartAt": "2026-04-10T09:00:00+02:00",
  "scheduledEndAt": "2026-04-10T11:00:00+02:00",
  "timezone": "Europe/Madrid",
  "location": {
    "kind": "on_site",
    "label": "Acme Retail warehouse",
    "address": {
      "street1": "Poligono Industrial Norte 14",
      "city": "Madrid",
      "postalCode": "28021",
      "countryCode": "ES"
    }
  },
  "assignedContactIds": ["ct_emp_000011"],
  "notes": "Customer requested focus on packing line bottlenecks."
}
```

## Relationship Rules

Bookings are validated against existing business objects:

* `customerContactId` must reference an active contact with role `customer` or `both`.
* `projectId`, when present, must reference a project owned by the booking customer contact.
* `dealId`, when present, must reference a deal for the booking customer contact.
* `salesInvoiceId`, when present, must reference a sales invoice for the booking customer contact.
* If both `dealId` and `salesInvoiceId` are present and the invoice has a deal, the invoice deal must match the booking deal.
* `taskId`, when present, must reference a task in a project owned by the booking customer contact.
* If both `projectId` and `taskId` are present, the task must belong to that project.
* `assignedContactIds` must contain active person contacts with role `employee`.

The booking time window must be valid:

* `scheduledStartAt` must be before `scheduledEndAt`.
* For v1 assignment validation, bookings must fit inside one local calendar day in the supplied `timezone`.

## Availability Model

Availability is stored separately from bookings:

* profile and exceptions describe supply-side availability
* booking describes demand-side commitment
* assigned contacts are validated against those rules during booking create/update

### Assignment Profile

`booking_assignment_profiles` are addressed by employee `contactId`.

Implemented profile fields:

* `profileId`
* `slug`
* `contactId`
* `isBookable`
* `timezone`
* `weeklyAvailability`
* `bufferBeforeMinutes` optional
* `bufferAfterMinutes` optional
* `maxBookingsPerDay` optional
* `bookingTypes` optional
* `effectiveFrom` optional
* `effectiveTo` optional
* `notes` optional
* `createdAt`
* `updatedAt`

Only active person contacts with role `employee` can have assignment profiles. There is one profile per employee contact; `PUT /api/v1/booking-assignment-profiles/:contactId` creates or replaces it.

Example:

```json
{
  "isBookable": true,
  "timezone": "Europe/Madrid",
  "weeklyAvailability": [
    {
      "dayOfWeek": "monday",
      "windows": [
        {"start": "09:00", "end": "13:00"},
        {"start": "15:00", "end": "18:00"}
      ]
    },
    {
      "dayOfWeek": "tuesday",
      "windows": [{"start": "09:00", "end": "17:00"}]
    }
  ],
  "bufferBeforeMinutes": 30,
  "bufferAfterMinutes": 30,
  "maxBookingsPerDay": 3,
  "bookingTypes": ["visit", "installation", "maintenance"]
}
```

### Availability Exception

Implemented exception fields:

* `exceptionId`
* `slug`
* `contactId`
* `kind`
* `startAt`
* `endAt`
* `reason` optional
* `notes` optional
* `createdAt`
* `updatedAt`

Supported exception kinds:

* `time_off`
* `blocked`
* `available_override`

Example:

```json
{
  "contactId": "ct_emp_000011",
  "kind": "time_off",
  "startAt": "2026-04-10T00:00:00+02:00",
  "endAt": "2026-04-10T23:59:59+02:00",
  "reason": "vacation"
}
```

## Assignment Conflict Rules

Creating or updating a booking with assigned employees blocks on hard conflicts by default.

The service checks each assigned employee for:

* active person contact with role `employee`
* existing assignment profile
* `isBookable = true`
* profile effective date window
* allowed `bookingTypes`, when configured
* weekly availability in the profile timezone
* `available_override` coverage when outside weekly availability
* overlapping `time_off` or `blocked` exceptions
* overlapping `confirmed` or `in_progress` bookings
* `maxBookingsPerDay` for `tentative`, `confirmed`, and `in_progress` bookings on the employee local date

Buffers are applied before overlap checks:

* `bufferBeforeMinutes` expands the requested start backward
* `bufferAfterMinutes` expands the requested end forward

Conflict checks can be inspected directly:

`POST /api/v1/bookings/check-assignment-conflicts`

```json
{
  "serviceType": "visit",
  "scheduledStartAt": "2026-04-10T09:00:00+02:00",
  "scheduledEndAt": "2026-04-10T11:00:00+02:00",
  "timezone": "Europe/Madrid",
  "assignedContactIds": ["ct_emp_000011"]
}
```

Response:

```json
{
  "conflicts": [
    {
      "contactId": "ct_emp_000011",
      "type": "availability_exception",
      "details": "Employee is marked as time_off during the requested slot."
    }
  ]
}
```

When a create/update is blocked, the API returns `409`:

```json
{
  "error": {
    "code": "booking_assignment_conflict",
    "message": "One or more assigned employees are not available for this booking window.",
    "conflicts": [
      {
        "contactId": "ct_emp_000011",
        "type": "overlapping_booking",
        "bookingId": "book_000091",
        "details": "Employee already has an overlapping confirmed or in-progress booking."
      }
    ],
    "details": {
      "conflicts": [
        {
          "contactId": "ct_emp_000011",
          "type": "overlapping_booking",
          "bookingId": "book_000091",
          "details": "Employee already has an overlapping confirmed or in-progress booking."
        }
      ]
    }
  }
}
```

## REST API

All routes are under `/api/v1` and require the existing Business API auth middleware.

### Bookings

Create:

`POST /api/v1/bookings`

List:

`GET /api/v1/bookings?from=2026-04-10T00:00:00Z&to=2026-04-17T00:00:00Z&status=confirmed&assignedContactId=ct_emp_000011`

Supported list filters:

* `from`
* `to`
* `status`
* `customerContactId`
* `assignedContactId`
* `projectId`
* `dealId`

Get:

`GET /api/v1/bookings/:id`

Update or reschedule:

`PATCH /api/v1/bookings/:id`

```json
{
  "scheduledStartAt": "2026-04-10T10:00:00+02:00",
  "scheduledEndAt": "2026-04-10T12:00:00+02:00",
  "assignedContactIds": ["ct_emp_000011", "ct_emp_000014"],
  "notes": "Bring conveyor photos and meter readings checklist."
}
```

Soft-delete:

`DELETE /api/v1/bookings/:id`

Complete:

`POST /api/v1/bookings/:id/complete`

```json
{
  "completionNotes": "Site survey completed. Customer approved next-step proposal.",
  "createFollowUpTask": true,
  "followUpTaskTitle": "Prepare Acme warehouse proposal"
}
```

If `createFollowUpTask` is true, the booking must have `projectId`. The response includes `followUpTaskId`.

Cancel:

`POST /api/v1/bookings/:id/cancel`

```json
{
  "reason": "customer_requested_reschedule"
}
```

Cancellation sets `status`, `cancelledAt`, and `cancellationReason`.

### Assignment Profiles

List profiles:

`GET /api/v1/booking-assignment-profiles`

Get profile by employee contact:

`GET /api/v1/booking-assignment-profiles/:contactId`

Create or replace profile:

`PUT /api/v1/booking-assignment-profiles/:contactId`

Soft-delete profile:

`DELETE /api/v1/booking-assignment-profiles/:contactId`

### Availability Exceptions

Create exception:

`POST /api/v1/booking-availability-exceptions`

List exceptions:

`GET /api/v1/booking-availability-exceptions?contactId=ct_emp_000011&kind=time_off`

Get exception:

`GET /api/v1/booking-availability-exceptions/:id`

Update exception:

`PATCH /api/v1/booking-availability-exceptions/:id`

Soft-delete exception:

`DELETE /api/v1/booking-availability-exceptions/:id`

## CLI Surface

The raw repo CLI is normally run as:

```bash
cd business-api
./container.sh exec npm run cli -- <command>
```

Create a booking:

```bash
./container.sh exec npm run cli -- bookings create \
  --customer-contact-id ct_000245 \
  --project-id proj_000018 \
  --deal-id deal_000072 \
  --title "Warehouse automation discovery visit" \
  --service-type visit \
  --status confirmed \
  --start 2026-04-10T09:00:00+02:00 \
  --end 2026-04-10T11:00:00+02:00 \
  --timezone Europe/Madrid \
  --assigned-contact-id ct_emp_000011 \
  --location-kind on_site \
  --location-label "Acme Retail warehouse"
```

List bookings:

```bash
./container.sh exec npm run cli -- bookings list \
  --from 2026-04-10T00:00:00Z \
  --to 2026-04-17T00:00:00Z \
  --status confirmed \
  --assigned-contact-id ct_emp_000011
```

Get, update, cancel, complete, and delete:

```bash
./container.sh exec npm run cli -- bookings get book_000091
./container.sh exec npm run cli -- bookings update book_000091 '{"notes":"Bring meter readings checklist."}'
./container.sh exec npm run cli -- bookings complete book_000091 --completion-notes "Site survey completed" --create-follow-up-task
./container.sh exec npm run cli -- bookings cancel book_000091 --reason customer_requested_reschedule
./container.sh exec npm run cli -- bookings delete book_000091
```

Check assignment conflicts:

```bash
./container.sh exec npm run cli -- bookings check-assignment-conflicts \
  --service-type visit \
  --start 2026-04-10T09:00:00+02:00 \
  --end 2026-04-10T11:00:00+02:00 \
  --timezone Europe/Madrid \
  --assigned-contact-id ct_emp_000011
```

Set an assignment profile:

```bash
./container.sh exec npm run cli -- booking-assignment-profiles set ct_emp_000011 \
  --timezone Europe/Madrid \
  --availability "monday|09:00|13:00" \
  --availability "monday|15:00|18:00" \
  --availability "tuesday|09:00|17:00" \
  --buffer-before-minutes 30 \
  --buffer-after-minutes 30 \
  --max-bookings-per-day 3 \
  --booking-type visit \
  --booking-type installation
```

Manage profiles:

```bash
./container.sh exec npm run cli -- booking-assignment-profiles list
./container.sh exec npm run cli -- booking-assignment-profiles get ct_emp_000011
./container.sh exec npm run cli -- booking-assignment-profiles delete ct_emp_000011
```

Create and manage exceptions:

```bash
./container.sh exec npm run cli -- booking-availability-exceptions create \
  --contact-id ct_emp_000011 \
  --kind time_off \
  --start 2026-04-10T00:00:00+02:00 \
  --end 2026-04-10T23:59:59+02:00 \
  --reason vacation

./container.sh exec npm run cli -- booking-availability-exceptions list --contact-id ct_emp_000011
./container.sh exec npm run cli -- booking-availability-exceptions get bex_000001
./container.sh exec npm run cli -- booking-availability-exceptions update bex_000001 '{"notes":"Confirmed by operations."}'
./container.sh exec npm run cli -- booking-availability-exceptions delete bex_000001
```

## Workflow Examples

Supported small-business flows:

* lead becomes a customer contact, then a first consultation booking is scheduled
* employee profiles define who can be assigned before bookings are created
* completed booking creates a follow-up task for quote preparation
* accepted deal leads to one or more implementation bookings
* completed billable booking is linked to a deal, then invoiced through the existing sales invoice flow

## Implementation Notes

Bookings are implemented in:

* `packages/business-schemas/src/booking.ts`
* `business-api/src/db/schema/bookings.ts`
* `business-api/src/services/bookings.ts`
* `business-api/src/routes/bookings.ts`
* `business-api/src/cli.ts`

The schema migration is `business-api/src/db/migrations/0006_bookings.sql`.

Integration coverage exists in:

* `business-api/test/services.integration.test.ts`
* `business-api/test/routes.integration.test.ts`
