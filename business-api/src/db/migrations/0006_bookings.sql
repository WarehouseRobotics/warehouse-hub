CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  company_card_id TEXT NOT NULL REFERENCES company_card(id),
  customer_contact_id TEXT NOT NULL REFERENCES contacts(id),
  project_id TEXT REFERENCES projects(id),
  deal_id TEXT REFERENCES deals(id),
  task_id TEXT REFERENCES tasks(id),
  sales_invoice_id TEXT REFERENCES sales_invoices(id),
  title TEXT NOT NULL,
  service_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'tentative',
  scheduled_start_at TEXT NOT NULL,
  scheduled_end_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  location TEXT,
  assigned_contact_ids TEXT NOT NULL,
  notes TEXT,
  completion_notes TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS bookings_customer_contact_id_idx ON bookings(customer_contact_id);
CREATE INDEX IF NOT EXISTS bookings_project_id_idx ON bookings(project_id);
CREATE INDEX IF NOT EXISTS bookings_deal_id_idx ON bookings(deal_id);
CREATE INDEX IF NOT EXISTS bookings_scheduled_idx ON bookings(scheduled_start_at, scheduled_end_at);

CREATE TABLE IF NOT EXISTS booking_assignment_profiles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  contact_id TEXT NOT NULL UNIQUE REFERENCES contacts(id),
  is_bookable INTEGER NOT NULL DEFAULT 1,
  timezone TEXT NOT NULL,
  weekly_availability TEXT NOT NULL,
  buffer_before_minutes INTEGER,
  buffer_after_minutes INTEGER,
  max_bookings_per_day INTEGER,
  booking_types TEXT,
  effective_from TEXT,
  effective_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS booking_assignment_profiles_contact_id_idx ON booking_assignment_profiles(contact_id);

CREATE TABLE IF NOT EXISTS booking_availability_exceptions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  kind TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS booking_availability_exceptions_contact_window_idx
  ON booking_availability_exceptions(contact_id, start_at, end_at);
