CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  commentable_type TEXT NOT NULL,
  commentable_id TEXT NOT NULL,
  commentable_slug TEXT NOT NULL,
  body TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_contact_id TEXT REFERENCES contacts(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS comments_commentable_type_id_idx
  ON comments(commentable_type, commentable_id);
CREATE INDEX IF NOT EXISTS comments_commentable_type_slug_idx
  ON comments(commentable_type, commentable_slug);
CREATE INDEX IF NOT EXISTS comments_author_contact_id_idx
  ON comments(author_contact_id);
CREATE INDEX IF NOT EXISTS comments_created_at_idx
  ON comments(created_at);
