---
type: feature-spec
description: Italy-specific tax declaration ingestion rules for Business API tax reports
project_dir: business-api
frozen: false
see_also:
  - docs/tax-reports.md
---

# Italy Tax Reports

## Purpose

Italy support should model Agenzia Entrate declarations and F24 payment evidence through an Italy country module. The shared service should not contain Italian form rows, tax codes, or F24 interpretation rules.

Official source anchors:

* Agenzia Entrate F24 payments: https://telematici.agenziaentrate.gov.it/Main/Versamenti.jsp
* Agenzia Entrate LIPE calendar example: https://www1.agenziaentrate.gov.it/servizi/scadenzario/main.php?chi=1595&come=522&cosa=11367&entroil=01-12-2025&op=4

## Module Boundary

The Italy module owns:

* Agenzia Entrate declaration, receipt, and F24 detection
* Italian form aliases and labels
* `rigo` row mapping
* LIPE and annual VAT result interpretation
* F24 payment and credit-compensation interpretation
* income tax, IRAP, and withholding summary facts

The shared service owns document storage, OCR orchestration, persistence, payment linking, embeddings, and API responses.

## Target Forms

`lipe`: Comunicazione liquidazioni periodiche IVA.

Extract when supported:

* fiscal year and quarter
* periodic VAT settlement data
* payable, credit, or compensation facts
* authority receipt/reference data

`dichiarazione_iva`: annual VAT declaration.

Extract annual VAT totals, credits, refunds, compensation, and final result.

`f24`: payment and credit compensation evidence.

Extract:

* tax codes
* payment date
* reference year
* debit amounts
* credit amounts compensated
* total balance
* authority receipt/reference data

`redditi_pf`, `redditi_sp`, `redditi_sc`: income tax declarations.

Extract income tax, instalment, credit, and loss facts when supported.

`irap`: regional business tax declaration.

Extract regional business tax base, due amounts, credits, and payment facts.

`cu` and `770`: withholding summaries where relevant.

## Field Facts

Italy field facts should use:

```ts
fieldSystem: "rigo"
```

Use the official row identifier as `fieldCode` when available. For F24 evidence, use the tax code as `fieldCode` and store the section or line reference in the label or extracted JSON.

## Carryforward Focus

The Italy module should create carryforward candidates for:

* VAT credits and annual balances
* F24 compensated credits
* income tax losses and instalment credits
* IRAP balances
* withholding credits

## Tests

Add Italy parser fixtures when implementation begins:

* LIPE with payable result
* annual VAT declaration with credit or refund result
* F24 with debit payment
* F24 with credit compensation
* Redditi or IRAP declaration with carry-forward facts
