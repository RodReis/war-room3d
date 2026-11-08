-- A coluna last_evidence_at é adicionada pelo construtor após verificar table_info,
-- pois os testes de migração recriam versões legadas com a coluna já presente.
UPDATE meta SET value = 19 WHERE key = 'schema_version';
