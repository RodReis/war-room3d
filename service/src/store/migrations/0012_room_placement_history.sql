CREATE TABLE IF NOT EXISTS room_placement_versions (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  sector_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  layout_version TEXT NOT NULL,
  known_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS room_placement_versions_project_time ON room_placement_versions(project_id,known_at,id);
INSERT INTO room_placement_versions(project_id,sector_id,slot_id,layout_version,known_at)
  SELECT project_id,sector_id,slot_id,layout_version,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM room_placements
  WHERE NOT EXISTS(SELECT 1 FROM room_placement_versions);
UPDATE meta SET value=12 WHERE key='schema_version';
