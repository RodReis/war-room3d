CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta(key, value) VALUES ('revision', 0), ('stream_sequence', 0), ('schema_version', 1);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_paths (
  path TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id)
);
CREATE TABLE IF NOT EXISTS room_placements (
  project_id TEXT PRIMARY KEY REFERENCES projects(project_id),
  sector_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  layout_version TEXT NOT NULL,
  UNIQUE(sector_id, slot_id)
);
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  stream_sequence INTEGER NOT NULL UNIQUE,
  event_json TEXT NOT NULL,
  UNIQUE(source_id, dedupe_key)
);
CREATE TABLE IF NOT EXISTS source_cursors (
  source_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  PRIMARY KEY(source_id, file_key)
);
CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('atual', 'desatualizado', 'indisponivel')),
  status_at TEXT NOT NULL,
  last_unavailable_at TEXT,
  last_received TEXT,
  last_applied TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  session_key TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  source_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('claude', 'codex')),
  presence TEXT NOT NULL,
  freshness TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  source_unavailable_at TEXT
);
CREATE TABLE IF NOT EXISTS agents (
  agent_key TEXT PRIMARY KEY,
  session_key TEXT NOT NULL REFERENCES sessions(session_key),
  parent_agent_key TEXT,
  presence TEXT NOT NULL,
  parent_status TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quarantine (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('schema_invalid', 'unknown_project')),
  recorded_at TEXT NOT NULL,
  UNIQUE(source_id, file_key, generation, offset, reason)
);
