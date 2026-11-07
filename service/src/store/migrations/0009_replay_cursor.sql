INSERT OR IGNORE INTO meta(key,value) VALUES ('replay_baseline',0);
UPDATE meta SET value=9 WHERE key='schema_version';
