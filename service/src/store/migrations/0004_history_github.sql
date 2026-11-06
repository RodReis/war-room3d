CREATE TABLE project_repositories (
  repository_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  linked_at TEXT NOT NULL,
  unlinked_at TEXT,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(repository_id, project_id)
);
CREATE INDEX project_repositories_active ON project_repositories(active, repository_id);
CREATE TABLE history_milestones (
  repository_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('pull_request','workflow')),
  entity_id TEXT NOT NULL,
  transition TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(repository_id, entity_type, entity_id, transition)
);
CREATE INDEX history_milestones_time ON history_milestones(occurred_at);
ALTER TABLE history_milestones ADD COLUMN stream_sequence INTEGER NOT NULL DEFAULT 0;
CREATE TABLE history_effects (
  causation_id TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  occurred_at TEXT NOT NULL,
  stream_sequence INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL CHECK(duration_ms BETWEEN 0 AND 60000),
  parameters_json TEXT NOT NULL,
  PRIMARY KEY(causation_id, effect_type)
);
CREATE TABLE history_incidents (
  incident_id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  workflow_id INTEGER NOT NULL,
  run_id INTEGER NOT NULL,
  ref TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  last_attempt INTEGER NOT NULL,
  evidence_url TEXT NOT NULL
);
CREATE UNIQUE INDEX history_one_open_ci_incident ON history_incidents(repository_id, workflow_id, run_id, ref, head_sha) WHERE resolved_at IS NULL;
ALTER TABLE state_changes RENAME TO state_changes_v3;
CREATE TABLE state_changes (
  stream_sequence INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('project.changed', 'resource.changed', 'dependency.changed', 'history.changed')),
  object_id TEXT,
  observed_at TEXT NOT NULL
);
INSERT INTO state_changes(stream_sequence,type,object_id,observed_at)
  SELECT stream_sequence,type,object_id,observed_at FROM state_changes_v3;
DROP TABLE state_changes_v3;
UPDATE meta SET value=4 WHERE key='schema_version';
