CREATE TABLE project_repository_link_periods (
  id INTEGER PRIMARY KEY,
  repository_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  unlinked_at TEXT,
  FOREIGN KEY(repository_id,project_id) REFERENCES project_repositories(repository_id,project_id),
  UNIQUE(repository_id,project_id,linked_at)
);
CREATE INDEX project_repository_link_periods_project_time ON project_repository_link_periods(project_id,repository_id,linked_at,unlinked_at);
INSERT INTO project_repository_link_periods(repository_id,project_id,linked_at,unlinked_at)
  SELECT repository_id,project_id,linked_at,unlinked_at FROM project_repositories;
UPDATE meta SET value=8 WHERE key='schema_version';
