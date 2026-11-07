CREATE TABLE history_github_observations (
  event_id TEXT PRIMARY KEY REFERENCES events(event_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('pull_request','workflow')),
  entity_id TEXT NOT NULL,
  transition TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
CREATE INDEX history_github_observations_identity ON history_github_observations(repository_id,project_id,entity_type,entity_id,transition);
UPDATE meta SET value=14 WHERE key='schema_version';
