CREATE TABLE IF NOT EXISTS data_caches (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  key_type TEXT NOT NULL,
  value_schema TEXT NOT NULL,
  fetcher_config TEXT,
  default_ttl_days INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_cache_entries (
  id TEXT PRIMARY KEY,
  cache_id TEXT NOT NULL REFERENCES data_caches(id),
  entry_key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS data_cache_entries_cache_key_unique_idx
  ON data_cache_entries(cache_id, entry_key);
CREATE INDEX IF NOT EXISTS data_cache_entries_cache_key_idx
  ON data_cache_entries(cache_id, entry_key);
CREATE INDEX IF NOT EXISTS data_cache_entries_cache_created_idx
  ON data_cache_entries(cache_id, created_at DESC);
