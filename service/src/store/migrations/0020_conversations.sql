CREATE TABLE IF NOT EXISTS conversation_messages (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  session_key TEXT NOT NULL REFERENCES sessions(session_key),
  source_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('claude', 'codex')),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  native_ref TEXT,
  turn_ref TEXT,
  consent_ref TEXT NOT NULL,
  retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 30),
  expires_at TEXT NOT NULL,
  truncated INTEGER NOT NULL CHECK(truncated IN (0, 1))
);
CREATE INDEX IF NOT EXISTS conversation_page ON conversation_messages(project_id, session_key, sequence DESC);
CREATE INDEX IF NOT EXISTS conversation_expiry ON conversation_messages(expires_at);
CREATE TABLE IF NOT EXISTS conversation_deletions (
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  session_key TEXT NOT NULL REFERENCES sessions(session_key),
  deleted_through TEXT NOT NULL,
  PRIMARY KEY(project_id, session_key)
);
UPDATE meta SET value = 20 WHERE key = 'schema_version';
