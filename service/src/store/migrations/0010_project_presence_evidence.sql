CREATE TABLE IF NOT EXISTS project_presence_evidence (
  project_id TEXT PRIMARY KEY REFERENCES projects(project_id),
  known_at TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('registration','migration'))
);
INSERT OR IGNORE INTO project_presence_evidence(project_id,known_at,evidence_kind)
  SELECT project_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration' FROM projects;
UPDATE meta SET value=10 WHERE key='schema_version';
