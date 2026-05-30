---
name: business-api-booking-manage
description: Step-by-step workflows for creating, scheduling, rescheduling, completing, cancelling, and managing customer bookings with Business API CLI availability checks.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["docker"], "env": ["WROBO_PYTHON3_PATH", "WROBO_BUSINESS_API_PATH", "WROBO_API_BASE_URL", "WROBO_API_TOKEN"], "config": [] }
      },
  }
---

## Default Command Pattern

General pattern (wrobo-biz is linked to /usr/bin which is in PATH):

```bash
$WROBO_PYTHON3_PATH $WROBO_BUSINESS_API_PATH/bin/wrobo-biz <command> <subcommand> ...
```

# Booking Manage Skill

Use this skill when you need to:

- Create a customer-facing booking or appointment
- Reschedule, complete, cancel, or soft-delete an existing booking
- Check whether employees can be assigned to a booking window
- Configure employee booking availability profiles
- Add time off, blocked windows, or availability overrides

Primary CLI modality: use the Warehouse Hub Business API CLI wrapper:

```bash
wrobo-biz <command> <subcommand> ...
```

Alternative modality: if the wrapper is unavailable and you are debugging inside the repo, the lower-level equivalent is:

```bash
cd /Users/denis/src/warehouse-hub/business-api
./container.sh exec npm run cli -- <command> <subcommand> ...
```

---

## Booking Concepts

Bookings are operational service commitments. They link CRM context, work context, assignment context, and optional billing context, but they do not calculate prices, taxes, invoice numbers, or payments.

Allowed booking statuses:

```yaml
statuses:
  - tentative
  - confirmed
  - in_progress
  - completed
  - cancelled
  - no_show
```

Allowed service types:

```yaml
service_types:
  - consultation
  - visit
  - installation
  - maintenance
  - workshop
  - training
  - other
```

Allowed location kinds:

```yaml
location_kinds:
  - on_site
  - remote
  - phone
  - office
  - other
```

When the user does not specify a status, use `tentative` until the time, customer, and assigned employee are confirmed. Let the user know which status you used.

---

## Required Data Before Creating

Before creating a booking, resolve or confirm:

- `customerContactId`: must be an active customer or both-role contact
- `title`: short human-readable booking title
- `serviceType`: one of the supported service types, default `other`
- `scheduledStartAt` and `scheduledEndAt`: ISO datetimes with timezone offset
- `timezone`: IANA timezone such as `Europe/Madrid`
- `assignedContactIds`: optional, but any assigned contacts must be active employee person contacts

Optional relationship IDs:

- `projectId`: project owned by the customer
- `dealId`: deal for the customer
- `taskId`: task in a project owned by the customer
- `salesInvoiceId`: sales invoice for the customer

Relationship rules:

- If `projectId` is present, it must belong to the booking customer.
- If `dealId` is present, it must belong to the booking customer.
- If `salesInvoiceId` is present, it must belong to the booking customer.
- If both `dealId` and `salesInvoiceId` are present and the invoice has a deal, they must match.
- If both `projectId` and `taskId` are present, the task must belong to that project.

If contact or relationship IDs are unknown, inspect existing records before creating:

```bash
wrobo-biz contacts list
wrobo-biz projects list
wrobo-biz deals list
wrobo-biz tasks list
wrobo-biz sales-invoices list --after 2026-04-01
```

Use `contacts resolve` if you need to match or create the customer:

```bash
wrobo-biz contacts resolve '{"autoCreate":true,"matchBy":["taxId","email","canonicalName"],"contact":{"type":"company","status":"active","roles":["customer"],"displayName":"Acme Retail GmbH","email":"ops@acme-retail.example"}}'
```

---

## Create A Booking

### Path A - Confirmed booking with known IDs

Use this when the user has provided the customer, time, and employee assignment.

Step 1: Check assignment conflicts before creating a confirmed booking:

```bash
wrobo-biz bookings check-assignment-conflicts \
  --service-type visit \
  --start 2026-04-10T09:00:00+02:00 \
  --end 2026-04-10T11:00:00+02:00 \
  --timezone Europe/Madrid \
  --assigned-contact-id ct_emp_000011
```

If `conflicts` is an empty array, create the booking:

```bash
wrobo-biz bookings create \
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
  --notes "Customer requested focus on packing line bottlenecks."
```

The create command also validates assignment conflicts. If it returns a `booking_assignment_conflict` error, do not retry blindly. Report the conflict and propose another employee or time window.

### Path B - Tentative booking while details are still being arranged

Use tentative status when the customer request should be recorded but the schedule or assignment is not fully confirmed.

```bash
wrobo-biz bookings create '{"customerContactId":"ct_000245","title":"Remote onboarding workshop","serviceType":"workshop","status":"tentative","scheduledStartAt":"2026-04-11T14:00:00+02:00","scheduledEndAt":"2026-04-11T16:00:00+02:00","timezone":"Europe/Madrid","assignedContactIds":[],"location":{"kind":"remote","label":"Video call"},"notes":"Waiting for operations lead assignment."}'
```

### Path C - Remote or phone booking

For remote bookings, include a remote URL when known:

```bash
wrobo-biz bookings create '{"customerContactId":"ct_000245","title":"Maintenance planning call","serviceType":"maintenance","status":"confirmed","scheduledStartAt":"2026-04-12T10:00:00+02:00","scheduledEndAt":"2026-04-12T10:45:00+02:00","timezone":"Europe/Madrid","assignedContactIds":["ct_emp_000011"],"location":{"kind":"remote","label":"Google Meet","remoteUrl":"https://meet.google.com/abc-defg-hij"}}'
```

---

## List, Inspect, And Avoid Duplicates

Before creating a booking for a specific time window, check nearby existing bookings:

```bash
wrobo-biz bookings list \
  --from 2026-04-10T00:00:00Z \
  --to 2026-04-17T00:00:00Z \
  --customer-contact-id ct_000245
```

Useful list filters:

```yaml
filters:
  - --from <iso>
  - --to <iso>
  - --status <status>
  - --customer-contact-id <id>
  - --assigned-contact-id <id>
  - --project-id <id>
  - --deal-id <id>
```

Inspect one booking:

```bash
wrobo-biz bookings get book_000091
```

Treat same customer, same service type, overlapping time window, and same assigned employee as a probable duplicate unless the user explicitly wants separate bookings.

---

## Reschedule Or Update A Booking

Use `bookings update` with a JSON patch. When changing time, assigned employees, service type, or status, check assignment conflicts first.

Step 1: Check conflicts for the proposed new slot:

```bash
wrobo-biz bookings check-assignment-conflicts \
  --booking-id book_000091 \
  --service-type visit \
  --start 2026-04-10T12:00:00+02:00 \
  --end 2026-04-10T14:00:00+02:00 \
  --timezone Europe/Madrid \
  --assigned-contact-id ct_emp_000011
```

Step 2: Patch the booking:

```bash
wrobo-biz bookings update book_000091 '{"scheduledStartAt":"2026-04-10T12:00:00+02:00","scheduledEndAt":"2026-04-10T14:00:00+02:00","assignedContactIds":["ct_emp_000011"],"notes":"Rescheduled at customer request."}'
```

Other useful updates:

```bash
wrobo-biz bookings update book_000091 '{"status":"in_progress"}'
wrobo-biz bookings update book_000091 '{"salesInvoiceId":"sinv_000041"}'
wrobo-biz bookings update book_000091 '{"location":{"kind":"office","label":"Main demo room"}}'
```

To clear nullable fields, pass `null`:

```bash
wrobo-biz bookings update book_000091 '{"dealId":null,"salesInvoiceId":null,"notes":null}'
```

---

## Complete, Cancel, Or Delete

Complete a booking after the work is done:

```bash
wrobo-biz bookings complete book_000091 --completion-notes "Site survey completed. Customer approved next-step proposal."
```

Create a follow-up task while completing:

```bash
wrobo-biz bookings complete book_000091 \
  --completion-notes "Site survey completed. Customer approved next-step proposal." \
  --create-follow-up-task \
  --follow-up-task-title "Prepare Acme warehouse proposal"
```

Only use `--create-follow-up-task` when the booking has a `projectId`; otherwise completion fails.

Cancel a booking when it should remain visible as cancelled:

```bash
wrobo-biz bookings cancel book_000091 --reason customer_requested_reschedule
```

Soft-delete only when the record was created in error or should no longer appear in normal lists:

```bash
wrobo-biz bookings delete book_000091
```

Prefer cancellation over deletion for real customer events that were later called off.

---

## Employee Assignment Profiles

Assigned employees need booking assignment profiles before they can be scheduled.

Set or replace a profile:

```bash
wrobo-biz booking-assignment-profiles set ct_emp_000011 \
  --timezone Europe/Madrid \
  --availability "monday|09:00|13:00" \
  --availability "monday|15:00|18:00" \
  --availability "tuesday|09:00|17:00" \
  --buffer-before-minutes 30 \
  --buffer-after-minutes 30 \
  --max-bookings-per-day 3 \
  --booking-type visit \
  --booking-type installation \
  --booking-type maintenance
```

Profile fields:

```yaml
profile:
  contactId: employee contact ID
  isBookable: true by default, false with --not-bookable
  timezone: IANA timezone
  weeklyAvailability: repeated day|HH:MM|HH:MM entries
  bufferBeforeMinutes: optional non-negative integer
  bufferAfterMinutes: optional non-negative integer
  maxBookingsPerDay: optional positive integer
  bookingTypes: optional repeated service types
  effectiveFrom: optional ISO datetime
  effectiveTo: optional ISO datetime
  notes: optional text
```

Mark an employee as not bookable:

```bash
wrobo-biz booking-assignment-profiles set ct_emp_000011 \
  --timezone Europe/Madrid \
  --not-bookable \
  --notes "Temporarily unavailable for customer bookings."
```

Manage profiles:

```bash
wrobo-biz booking-assignment-profiles list
wrobo-biz booking-assignment-profiles get ct_emp_000011
wrobo-biz booking-assignment-profiles delete ct_emp_000011
```

---

## Availability Exceptions

Use availability exceptions for one-off employee schedule changes.

Supported exception kinds:

```yaml
exception_kinds:
  - time_off
  - blocked
  - available_override
```

Create time off:

```bash
wrobo-biz booking-availability-exceptions create \
  --contact-id ct_emp_000011 \
  --kind time_off \
  --start 2026-04-10T00:00:00+02:00 \
  --end 2026-04-10T23:59:59+02:00 \
  --reason vacation
```

Block a specific window:

```bash
wrobo-biz booking-availability-exceptions create \
  --contact-id ct_emp_000011 \
  --kind blocked \
  --start 2026-04-10T12:00:00+02:00 \
  --end 2026-04-10T13:00:00+02:00 \
  --reason internal_meeting
```

Allow an employee outside normal weekly availability:

```bash
wrobo-biz booking-availability-exceptions create '{"contactId":"ct_emp_000011","kind":"available_override","startAt":"2026-04-13T10:00:00+02:00","endAt":"2026-04-13T12:00:00+02:00","reason":"approved overtime"}'
```

Manage exceptions:

```bash
wrobo-biz booking-availability-exceptions list --contact-id ct_emp_000011
wrobo-biz booking-availability-exceptions list --contact-id ct_emp_000011 --kind time_off
wrobo-biz booking-availability-exceptions get bex_000001
wrobo-biz booking-availability-exceptions update bex_000001 '{"notes":"Confirmed by operations."}'
wrobo-biz booking-availability-exceptions delete bex_000001
```

---

## Handling Assignment Conflicts

Conflict checks inspect:

- employee contact validity and role
- assignment profile existence
- `isBookable`
- profile effective dates
- allowed booking types
- weekly availability
- available overrides
- time off or blocked exceptions
- overlapping `confirmed` or `in_progress` bookings
- employee `maxBookingsPerDay`
- profile buffers around the booking window

Conflict response shape:

```json
{
  "conflicts": [
    {
      "contactId": "ct_emp_000011",
      "type": "overlapping_booking",
      "bookingId": "book_000091",
      "details": "Employee already has an overlapping confirmed or in-progress booking."
    }
  ]
}
```

Recommended handling:

- If conflicts are empty, proceed with create or update.
- If the employee has no profile, create or update an assignment profile before scheduling.
- If the employee is outside weekly availability but should work that slot, create an `available_override`.
- If the conflict is overlap or max daily bookings, propose a different employee or time.
- If the conflict is time off or blocked, do not override unless the user explicitly confirms and the business policy allows it.

---

## What To Report To The User

After creating or changing bookings, report:

- booking title, date/time, timezone, and status used
- customer contact, assigned employee contacts, and linked project/deal/task/invoice IDs when present
- booking ID and dashboard link
- any conflicts found and whether the booking was created, updated, skipped, or needs user input
- for completion, include completion notes and any follow-up task ID
- for cancellation, include the cancellation reason

Dashboard URL formats:

```yaml
resource_url_format:
  bookings: $WROBO_API_BASE_URL/bookings/<id>
  contacts: $WROBO_API_BASE_URL/contacts/<id>
  projects: $WROBO_API_BASE_URL/projects/<id>
  deals: $WROBO_API_BASE_URL/deals/<id>
  tasks: $WROBO_API_BASE_URL/tasks/<id>
  sales_invoices: $WROBO_API_BASE_URL/sales-invoices/<id>
```

---

## Quick Reference

```yaml
quick_reference:
  - task: Create booking from flags
    command: "bookings create --customer-contact-id <id> --title <title> --service-type <type> --status <status> --start <iso> --end <iso> --timezone <iana> [--assigned-contact-id <id>]"
  - task: Create booking from JSON
    command: "bookings create '<json>'"
  - task: List bookings
    command: "bookings list --from <iso> --to <iso> [--status <status>] [--customer-contact-id <id>] [--assigned-contact-id <id>]"
  - task: Inspect booking
    command: "bookings get <id-or-slug>"
  - task: Update or reschedule
    command: "bookings update <id-or-slug> '<json-patch>'"
  - task: Complete booking
    command: "bookings complete <id-or-slug> --completion-notes <text> [--create-follow-up-task --follow-up-task-title <title>]"
  - task: Cancel booking
    command: "bookings cancel <id-or-slug> --reason <text>"
  - task: Soft-delete booking
    command: "bookings delete <id-or-slug>"
  - task: Check assignment conflicts
    command: "bookings check-assignment-conflicts --service-type <type> --start <iso> --end <iso> --timezone <iana> --assigned-contact-id <id>"
  - task: Set assignment profile
    command: "booking-assignment-profiles set <employee-contact-id> --timezone <iana> --availability day|HH:MM|HH:MM [--booking-type <type>]"
  - task: Add availability exception
    command: "booking-availability-exceptions create --contact-id <id> --kind <kind> --start <iso> --end <iso> [--reason <text>]"
```
