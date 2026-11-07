ALTER TABLE github_poll_attempts ADD COLUMN expected_interval_ms INTEGER;
UPDATE meta SET value=7 WHERE key='schema_version';
