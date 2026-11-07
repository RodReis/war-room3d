CREATE TABLE IF NOT EXISTS github_page_cache (
  url TEXT PRIMARY KEY,
  etag TEXT NOT NULL,
  next_url TEXT,
  saved_at TEXT NOT NULL
);
UPDATE meta SET value=6 WHERE key='schema_version';
