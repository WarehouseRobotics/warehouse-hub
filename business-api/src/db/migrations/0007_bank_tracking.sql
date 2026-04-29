CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  bank_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  masked_identifier TEXT,
  iban_masked TEXT,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS bank_accounts_status_idx ON bank_accounts(status);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  document_id TEXT REFERENCES documents(id),
  transaction_date TEXT NOT NULL,
  posted_at TEXT,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  description TEXT NOT NULL,
  counterparty_name TEXT,
  reference TEXT,
  running_balance TEXT,
  source TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium',
  kind TEXT NOT NULL DEFAULT 'bank_transaction',
  status TEXT NOT NULL DEFAULT 'recorded',
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS bank_transactions_account_date_idx ON bank_transactions(bank_account_id, transaction_date);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON bank_transactions(status);
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_account_fingerprint_unique_idx
  ON bank_transactions(bank_account_id, fingerprint);

CREATE TABLE IF NOT EXISTS bank_balance_snapshots (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  document_id TEXT REFERENCES documents(id),
  observed_at TEXT NOT NULL,
  balance TEXT NOT NULL,
  currency TEXT NOT NULL,
  source TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium',
  notes TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS bank_balance_snapshots_account_observed_idx
  ON bank_balance_snapshots(bank_account_id, observed_at);

CREATE TABLE IF NOT EXISTS bank_transaction_matches (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  bank_transaction_id TEXT NOT NULL REFERENCES bank_transactions(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested',
  confidence TEXT NOT NULL DEFAULT 'medium',
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS bank_transaction_matches_transaction_idx
  ON bank_transaction_matches(bank_transaction_id);
CREATE INDEX IF NOT EXISTS bank_transaction_matches_target_idx
  ON bank_transaction_matches(target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_transaction_matches_unique_idx
  ON bank_transaction_matches(bank_transaction_id, target_type, target_id);
