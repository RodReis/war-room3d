CREATE TABLE IF NOT EXISTS workspace_source_bindings (
  source_id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id)
);
UPDATE meta SET value=23 WHERE key='schema_version';
