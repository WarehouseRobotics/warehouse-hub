CREATE TABLE IF NOT EXISTS payrolls (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  employee_contact_id TEXT NOT NULL REFERENCES contacts(id),
  document_id TEXT REFERENCES documents(id),
  payroll_number TEXT,
  country_code TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  payment_date TEXT,
  currency TEXT NOT NULL,
  gross_salary TEXT NOT NULL,
  net_salary TEXT NOT NULL,
  employee_tax_withheld TEXT NOT NULL DEFAULT '0.00',
  employee_social_contributions TEXT NOT NULL DEFAULT '0.00',
  employer_social_contributions TEXT NOT NULL DEFAULT '0.00',
  other_deductions TEXT NOT NULL DEFAULT '0.00',
  other_earnings TEXT NOT NULL DEFAULT '0.00',
  raw_lines TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS payrolls_employee_contact_id_idx ON payrolls(employee_contact_id);
CREATE INDEX IF NOT EXISTS payrolls_period_idx ON payrolls(period_start, period_end);
