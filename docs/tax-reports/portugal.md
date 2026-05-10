---
type: feature-spec
description: Portugal-specific tax declaration ingestion rules for Business API tax reports
project_dir: business-api
frozen: false
see_also:
  - docs/tax-reports.md
---

# Portugal Tax Reports

## Purpose

Portugal support should fit the shared tax report model while staying isolated in a Portugal country module. Full parser depth is not required in the first Spain-focused pass, but the shared schema must not prevent Portuguese declarations, credits, or carryforwards.

Official source anchors:

* Portal das Finanças annual declaration calendar: https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/calendario_fiscal/Pages/Quadro_res_Decl_2026.aspx
* Portal das Finanças Modelo 22 IRC: https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Negocios/Declaracoes/Modelo_22_IRC/Paginas/default.aspx

## Module Boundary

The Portugal module owns:

* Portal das Finanças declaration and receipt detection
* form aliases and Portuguese labels
* periodic VAT period parsing
* `campo` and `quadro` field-code mapping
* Portuguese result and carry-forward interpretation

The shared service owns document storage, OCR orchestration, persistence, payment linking, embeddings, and API responses.

## Target Forms

`declaracao_periodica_iva`: periodic VAT declaration.

Extract when supported:

* fiscal year and period
* taxpayer tax ID
* VAT payable, deductible, credit, refund, and compensation amounts
* result amount and payment or credit status

`modelo_22_irc`: corporate income tax declaration.

Extract when supported:

* fiscal year
* taxable profit or loss
* tax due
* payments on account
* withholding or credit values
* tax loss carry-forward candidates

`ies_da`: Informação Empresarial Simplificada / Declaração Anual.

Extract annual business and tax facts useful for reconciliation and future reports.

Payroll and withholding declarations should be added when they are needed for retained amounts, credits, or future payment status.

## Field Facts

Portugal field facts should use:

```ts
fieldSystem: "campo" | "quadro"
```

Use `campo` for numbered fields and `quadro` when the declaration structure identifies sections more clearly than a single field number.

## Carryforward Focus

The Portugal module should create carryforward candidates for:

* IRC tax losses
* VAT credits
* withholding credits
* payment-on-account or instalment credits
* refund credits

## Tests

Add Portugal parser fixtures when implementation begins:

* periodic VAT declaration with payable result
* periodic VAT declaration with credit or refund result
* Modelo 22 IRC with tax loss or credit facts
* payment receipt linked to an existing declaration
