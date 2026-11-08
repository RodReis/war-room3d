CREATE TABLE IF NOT EXISTS operation_sources (
  source_id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  permissions_json TEXT NOT NULL,
  stale_after_ms INTEGER NOT NULL CHECK(stale_after_ms BETWEEN 1000 AND 31536000000),
  retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 3650),
  status TEXT NOT NULL CHECK(status IN ('active','denied','unavailable')),
  last_received_at TEXT
);
CREATE TABLE IF NOT EXISTS operation_source_category_status (
  source_id TEXT NOT NULL REFERENCES operation_sources(source_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('metric','log','trace','network','security_detection','security_report')),
  last_received_at TEXT NOT NULL,
  PRIMARY KEY(source_id, category)
);
CREATE TABLE IF NOT EXISTS operation_observations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES operation_sources(source_id),
  source_version TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  resource_id TEXT,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('metric','log','trace','network','security_detection','security_report')),
  classification TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK(confidence IN ('observed','derived','inferred')),
  evidence_ref TEXT NOT NULL,
  correlation_json TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  UNIQUE(source_id, observation_id)
);
CREATE INDEX IF NOT EXISTS operation_observations_query ON operation_observations(environment_id, category, sequence);
CREATE INDEX IF NOT EXISTS operation_observations_trace ON operation_observations(environment_id, json_extract(correlation_json, '$.traceId'));
CREATE TABLE IF NOT EXISTS operation_rules (
  rule_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  category TEXT NOT NULL CHECK(category IN ('network','security_detection')),
  field TEXT NOT NULL,
  operator TEXT NOT NULL CHECK(operator IN ('eq','gt','gte','lt','lte')),
  expected_value TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','low','medium','high','critical')),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  PRIMARY KEY(rule_id, version)
);
CREATE TABLE IF NOT EXISTS operation_incidents (
  incident_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES operation_sources(source_id),
  environment_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','acknowledged','resolved')),
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  resolution_reason TEXT,
  evidence_json TEXT NOT NULL,
  FOREIGN KEY(rule_id, rule_version) REFERENCES operation_rules(rule_id, version),
  UNIQUE(environment_id, resource_id, rule_id, rule_version)
);
CREATE TABLE IF NOT EXISTS operation_incident_events (
  event_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES operation_incidents(incident_id),
  transition TEXT NOT NULL CHECK(transition IN ('open','updated','acknowledged','resolved','reopened')),
  actor TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  reason TEXT,
  evidence_ref TEXT
);
UPDATE meta SET value = 18 WHERE key = 'schema_version';
