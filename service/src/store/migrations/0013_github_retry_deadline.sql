INSERT OR IGNORE INTO meta(key,value) VALUES ('github_retry_until_ms',0);
UPDATE meta SET value=13 WHERE key='schema_version';
