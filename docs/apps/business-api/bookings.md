---
type: feature-guide
description: Booking and employee availability specification for the Business API
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/architecture/Business API Architecture.md
  - docs/apps/business-api/contacts.md
  - packages/business-schemas
---

# Bookings in the Business API

## Purpose

For small businesses, a practical MVP booking should be modeled as a scheduled service commitment between the owned business and a customer contact.

It is not:

* a full calendar platform
* the accounting source of truth
* an HR rostering system

Instead, it should sit cleanly between CRM, tasks, and invoicing:

* CRM context: who the booking is for and what was agreed
* operational context: when and where the work should happen
* workflow context: what task, project, deal, or invoice it is related to

This plays well with the existing business context approach because `booking` becomes another stable business object that links existing primitives together instead of introducing a separate scheduling domain with its own incompatible rules.

## Booking Concept

A booking represents one scheduled unit of work such as:

* an on-site visit
* a consultation call
* an installation slot
* a maintenance appointment
* a workshop or training session

For MVP, a booking should always belong to the owned workspace and should usually point to one customer contact. It may also point to a customer project or deal when the work is part of a broader commercial relationship.

Suggested first-pass booking fields:

* `bookingId`
* `customerContactId`
* `projectId` optional, for grouping repeated work with the same customer
* `dealId` optional, when the booking was sold as part of a quote or sale
* `title`
* `serviceType` such as `consultation`, `visit`, `installation`, `maintenance`
* `status`
* `scheduledStartAt`
* `scheduledEndAt`
* `timezone`
* `location`
  on-site address, remote meeting note, or free-text location label
* `assignedContactIds`
  internal employee/person contacts assigned to perform the work
* `notes`
* `completionNotes` optional
* `salesInvoiceId` optional, when invoiced later

Recommended status model for MVP:

* `tentative`
* `confirmed`
* `in_progress`
* `completed`
* `cancelled`
* `no_show`

Recommended design rules:

* bookings store operational facts, not deep staffing or availability logic
* bookings can exist before a deal or invoice exists
* tasks remain the place for execution detail and subtasks
* deals remain the place for commercial scope and pricing
* sales invoices remain the place for tax and accounting facts

## Scope

Include:

* manual create, list, get, update, cancel, complete flows
* customer and internal assignee linkage via contacts
* employee booking-availability configuration
* one-off availability exceptions for time off or blocked periods
* date range search for day/week agenda views
* optional links to project, deal, and sales invoice
* optional follow-up task creation using the existing tasks model

Do not include yet:

* staff shift planning
* recurrence rules
* resource/equipment capacity planning
* public self-serve booking pages
* automatic availability optimization
* payment capture at booking time

## Relationship Rules

To keep business context deterministic and composable:

* a booking must reference one `customerContactId`
* a booking may reference one `projectId`
* a booking may reference one `dealId`
* a booking may reference one `salesInvoiceId`
* assigned employee contacts should be validated against availability configuration at assignment time
* a booking may create one internal project task for fulfillment follow-up
* multiple bookings may point to the same project or deal

This gives us a practical pattern for small businesses:

* recurring customer relationship lives in `contact` and optionally `project`
* sold work lives in `deal`
* scheduled execution lives in `booking`
* bookable working hours live in employee availability configuration
* execution checklist lives in `task`
* billable record lives in `sales_invoice`

## Employee Booking Availability

Availability should not live directly on the booking. A better fit for the business-context model is a separate contact-linked configuration object plus optional exception records:

* `booking_assignment_profile`
  linked to one internal employee/person contact and stores the employee's default booking availability rules
* `booking_availability_exception`
  linked to one internal employee/person contact and stores overrides such as holiday, sick leave, blocked time, or one-off extra availability

Bookings then reference assigned contacts, while services validate those assignments against the employee availability profile and its exceptions.

For MVP, employee booking availability should be modeled as a small scheduling subset, separate from bookings themselves.

Recommended object split:

* `booking_assignment_profile`
  one per internal employee/person contact; defines whether the person can be assigned to bookings, their normal weekly availability windows, and assignment constraints such as buffer times or max bookings per day
* `booking_availability_exception`
  one-off time windows that override the default profile, such as vacation, sick leave, training, manual block, or temporary overtime window

This is preferable to linking one scheduling entity to both contact and booking because the business meaning is different:

* profile and exceptions describe supply-side availability
* booking describes demand-side commitment
* assignment is the relation between the two and should be validated, not duplicated as configuration

Suggested `booking_assignment_profile` fields:

* `profileId`
* `contactId`
* `isBookable`
* `timezone`
* `weeklyAvailability`
  day-of-week plus one or more local time windows
* `bufferBeforeMinutes` optional
* `bufferAfterMinutes` optional
* `maxBookingsPerDay` optional
* `bookingTypes` optional, if some employees only handle specific service types
* `effectiveFrom` optional
* `effectiveTo` optional
* `notes` optional

Suggested `booking_availability_exception` fields:

* `exceptionId`
* `contactId`
* `kind`
  `time_off`, `blocked`, `available_override`
* `startAt`
* `endAt`
* `reason`
* `notes`

Practical rules for MVP:

* only internal person contacts with role `employee` can have assignment profiles
* one active assignment profile per employee contact
* bookings do not copy the whole availability profile
* bookings only store assigned contact IDs and the result of validation happens in service logic
* soft conflicts should be possible for agents to inspect, but hard conflicts should block invalid assignment by default

Suggested validation behavior:

* creating or updating a booking with `assignedContactIds` checks that each employee:
  is bookable
  is available during the requested time window in their timezone
  has no conflicting exception blocks
  has no overlapping confirmed or in-progress bookings
* API can expose a `conflicts` array in validation errors for agent-friendly recovery

Example availability profile:

`PUT /api/v1/booking-assignment-profiles/ct_emp_000011`

```json
{
  "isBookable": true,
  "timezone": "Europe/Madrid",
  "weeklyAvailability": [
    {
      "dayOfWeek": "monday",
      "windows": [{"start": "09:00", "end": "13:00"}, {"start": "15:00", "end": "18:00"}]
    },
    {
      "dayOfWeek": "tuesday",
      "windows": [{"start": "09:00", "end": "17:00"}]
    },
    {
      "dayOfWeek": "wednesday",
      "windows": [{"start": "09:00", "end": "17:00"}]
    },
    {
      "dayOfWeek": "thursday",
      "windows": [{"start": "09:00", "end": "17:00"}]
    },
    {
      "dayOfWeek": "friday",
      "windows": [{"start": "09:00", "end": "14:00"}]
    }
  ],
  "bufferBeforeMinutes": 30,
  "bufferAfterMinutes": 30,
  "maxBookingsPerDay": 3,
  "bookingTypes": ["visit", "installation", "maintenance"]
}
```

Example exception:

`POST /api/v1/booking-availability-exceptions`

```json
{
  "contactId": "ct_emp_000011",
  "kind": "time_off",
  "startAt": "2026-04-10T00:00:00+02:00",
  "endAt": "2026-04-10T23:59:59+02:00",
  "reason": "vacation"
}
```

Example assignment conflict response:

```json
{
  "error": {
    "code": "booking_assignment_conflict",
    "message": "One or more assigned employees are not available for this booking window.",
    "conflicts": [
      {
        "contactId": "ct_emp_000011",
        "type": "availability_exception",
        "details": "Employee is marked as time_off during the requested slot."
      }
    ]
  }
}
```

## API Surface

The examples below are intended as a feasible first iteration for REST, MCP, and CLI.

### Create a booking

`POST /api/v1/bookings`

```json
{
  "customerContactId": "ct_000245",
  "projectId": "proj_000018",
  "dealId": "deal_000072",
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

Example response:

```json
{
  "bookingId": "book_000091",
  "customerContactId": "ct_000245",
  "projectId": "proj_000018",
  "dealId": "deal_000072",
  "title": "Warehouse automation discovery visit",
  "serviceType": "visit",
  "status": "confirmed",
  "scheduledStartAt": "2026-04-10T09:00:00+02:00",
  "scheduledEndAt": "2026-04-10T11:00:00+02:00",
  "timezone": "Europe/Madrid",
  "assignedContactIds": ["ct_emp_000011"],
  "createdAt": "2026-04-02T08:45:00Z"
}
```

### List bookings

`GET /api/v1/bookings?from=2026-04-10T00:00:00Z&to=2026-04-17T00:00:00Z&status=confirmed&assignedContactId=ct_emp_000011`

Use case: build a week agenda for an employee or show all customer visits for a date range.

Suggested filters:

* `from`
* `to`
* `status`
* `customerContactId`
* `assignedContactId`
* `projectId`
* `dealId`

### Update or reschedule a booking

`PATCH /api/v1/bookings/book_000091`

```json
{
  "scheduledStartAt": "2026-04-10T10:00:00+02:00",
  "scheduledEndAt": "2026-04-10T12:00:00+02:00",
  "assignedContactIds": ["ct_emp_000011", "ct_emp_000014"],
  "notes": "Bring conveyor photos and meter readings checklist."
}
```

Use case: move the appointment or assign an extra employee.

### Complete a booking

`POST /api/v1/bookings/book_000091/complete`

```json
{
  "completionNotes": "Site survey completed. Customer approved next-step proposal.",
  "createFollowUpTask": true
}
```

Example response:

```json
{
  "bookingId": "book_000091",
  "status": "completed",
  "completedAt": "2026-04-10T10:58:00Z",
  "followUpTaskId": "task_000412"
}
```

### Cancel a booking

`POST /api/v1/bookings/book_000091/cancel`

```json
{
  "reason": "customer_requested_reschedule"
}
```

Use case: keep an audit-friendly operational history instead of deleting the record.

### Configure employee booking availability

`PUT /api/v1/booking-assignment-profiles/ct_emp_000011`

Use case: mark an employee as bookable for specific weekdays and time windows.

`POST /api/v1/booking-availability-exceptions`

Use case: record vacation or a temporary blocked window without editing the whole weekly profile.

## Workflow Examples

Suggested small-business flows:

* lead becomes customer contact, then a first consultation booking is scheduled
* employee profiles define who is assignable before bookings are scheduled
* completed booking creates a follow-up task for quote preparation
* accepted deal leads to one or more implementation bookings
* completed billable booking is linked to a deal, then invoiced through the existing sales invoice flow

Important boundary for v1:

* bookings should not calculate tax totals
* bookings should not replace deals for pricing approval
* bookings should not replace tasks for execution detail
* employee availability should stay simple and rule-based, not become a full HR rostering system

## MCP Surface

Suggested tool examples:

* `business.create_booking`
* `business.list_bookings`
* `business.get_booking`
* `business.update_booking`
* `business.complete_booking`
* `business.cancel_booking`
* `business.upsert_booking_assignment_profile`
* `business.create_booking_availability_exception`
* `business.check_booking_assignment_conflicts`

## CLI Surface

Suggested CLI style:

```bash
wrobo biz bookings create \
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
  --location-label "Acme Retail warehouse" \
  --city Madrid \
  --country ES \
  --json
```

```bash
wrobo biz bookings list \
  --from 2026-04-10T00:00:00Z \
  --to 2026-04-17T00:00:00Z \
  --status confirmed \
  --assigned-contact-id ct_emp_000011 \
  --json
```

```bash
wrobo biz bookings complete book_000091 \
  --completion-notes "Site survey completed" \
  --create-follow-up-task \
  --json
```

```bash
wrobo biz booking-assignment-profiles set ct_emp_000011 \
  --timezone Europe/Madrid \
  --availability "monday|09:00|13:00" \
  --availability "monday|15:00|18:00" \
  --availability "tuesday|09:00|17:00" \
  --buffer-before-minutes 30 \
  --buffer-after-minutes 30 \
  --max-bookings-per-day 3 \
  --booking-type visit \
  --booking-type installation \
  --json
```

```bash
wrobo biz booking-availability-exceptions create \
  --contact-id ct_emp_000011 \
  --kind time_off \
  --start 2026-04-10T00:00:00+02:00 \
  --end 2026-04-10T23:59:59+02:00 \
  --reason vacation \
  --json
```
