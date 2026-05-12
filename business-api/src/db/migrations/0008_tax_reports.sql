CREATE TABLE IF NOT EXISTS tax_reports (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  country_code TEXT NOT NULL,
  jurisdiction TEXT,
  tax_kind TEXT NOT NULL,
  form_code TEXT NOT NULL,
  form_name TEXT,
  form_version TEXT,
  fiscal_year INTEGER NOT NULL,
  period_granularity TEXT NOT NULL,
  period_label TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  taxpayer_tax_id TEXT,
  authority_submission_id TEXT,
  authority_receipt_number TEXT,
  filed_at TEXT,
  due_date TEXT,
  payment_due_date TEXT,
  status TEXT NOT NULL DEFAULT 'filed',
  result TEXT NOT NULL DEFAULT 'unknown',
  payment_status TEXT NOT NULL DEFAULT 'unknown',
  currency TEXT NOT NULL,
  taxable_base TEXT,
  tax_due TEXT,
  tax_deductible TEXT,
  result_amount TEXT,
  retained_amount TEXT,
  profit_or_loss TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium',
  fingerprint TEXT NOT NULL,
  extracted_data_json TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  correction_of_tax_report_id TEXT REFERENCES tax_reports(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS tax_reports_company_country_kind_year_idx
  ON tax_reports(company_card_id, country_code, tax_kind, fiscal_year);
CREATE INDEX IF NOT EXISTS tax_reports_status_idx
  ON tax_reports(status);
CREATE INDEX IF NOT EXISTS tax_reports_payment_status_idx
  ON tax_reports(payment_status);
CREATE INDEX IF NOT EXISTS tax_reports_period_idx
  ON tax_reports(period_end, period_start);
CREATE INDEX IF NOT EXISTS tax_reports_form_idx
  ON tax_reports(country_code, form_code);
CREATE INDEX IF NOT EXISTS tax_reports_correction_idx
  ON tax_reports(correction_of_tax_report_id);
CREATE UNIQUE INDEX IF NOT EXISTS tax_reports_company_fingerprint_unique_idx
  ON tax_reports(company_card_id, fingerprint);

CREATE TABLE IF NOT EXISTS tax_report_facts (
  id TEXT PRIMARY KEY,
  tax_report_id TEXT NOT NULL REFERENCES tax_reports(id),
  country_code TEXT NOT NULL,
  form_code TEXT NOT NULL,
  field_code TEXT NOT NULL,
  field_system TEXT NOT NULL,
  label TEXT,
  value_type TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT,
  currency TEXT,
  rate TEXT,
  direction TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS tax_report_facts_report_idx
  ON tax_report_facts(tax_report_id);
CREATE INDEX IF NOT EXISTS tax_report_facts_field_idx
  ON tax_report_facts(country_code, form_code, field_system, field_code);

CREATE TABLE IF NOT EXISTS tax_carryforwards (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  country_code TEXT NOT NULL,
  jurisdiction TEXT,
  tax_kind TEXT NOT NULL,
  kind TEXT NOT NULL,
  origin_tax_report_id TEXT NOT NULL REFERENCES tax_reports(id),
  origin_fiscal_year INTEGER NOT NULL,
  origin_period_label TEXT NOT NULL,
  currency TEXT NOT NULL,
  original_amount TEXT NOT NULL,
  used_amount TEXT NOT NULL DEFAULT '0.00',
  remaining_amount TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS tax_carryforwards_company_kind_status_year_idx
  ON tax_carryforwards(company_card_id, kind, status, origin_fiscal_year);
CREATE INDEX IF NOT EXISTS tax_carryforwards_origin_report_idx
  ON tax_carryforwards(origin_tax_report_id);
CREATE INDEX IF NOT EXISTS tax_carryforwards_country_tax_kind_idx
  ON tax_carryforwards(country_code, tax_kind);

CREATE TABLE IF NOT EXISTS tax_report_payment_links (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  tax_report_id TEXT NOT NULL REFERENCES tax_reports(id),
  bank_transaction_id TEXT REFERENCES bank_transactions(id),
  document_id TEXT REFERENCES documents(id),
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  paid_at TEXT,
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'suggested',
  confidence TEXT NOT NULL DEFAULT 'medium',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS tax_report_payment_links_report_status_idx
  ON tax_report_payment_links(tax_report_id, status);
CREATE INDEX IF NOT EXISTS tax_report_payment_links_bank_transaction_idx
  ON tax_report_payment_links(bank_transaction_id);
CREATE INDEX IF NOT EXISTS tax_report_payment_links_document_idx
  ON tax_report_payment_links(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS tax_report_payment_links_unique_bank_transaction_idx
  ON tax_report_payment_links(tax_report_id, bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_report_payment_links_unique_document_idx
  ON tax_report_payment_links(tax_report_id, document_id)
  WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_report_payment_links_unique_payment_reference_idx
  ON tax_report_payment_links(tax_report_id, payment_reference)
  WHERE payment_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_report_payment_links_unique_evidence_idx
  ON tax_report_payment_links(tax_report_id, bank_transaction_id, document_id, payment_reference)
  WHERE bank_transaction_id IS NOT NULL
    AND document_id IS NOT NULL
    AND payment_reference IS NOT NULL;
