---
type: feature-spec
description: Germany-specific tax declaration ingestion rules for Business API tax reports
project_dir: business-api
frozen: false
see_also:
  - docs/tax-reports.md
---

# Germany Tax Reports

## Purpose

Germany support should model ELSTER outputs and official form PDFs through a Germany country module. The shared service should not contain German form names, line mappings, or fiscal interpretation.

Official source anchors:

* ELSTER forms: https://www.elster.de/eportal/formulare-leistungen/alleformulare
* ELSTER Anlage EÜR: https://www.elster.de/eportal/formulare-leistungen/alleformulare/euer

## Module Boundary

The Germany module owns:

* ELSTER PDF, XML-upload receipt, and form output detection
* German form aliases and labels
* line, box, and section mapping
* VAT prepayment and annual VAT result interpretation
* EÜR, corporate income, trade tax, and payroll withholding facts
* jurisdiction details when state or municipality context is relevant

The shared service owns document storage, OCR orchestration, persistence, payment linking, embeddings, and API responses.

## Target Forms

`ustva`: Umsatzsteuer-Voranmeldung.

Extract when supported:

* fiscal year and period
* VAT taxable bases and amounts
* deductible VAT
* payment or refund result
* authority receipt/reference data

`ust`: Umsatzsteuererklärung.

Extract annual VAT totals and annual result facts.

`zm`: Zusammenfassende Meldung.

Store as an informational report for EU recapitulative statement evidence.

`lst_anmeldung`: Lohnsteuer-Anmeldung.

Extract payroll withholding amounts and payment evidence.

`anlage_euer`: Einnahmenüberschussrechnung.

Extract business income, expenses, and profit/loss facts for sole trader or small business workflows.

`kst_1`: Körperschaftsteuererklärung.

Extract corporate income tax facts, credits, and loss-related facts.

`gewst_1a`: Gewerbesteuererklärung.

Extract trade tax base and municipality-related facts when available.

## Field Facts

Germany field facts should use:

```ts
fieldSystem: "line" | "box" | "other"
```

Use `line` when a form line number is stable. Use `box` when the form output exposes stable box identifiers. Use `other` for ELSTER receipt metadata or sections without stable public field codes.

## Carryforward Focus

The Germany module should create carryforward candidates for:

* VAT prepayment and annual VAT balances
* EÜR profit or loss facts
* corporate income tax loss or credit values
* trade tax base or loss-related values
* payroll withholding payments

## Tests

Add Germany parser fixtures when implementation begins:

* Umsatzsteuer-Voranmeldung with payable result
* Umsatzsteuererklärung annual result
* Anlage EÜR profit/loss extraction
* Körperschaftsteuererklärung or Gewerbesteuererklärung with loss/base facts
