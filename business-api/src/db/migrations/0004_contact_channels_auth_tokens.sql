ALTER TABLE contacts ADD COLUMN slack_user_id TEXT;
ALTER TABLE contacts ADD COLUMN discord_user_id TEXT;
ALTER TABLE contacts ADD COLUMN whatsapp_user_id TEXT;
ALTER TABLE contacts ADD COLUMN telegram_user_id TEXT;
ALTER TABLE contacts ADD COLUMN notification_preferences TEXT;

CREATE TABLE IF NOT EXISTS contact_auth_tokens (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_auth_tokens_token_hash_idx
  ON contact_auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS contact_auth_tokens_contact_id_idx
  ON contact_auth_tokens(contact_id);
CREATE INDEX IF NOT EXISTS contact_auth_tokens_expires_at_idx
  ON contact_auth_tokens(expires_at);
