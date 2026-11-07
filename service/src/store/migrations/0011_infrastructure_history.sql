CREATE TABLE IF NOT EXISTS infra_inventory_versions (
  id INTEGER PRIMARY KEY,
  known_at TEXT NOT NULL,
  inventory_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS infra_inventory_versions_time ON infra_inventory_versions(known_at,id);
CREATE TABLE IF NOT EXISTS infra_status_events (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('source_lost','resource_failed')),
  subject_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS infra_status_events_time ON infra_status_events(observed_at,id);

INSERT INTO infra_inventory_versions(known_at,inventory_json)
SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), json_object(
  'schemaVersion','1.0',
  'environments',json((SELECT json_group_array(json_object('environmentId',environment_id,'name',name)) FROM infra_environments WHERE active=1)),
  'resources',json((SELECT json_group_array(json_object('resourceId',resource_id,'environmentId',environment_id,'kind',kind,'name',name,'sourceId',source_id,'staleAfterMs',stale_after_ms)) FROM infra_resources WHERE active=1)),
  'projectResources',json((SELECT json_group_array(json_object('projectId',project_id,'resourceId',resource_id,'origin',origin,'confidence',confidence)) FROM infra_project_resources)),
  'dependencies',json((SELECT json_group_array(json_object('dependentResourceId',dependent_resource_id,'dependencyResourceId',dependency_resource_id,'origin',origin,'confidence',confidence)) FROM infra_dependencies))
)
WHERE NOT EXISTS(SELECT 1 FROM infra_inventory_versions)
  AND (EXISTS(SELECT 1 FROM infra_environments WHERE active=1) OR EXISTS(SELECT 1 FROM infra_resources WHERE active=1));
INSERT INTO infra_status_events(kind,subject_id,observed_at,recorded_at)
SELECT 'source_lost',source_id,last_lost_at,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM infra_source_status
WHERE NOT EXISTS(SELECT 1 FROM infra_status_events);
INSERT INTO infra_status_events(kind,subject_id,observed_at,recorded_at)
SELECT 'resource_failed',resource_id,last_failed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM infra_resource_status
WHERE NOT EXISTS(SELECT 1 FROM infra_status_events WHERE kind='resource_failed');
UPDATE meta SET value=11 WHERE key='schema_version';
