CREATE TABLE IF NOT EXISTS session_tasks (
  task_id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL REFERENCES sessions(session_key),
  agent_key TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('observada', 'trabalhando', 'aguardando', 'concluida_declarada', 'desconhecida')),
  provenance TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_invocations (
  invocation_id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL REFERENCES sessions(session_key),
  agent_key TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('tool', 'skill')),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('observada', 'resultado_observado', 'falha_observada', 'desconhecida')),
  last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_source_bindings (
  source_id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  provider TEXT NOT NULL,
  account_ref TEXT NOT NULL
);
UPDATE meta SET value = 17 WHERE key = 'schema_version';
