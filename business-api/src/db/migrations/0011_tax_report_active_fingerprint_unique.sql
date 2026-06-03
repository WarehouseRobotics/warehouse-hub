DROP INDEX IF EXISTS tax_reports_company_fingerprint_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS tax_reports_company_fingerprint_unique_idx
  ON tax_reports(company_card_id, fingerprint)
  WHERE deleted_at IS NULL;
