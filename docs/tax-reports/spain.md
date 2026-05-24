---
type: feature-spec
description: Spain-specific tax declaration ingestion rules for Business API tax reports
project_dir: business-api
frozen: false
see_also:
  - docs/tax-reports.md
---

# Spain Tax Reports

## Purpose

Spain is the first implementation target for tax declaration ingest. The Spain module should parse AEAT declarations and receipts into the shared tax report model without leaking Spain-specific fields into the top-level service.

The Spanish MVP is declaration-sourced and audit-oriented. It ingests filed AEAT reports and exposes declared VAT credits, autónomo profit/loss position, corporate taxable-base position, and compensable tax-loss balances. It must not calculate Spanish taxes from invoices, expenses, payroll, or bank transactions.

Official source anchors:

* AEAT Modelo 303 IVA Autoliquidación: https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G414.shtml
* AEAT Modelo 303 instructions: https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/iva/modelo-303-iva-autoliquidacion_/instrucciones-2025.html
* AEAT Modelo 130 IRPF pago fraccionado: https://sede.agenciatributaria.gob.es/Sede/procedimientos/G601.shtml
* AEAT Modelo 130 instructions: https://sede.agenciatributaria.gob.es/Sede/impuestos-tasas/impuesto-sobre-renta-personas-fisicas/modelo-130-irpf______esionales-estimacion-directa-fraccionado_/instrucciones.html
* AEAT Impuesto sobre Sociedades declaration models: https://sede.agenciatributaria.gob.es/Sede/impuesto-sobre-sociedades/gestion-impuesto-sobre-sociedades/modelos-declaracion.html
* AEAT Modelo 200 base imponible manual: https://sede.agenciatributaria.gob.es/Sede/Ayuda/20Manual/200/5_Base_imponible.shtml
* AEAT Modelo 200 negative-base compensation manual: https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-sociedades-2024/capitulo-05-liquidacion-is-determinacion-imponible/bi-despues-reserva-capitalizac-compensac-00552/compensacion-bi-negativas-periodos-anteriores/cumplimentacion-modelo-200.html

## Module Boundary

The Spain module owns:

* detection of AEAT PDFs and receipt text
* form aliases such as `modelo_303`, `303`, `modelo_390`, `390`
* period parsing for monthly and quarterly AEAT periods
* `casilla` field-code mapping
* result mapping for payable, refund, compensation, zero, and no-activity returns
* Spanish carry-forward extraction for VAT credits, retentions, instalments, and tax losses

The shared service owns document storage, OCR orchestration, persistence, payment linking, embeddings, and API responses.

## Spanish MVP Slice

The Spanish MVP should support enough filed declarations to answer two practical accounting questions:

* what is the latest declared VAT position
* what accumulated profit/loss or compensable tax-loss position is known from filed declarations

MVP forms:

* `303`: required for VAT result, VAT compensation, refund, zero, and no-activity tracking.
* `130`: required for autónomo or individual entrepreneur activity in direct estimation. This is the MVP source for quarterly YTD income, expenses, net result, retentions, instalments, and negative-to-deduct flow.
* `200`: required for SL/corporate income-tax position. This is the MVP source for accounting result, taxable base, prior negative-base compensation, and remaining compensable negative tax bases.
* `390`: useful annual VAT summary and reconciliation evidence, but not required to answer MVP profit/loss questions.

The implementation may ingest only `303` first, but the Spanish MVP is not complete until `130` and `200` extraction can populate the tax-position summary below.

## Spanish Tax Position Output

Agents need a stable Spanish tax-position view derived from ingested tax reports. The Business API exposes this read-only summary at:

* REST: `GET /api/v1/tax-reports/positions/spain?companyCardId=<id-or-slug>&fiscalYear=<year>`
* CLI: `tax-reports spain-position --company-card-id <id-or-slug> --fiscal-year <year>`

```ts
type SpainTaxPosition = {
  companyCardId: string;
  countryCode: "ES";
  fiscalYear: number;
  vat?: {
    latestPeriodLabel: string;
    latestTaxReportId: string;
    result: TaxReportResult;
    resultAmount: string;
    remainingVatCredit?: string | null;
    refundRequested?: string | null;
    paymentStatus: TaxReportPaymentStatus;
  };
  autonomoIrpf?: {
    latestPeriodLabel: string;
    latestTaxReportId: string;
    ytdIncome: string;
    ytdExpenses: string;
    ytdNetProfitOrLoss: string;
    retentions: string;
    installmentResult: string;
    negativeToDeductSameYear?: string | null;
  };
  corporateIncome?: {
    latestFiscalYear: number;
    latestTaxReportId: string;
    accountingResult?: string | null;
    preCompensationTaxableBase?: string | null;
    priorNegativeBaseApplied?: string | null;
    taxableBase?: string | null;
    currentYearProfitOrLoss?: string | null;
    remainingCompensableNegativeBase?: string | null;
  };
  warnings: string[];
  confidence: "low" | "medium" | "high";
};
```

Rules:

* VAT position comes from the latest active `303` for the fiscal year, including `draft_extracted` reports with reduced confidence and optionally checked against `390`.
* Autónomo YTD profit/loss comes from `130` `casilla 03`, not from invoices or expenses.
* Corporate profit/loss position comes from `200` facts. `currentYearProfitOrLoss` is the current-year result before prior-loss compensation, preferring accounting result and then pre-compensation taxable base.
* Remaining compensable negative tax base comes from active or needs-review `tax_loss` carryforwards sourced from `200` page-15 negative-base detail across relevant origin years, not from a recalculation of the latest report only.
* If expected forms are missing, return warnings such as `missing_model_130_for_autonomo_profile` or `missing_model_200_for_corporate_profile`.
* Until a formal Spanish tax profile exists, missing-form warnings are evidence-based: previous or current `130` reports imply an autónomo profile, previous or current `200` reports imply a corporate profile, and VAT-only data does not speculate about income-tax form obligations.
* Accumulated profits are exposed only as declared facts in the summary. Only losses, VAT credits, installment credits, refund credits, or similar amounts with future tax effect should appear as `tax_carryforwards`.

## Initial Forms

`303`: periodic VAT self-assessment.

Extract:

* fiscal year and period, monthly or quarterly
* taxpayer tax ID
* VAT accrued bases and amounts
* VAT deductible bases and amounts
* result amount
* compensation, refund, payment, zero, and no-activity states
* authority submission or receipt evidence when present

Minimum facts:

```yaml
303:
  result_amount:
    fieldCode: "71"
    meaning: Resultado de la liquidación
    mapsTo: taxReport.resultAmount
  amount_to_compensate:
    fieldCode: "72"
    meaning: Importe a compensar when negative result is carried forward
    mapsTo: tax_carryforwards.kind=vat_credit
  prior_credit_applied:
    fieldCode: "78"
    meaning: Cuotas pendientes de compensación from previous periods applied in this return
    mapsTo: tax_report_facts
  prior_credit_available:
    fieldCode: "110"
    meaning: Cuotas a compensar from previous periods before current application
    mapsTo: tax_report_facts
  prior_credit_remaining:
    fieldCode: "87"
    meaning: Cuotas a compensar from previous periods pending after this return
    mapsTo: tax_carryforwards.kind=vat_credit
```

Result mapping must follow AEAT instructions:

* `payable`: `casilla 71` is positive and the declaration is presented as `a ingresar`.
* `refund_requested`: `casilla 71` is negative and refund is requested.
* `compensate`: `casilla 71` is negative and the amount is carried forward to compensate.
* `zero`: `casilla 71` is zero.
* `no_activity`: declaration marks no VAT accrued or supported in the period.

`390`: annual VAT summary.

Extract:

* fiscal year
* annual VAT totals
* annual activity and volume facts
* annual summary fields needed to compare against all `303` reports in the same year

`130`: IRPF fractional payment for autónomos in direct estimation.

Extract:

* fiscal year and quarter
* cumulative income and expenses where present
* payment amount
* prior instalments
* retentions
* profit or loss indicators

Minimum facts:

```yaml
130:
  ordinary_income_ytd:
    fieldCode: "01"
    meaning: Ingresos fiscalmente computables accumulated from year start to quarter end
    mapsTo: tax_report_facts and SpainTaxPosition.autonomoIrpf.ytdIncome
  deductible_expenses_ytd:
    fieldCode: "02"
    meaning: Fiscal deductible expenses accumulated from year start to quarter end
    mapsTo: tax_report_facts and SpainTaxPosition.autonomoIrpf.ytdExpenses
  net_result_ytd:
    fieldCode: "03"
    meaning: Casilla 01 minus casilla 02; may be negative
    mapsTo: taxReport.profitOrLoss and SpainTaxPosition.autonomoIrpf.ytdNetProfitOrLoss
  percentage_result:
    fieldCode: "04"
    meaning: Percentage payment base, zero when casilla 03 is negative
    mapsTo: tax_report_facts
  prior_quarter_payments:
    fieldCode: "05"
    meaning: Prior positive model 130 payments for same fiscal year, adjusted by casilla 16
    mapsTo: tax_carryforwards.kind=installment_credit when useful
  retentions_ytd:
    fieldCode: "06"
    meaning: Retentions and payments on account borne during the YTD period
    mapsTo: taxReport.retainedAmount and tax_report_facts for the Modelo 130 MVP
  partial_result:
    fieldCode: "07"
    meaning: Casilla 04 minus casillas 05 and 06; may be negative
    mapsTo: tax_report_facts
  total_liquidation:
    fieldCode: "12"
    meaning: Sum of casillas 07 and 11, floored at zero
    mapsTo: tax_report_facts
  after_minoracion:
    fieldCode: "14"
    meaning: Casilla 12 minus casilla 13; may be negative
    mapsTo: tax_report_facts
  prior_negative_results_applied:
    fieldCode: "15"
    meaning: Negative casilla 19 results from previous quarters in the same year applied now
    mapsTo: tax_report_facts
  result_before_complementary:
    fieldCode: "17"
    meaning: Casilla 14 minus casillas 15 and 16; may be negative
    mapsTo: tax_report_facts
  prior_complementary_income:
    fieldCode: "18"
    meaning: Prior result to pay for same concept/year/period in complementary declarations
    mapsTo: tax_report_facts
  final_result:
    fieldCode: "19"
    meaning: Final payment or negative result; negative values can be deducted in later payments of same fiscal year
    mapsTo: taxReport.resultAmount
```

`Modelo 130` negative carry behavior:

* Negative `casilla 03` is a declared YTD activity loss/profit indicator. Store it as `taxReport.profitOrLoss`, not as a future-year tax-loss carryforward.
* Negative `casilla 19` may be deducted in later positive `Modelo 130` payments of the same fiscal year. Store it as `installment_credit` with an expiry at the fiscal-year end, not as a corporate tax loss.
* `SpainTaxPosition.autonomoIrpf.negativeToDeductSameYear` sums active or needs-review `installment_credit` carryforwards from the same fiscal year, so an earlier-quarter balance remains visible even when the latest `130` does not recreate the row.
* Fourth-quarter negative `casilla 19` is a negative declaration state for that payment model; do not carry it to the next fiscal year unless a later official declaration explicitly creates a credit.

`200`: corporate income tax.

Extract:

* fiscal year
* accounting result
* taxable base
* tax due
* payments on account
* retentions
* result amount
* tax loss or carry-forward fields when available

Minimum facts:

```yaml
200:
  accounting_result:
    fieldCode: "00500"
    meaning: Resultado de la cuenta de pérdidas y ganancias
    mapsTo: SpainTaxPosition.corporateIncome.accountingResult
  accounting_result_before_tax:
    fieldCode: "00501"
    meaning: Resultado de la cuenta de pérdidas y ganancias antes del Impuesto sobre Sociedades
    mapsTo: tax_report_facts
  pre_compensation_taxable_base:
    fieldCode: "00550"
    meaning: Base imponible before capitalisation reserve and negative-base compensation
    mapsTo: SpainTaxPosition.corporateIncome.preCompensationTaxableBase
  prior_negative_base_applied:
    fieldCode: "00547"
    meaning: Compensación de bases imponibles negativas de períodos anteriores
    mapsTo: SpainTaxPosition.corporateIncome.priorNegativeBaseApplied
  taxable_base:
    fieldCode: "00552"
    meaning: Base imponible after reserve and negative-base compensation
    mapsTo: taxReport.taxableBase and SpainTaxPosition.corporateIncome.taxableBase
  result_amount:
    fieldCode: "01586"
    meaning: Resultado de la liquidación
    mapsTo: taxReport.resultAmount
```

Page-15 negative-base detail:

```yaml
200_negative_base_detail:
  originFiscalYear:
    source: row year in Detalle de bases imponibles negativas
  pendingAtStartOrGenerated:
    meaning: Pendiente de aplicación a principio del período / generada en el período
    mapsTo: tax_carryforwards.originalAmount
  appliedThisReturn:
    meaning: Aplicado en esta liquidación
    mapsTo: tax_carryforwards.usedAmount
  pendingForFuture:
    meaning: Pendiente de aplicación en períodos futuros
    mapsTo: tax_carryforwards.remainingAmount
```

`Modelo 200` negative-base carry behavior:

* If `casilla 00552` is negative, store `taxReport.profitOrLoss` as a negative value and create or update a `tax_loss` carryforward candidate when the declaration or detail table supports it.
* If page-15 detail is present, it is the source of truth for `tax_loss` rows by origin fiscal year.
* If page-15 detail is missing but `casilla 00552` is negative, create a `tax_loss` carryforward with `status = "needs_review"` and warning `model_200_negative_base_detail_missing`.
* `SpainTaxPosition.corporateIncome.remainingCompensableNegativeBase` sums active or needs-review `tax_loss` carryforwards for the company through the requested fiscal year, including balances generated by prior `200` filings.
* `casilla 00547` reduces prior negative-base carryforwards; it should not create a new loss.
* Positive taxable base is a declared profit/taxable-base position, but should not create a carryforward unless another official field creates future tax effect.

## Later-Compatible Forms

The shared model should not block later support for:

* `111`: withholding on employment or professional income
* `115`: withholding on rentals
* `190`: annual withholding summary for employment or professional income
* `180`: annual rental withholding summary

## Result Mapping

Map Spain-specific declaration outcomes into shared `TaxReportResult`:

* `payable`: positive amount to pay or direct debit
* `refund_requested`: negative result with refund requested
* `compensate`: negative result carried forward instead of refunded
* `zero`: zero result
* `no_activity`: no VAT accrued or supported in the period
* `informational`: annual summaries or forms without a direct payment/refund result
* `unknown`: parser could not safely determine the result

## Field Facts

Spain field facts should use:

```ts
fieldSystem: "casilla"
```

Use the AEAT numbered box as `fieldCode` and keep the original Spanish label when OCR or parser templates can identify it.

## Carryforward Focus

The Spain module should create carryforward candidates for:

* VAT credit to compensate in later periods
* refund credits when refund is requested but not yet confirmed
* retentions and payments on account from IRPF or corporate income filings
* tax losses or negative taxable bases from corporate income filings

Carryforwards created from a superseded declaration must be marked `superseded` when a corrective report replaces the original.

Detailed semantics:

```yaml
vat_credit:
  sources:
    - modelo_303 casilla 72
    - modelo_303 casilla 87
    - modelo_390 annual VAT evidence when available
  notes: Represents VAT amount pending compensation or refund confirmation.

tax_loss:
  sources:
    - modelo_200 page-15 negative-base detail
    - modelo_200 casilla 00552 when negative and detail is unavailable
  notes: Represents corporate negative taxable base pending future compensation.

installment_credit:
  sources:
    - modelo_130 negative casilla 19 for Q1-Q3
    - modelo_130 prior payments and payment-on-account facts
    - modelo_200 payments on account when later mapped
  notes: Modelo 130 negative amounts are same-year only unless later official evidence says otherwise.

withholding_credit:
  sources:
    - modelo_130 casilla 06 when later reconciliation can avoid duplicate YTD balances
    - modelo_200 retentions and payments on account when later mapped
  notes: Retentions are declared credits/payments, not business profit. Modelo 130 casilla 06 is YTD and is stored as retainedAmount plus a fact in the MVP; active withholding_credit carryforwards require later reconciliation logic to avoid double-counting quarterly YTD values.
```

Accumulated profits are not carryforwards by default. They should be exposed through the Spanish tax-position summary from `Modelo 130` or `Modelo 200` facts. Only losses, credits, or other amounts with future tax effect should create `tax_carryforwards` rows.

## Spanish Company Profile Assumptions

The Business API currently has one owned company card and does not yet expose a full Spanish tax profile. The Spain module should work from ingested forms first and emit warnings for ambiguity.

Future company card or tax profile fields should include:

```ts
type SpainTaxProfile = {
  countryCode: "ES";
  taxpayerType: "autonomo_irpf_direct" | "corporate_income" | "unknown";
  vatPeriodicity?: "monthly" | "quarterly" | "unknown";
  expectedForms: Array<"303" | "390" | "130" | "200" | "111" | "115" | "180" | "190">;
};
```

Defaults until this exists:

* If `130` reports exist, assume the company card has an autónomo/direct-estimation tax position for those fiscal years.
* If `200` reports exist, assume the company card has a corporate-income tax position for those fiscal years.
* If both `130` and `200` appear under the same company card and fiscal year, keep both sets of facts but emit `mixed_spanish_income_tax_profiles`.
* Scope every result by `companyCardId`; do not merge tax positions across company cards.
* Use `countryCode = "ES"` per report, not as global workspace state.

## Tests

Add Spain parser fixtures for:

* Modelo 303 payable quarterly return
* Modelo 303 compensation or refund return
* Modelo 303 no-activity return
* Modelo 390 annual summary
* Modelo 130 with retentions or instalments
* Modelo 200 with loss or carry-forward facts

MVP acceptance cases:

* `303` payable return maps `casilla 71` to positive `resultAmount`, `result = "payable"`, and payment status starts `unpaid` unless payment evidence is linked.
* `303` compensation return creates or updates `vat_credit` from `casilla 72` or `87`.
* `303` refund return maps to `refund_requested` and creates refund tracking until receipt is linked.
* `303` zero and no-activity returns map to `zero` and `no_activity` without payment requirement.
* `130` positive YTD net result maps `casilla 03` to `profitOrLoss` and the Spanish tax-position summary.
* `130` negative YTD net result maps `casilla 03` to negative `profitOrLoss` without creating a future-year `tax_loss`.
* `130` negative `casilla 19` creates same-year `installment_credit` only for later positive payments of that fiscal year.
* `200` with positive taxable base and `casilla 00547` reduces prior negative-base carryforward usage.
* `200` with negative `casilla 00552` and page-15 detail creates or preserves `tax_loss` rows by origin fiscal year.
* Spanish tax-position summary returns warnings when expected `130` or `200` declarations are missing for the inferred profile.
