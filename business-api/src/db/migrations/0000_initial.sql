CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_card (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tax_id TEXT,
  vat_id TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address_street1 TEXT,
  address_street2 TEXT,
  address_city TEXT,
  address_postal_code TEXT,
  address_country_code TEXT,
  currency TEXT NOT NULL,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  vat_mode TEXT NOT NULL DEFAULT 'standard',
  bank_iban_masked TEXT,
  bank_bic TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  parent_contact_id TEXT REFERENCES contacts(id),
  type TEXT NOT NULL,
  roles TEXT NOT NULL,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  billing_address_street1 TEXT,
  billing_address_street2 TEXT,
  billing_address_city TEXT,
  billing_address_postal_code TEXT,
  billing_address_country_code TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS contacts_parent_contact_id_idx ON contacts(parent_contact_id);
CREATE INDEX IF NOT EXISTS contacts_display_name_idx ON contacts(display_name);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  kind TEXT NOT NULL,
  source TEXT,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  checksum TEXT,
  storage_status TEXT NOT NULL DEFAULT 'stored',
  ocr_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  supplier_contact_id TEXT NOT NULL REFERENCES contacts(id),
  document_id TEXT REFERENCES documents(id),
  invoice_number TEXT,
  invoice_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL,
  net TEXT NOT NULL,
  tax TEXT NOT NULL,
  gross TEXT NOT NULL,
  tax_lines TEXT,
  line_items TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS expenses_supplier_contact_id_idx ON expenses(supplier_contact_id);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  customer_contact_id TEXT NOT NULL REFERENCES contacts(id),
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  currency TEXT NOT NULL,
  expected_close_date TEXT,
  line_items TEXT NOT NULL,
  net TEXT NOT NULL,
  tax TEXT NOT NULL,
  gross TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sales_invoices (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  invoice_number TEXT NOT NULL UNIQUE,  
  customer_contact_id TEXT NOT NULL REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  issue_date TEXT NOT NULL,
  service_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  line_items TEXT NOT NULL,
  net TEXT NOT NULL,
  tax TEXT NOT NULL,
  gross TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  pdf_document_id TEXT REFERENCES documents(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_number_seq (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_entity_id TEXT NOT NULL,
  owner_entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id),
  parent_task_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON tasks(parent_task_id);

CREATE TABLE IF NOT EXISTS entity_embeddings (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(entity_type, entity_id)
);
