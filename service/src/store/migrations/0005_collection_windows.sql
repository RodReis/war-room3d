CREATE TABLE IF NOT EXISTS github_poll_attempts (
  id INTEGER PRIMARY KEY,
  repository_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','api_error','rate_limited'))
);
CREATE INDEX IF NOT EXISTS github_poll_attempts_day ON github_poll_attempts(started_at, repository_id);
UPDATE meta SET value=5 WHERE key='schema_version';
