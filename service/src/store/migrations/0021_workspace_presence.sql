CREATE TABLE IF NOT EXISTS workspace_presence (
  source_id TEXT NOT NULL,
  workspace_key TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  status TEXT NOT NULL CHECK(status IN ('open','closed','uncertain')),
  observed_at TEXT NOT NULL,
  PRIMARY KEY(source_id, workspace_key)
);
CREATE INDEX IF NOT EXISTS workspace_presence_project ON workspace_presence(project_id, status);
INSERT OR IGNORE INTO meta(key,value) VALUES('session_source_authorization_enabled',0);
UPDATE meta SET value=21 WHERE key='schema_version';
