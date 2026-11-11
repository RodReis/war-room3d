CREATE INDEX IF NOT EXISTS events_activity_window ON events (
  json_extract(event_json,'$.projectId'), json_extract(event_json,'$.observedAt')
);
CREATE INDEX IF NOT EXISTS events_activity_coverage ON events (
  json_extract(event_json,'$.projectId'), json_extract(event_json,'$.type')
);
UPDATE meta SET value=22 WHERE key='schema_version';
