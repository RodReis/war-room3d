CREATE TABLE IF NOT EXISTS infra_environments (
  environment_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);
CREATE TABLE IF NOT EXISTS infra_resources (
  resource_id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES infra_environments(environment_id),
  kind TEXT NOT NULL CHECK(kind IN ('host', 'docker', 'api', 'database')),
  name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  stale_after_ms INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);
CREATE TABLE IF NOT EXISTS infra_project_resources (
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  resource_id TEXT NOT NULL REFERENCES infra_resources(resource_id),
  origin TEXT NOT NULL,
  confidence TEXT NOT NULL,
  PRIMARY KEY(project_id, resource_id)
);
CREATE TABLE IF NOT EXISTS infra_dependencies (
  dependent_resource_id TEXT NOT NULL REFERENCES infra_resources(resource_id),
  dependency_resource_id TEXT NOT NULL REFERENCES infra_resources(resource_id),
  origin TEXT NOT NULL,
  confidence TEXT NOT NULL,
  PRIMARY KEY(dependent_resource_id, dependency_resource_id)
);
CREATE TABLE IF NOT EXISTS infra_source_status (
  source_id TEXT PRIMARY KEY,
  last_lost_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS infra_resource_status (
  resource_id TEXT PRIMARY KEY REFERENCES infra_resources(resource_id),
  last_failed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS infra_readings (
  id INTEGER PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES infra_resources(resource_id),
  source_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  health TEXT NOT NULL CHECK(health IN ('saudavel', 'degradado', 'indisponivel', 'sem_dados')),
  observed_at TEXT NOT NULL,
  evidence_ref TEXT,
  indicator TEXT,
  value REAL,
  unit TEXT,
  recorded_at TEXT NOT NULL,
  UNIQUE(resource_id, source_id, observed_at)
);
CREATE TABLE IF NOT EXISTS infra_latest (
  resource_id TEXT PRIMARY KEY REFERENCES infra_resources(resource_id),
  reading_id INTEGER NOT NULL REFERENCES infra_readings(id)
);
CREATE TABLE IF NOT EXISTS infra_incidents (
  incident_id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES infra_resources(resource_id),
  opened_at TEXT NOT NULL,
  opened_health TEXT NOT NULL CHECK(opened_health IN ('degradado', 'indisponivel')),
  evidence_ref TEXT NOT NULL,
  resolved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS infra_one_open_incident ON infra_incidents(resource_id) WHERE resolved_at IS NULL;
UPDATE meta SET value = 2 WHERE key = 'schema_version' AND value < 2;
