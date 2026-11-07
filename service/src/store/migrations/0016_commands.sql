CREATE TABLE IF NOT EXISTS commands (
  command_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('requested','validated','sending','confirmed','rejected','expired','unknown')),
  reason TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS command_audit (
  sequence INTEGER PRIMARY KEY,
  command_id TEXT NOT NULL REFERENCES commands(command_id),
  state TEXT NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS command_audit_id ON command_audit(command_id,sequence);
CREATE TABLE IF NOT EXISTS command_request_claims (
  session_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES commands(command_id),
  PRIMARY KEY(session_key,request_id)
);
UPDATE meta SET value = 16 WHERE key = 'schema_version';
