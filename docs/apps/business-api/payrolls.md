---
type: feature-guide
description: Explains payroll ingestion, storage, OCR, and deduplication in the Business API.
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
  - docs/apps/business-api/cli.md
  - docs/apps/business-api/services.md
---

# Business API Payrolls

## Purpose

Payrolls let the Business API track imported payroll slips as structured accounting records.

V1 is intentionally narrow:

* payroll slips are imported, not generated
* payroll rules are not configured per employee
* the source of truth is the uploaded payroll slip document

## Core Definitions

`payroll`
: one employee payroll event for one payroll period

`employee`
: a `person` contact with role `employee`

`payroll slip`
: the uploaded source document linked to the payroll

`normalized payroll fields`
: the small cross-country set of totals stored directly on the payroll record

`rawLines`
: extracted payroll lines preserved with original labels for country-specific detail

## Why Payroll Is Separate From Expenses

Payroll is an employer cost, but it is not modeled as a normal supplier bill.

Important differences:

* the counterparty is an employee contact, not a supplier
* the document contains both payable and withholding information
* payroll logic needs gross/net and contribution buckets, not only invoice totals
* tax assistance later needs access to retained and contribution values directly

Because of this, payroll is stored in its own resource and linked to its own source document.

## Minimal Payroll Shape

The payroll record keeps:

* employee identity
* linked document
* payroll number, if present
* country code, if extractable
* period start and end
* payment date
* currency
* gross salary
* net salary
* employee tax withheld
* employee social contributions
* employer social contributions
* other deductions
* other earnings
* raw payroll lines
* notes
* payment status

This is enough for import tracking and later tax/reporting logic without introducing a payroll-calculation engine.

## OCR Strategy

Payroll OCR is handled through a dedicated structured OCR schema.

The OCR goal is:

* extract one small normalized payroll record
* preserve original payroll detail in `rawLines`
* stay country-agnostic enough for EU payroll slips

Normalization rule:

* map obvious concepts into canonical buckets
* keep ambiguous or highly local detail in `rawLines`

Examples of `rawLines` content:

* earning or deduction lines with amounts
* withholding or contribution lines
* informational lines such as IBAN or payment notes
* percentage-only detail lines with `rate` but no `amount`

For this reason, `rawLines.amount` can be null.

## Dedupe And Reimport Logic

Payroll import is idempotent by business identity, not by file checksum.

Primary dedupe identity:

* `employeeContactId + periodStart + periodEnd + payrollNumber`

Fallback identity when no payroll number exists:

* `employeeContactId + periodStart + periodEnd + paymentDate`

On import:

* if no match exists, create a new payroll and document
* if one match exists, update that payroll and replace the linked document
* if multiple matches exist, fail with conflict

V1 note:

* there is no payroll revision chain yet
* corrected imports overwrite the existing payroll/document pair

## Status Logic

Payroll status tracks payroll payment state only:

* `recorded`
* `paid`
* `void`

This is intentionally smaller than full remittance tracking.

Withheld taxes and contributions are stored as values, but settlement of those liabilities is still a later extension.

## Extension Notes

When extending payroll logic later, keep these boundaries clear:

* do not turn payroll into a generated rules engine unless product scope changes
* do not move country-specific labels into hardcoded normalized fields too early
* preserve original payroll-line labels whenever possible
* keep dedupe deterministic and conservative
* fail on ambiguous identity instead of silently merging records

Good future extensions:

* richer payroll list filters
* payroll-specific dashboard views
* liability settlement tracking
* better country-aware payroll explanation logic for agents
