DROP INDEX IF EXISTS users_email_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS users_workspace_email_active_unique_idx
  ON users(workspace_id, email)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_workspace_owner_active_unique_idx
  ON users(workspace_id)
  WHERE role = 'owner' AND deleted_at IS NULL;
