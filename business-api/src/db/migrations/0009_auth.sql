CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_unique_idx
  ON workspaces(slug);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS users_workspace_id_idx
  ON users(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users(email);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
  ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx
  ON user_sessions(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_token_hash_idx
  ON user_sessions(token_hash);

CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scopes TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS personal_access_tokens_user_id_idx
  ON personal_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS personal_access_tokens_expires_at_idx
  ON personal_access_tokens(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS personal_access_tokens_token_hash_idx
  ON personal_access_tokens(token_hash);

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS magic_link_tokens_email_idx
  ON magic_link_tokens(email);
CREATE INDEX IF NOT EXISTS magic_link_tokens_expires_at_idx
  ON magic_link_tokens(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS magic_link_tokens_token_hash_idx
  ON magic_link_tokens(token_hash);

CREATE TABLE IF NOT EXISTS user_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  magic_link_token_id TEXT NOT NULL REFERENCES magic_link_tokens(id),
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_invitations_email_idx
  ON user_invitations(email);
CREATE INDEX IF NOT EXISTS user_invitations_invited_by_user_id_idx
  ON user_invitations(invited_by_user_id);
CREATE INDEX IF NOT EXISTS user_invitations_magic_link_token_id_idx
  ON user_invitations(magic_link_token_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id TEXT REFERENCES users(id),
  actor_token_id TEXT REFERENCES personal_access_tokens(id),
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_at_idx
  ON audit_log(at);
CREATE INDEX IF NOT EXISTS audit_log_actor_user_id_idx
  ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_object_idx
  ON audit_log(object_type, object_id);
