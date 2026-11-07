CREATE TABLE github_entity_cursors (
  repository_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('pull_request','workflow')),
  entity_id TEXT NOT NULL,
  remote_updated_at TEXT NOT NULL,
  transition TEXT NOT NULL,
  PRIMARY KEY(repository_id,project_id,entity_type,entity_id)
);
UPDATE meta SET value=15 WHERE key='schema_version';
