CREATE TABLE state_changes (
  stream_sequence INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('project.changed', 'resource.changed', 'dependency.changed')),
  object_id TEXT,
  observed_at TEXT NOT NULL
);
INSERT INTO meta(key, value) VALUES ('transport_baseline',
  CASE WHEN (SELECT value FROM meta WHERE key = 'revision') > 0 OR EXISTS(SELECT 1 FROM projects)
    THEN (SELECT value FROM meta WHERE key = 'stream_sequence') ELSE -1 END);
UPDATE meta SET value = value + 1 WHERE key = 'stream_sequence' AND (SELECT value FROM meta WHERE key = 'transport_baseline') >= 0;
UPDATE meta SET value = 3 WHERE key = 'schema_version';
