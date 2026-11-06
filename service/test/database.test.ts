import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClientConfig } from 'pg';
import { EventStore } from '../src/store/event-store.ts';
import { postgresProbe, type DatabaseSession, type PostgresTarget } from '../src/infra/connectors/database.ts';
import { CollectorRunner } from '../src/infra/connectors/probe.ts';
import type { Inventory } from '../src/infra/inventory.ts';

const at = '2026-11-06T16:00:00Z';
const target: PostgresTarget = { host: '127.0.0.1', port: 5432, database: 'lab', user: 'monitor', timeoutMs: 1000 };

test('consulta fixa em transação READ ONLY confirma saúde e encerra conexão', async () => {
  const commands: string[] = [];
  let config: ClientConfig | undefined;
  let ended = false;
  const factory = (options: ClientConfig): DatabaseSession => {
    config = options;
    return {
      async connect() { commands.push('connect'); },
      async query(sql) {
        commands.push(sql);
        return sql === 'SELECT 1 AS ok' ? { rowCount: 1, rows: [{ ok: 1 }] } : { rowCount: null, rows: [] };
      },
      async end() { ended = true; commands.push('end'); }
    };
  };
  const probe = postgresProbe('db-lab', 'probe-db', target, async () => 'segredo-sintetico', factory, () => at);
  const reading = await probe.collect(new AbortController().signal);
  assert.deepEqual(commands, ['connect', 'BEGIN READ ONLY', 'SELECT 1 AS ok', 'ROLLBACK', 'end']);
  assert.equal(ended, true);
  assert.deepEqual([reading.health, reading.observedAt, reading.evidenceRef, reading.indicator, reading.unit],
    ['saudavel', at, 'postgres-select-1', 'latency', 'ms']);
  assert.equal(config?.host, '127.0.0.1');
  assert.equal(config?.ssl, false);
  assert.equal(config?.connectionTimeoutMillis, 1000);
  assert.equal(config?.query_timeout, 1000);
  assert.equal(config?.statement_timeout, 1000);
});

test('recusa alvo remoto, credencial vazia e cancelamento antes de abrir conexão', async () => {
  assert.throws(() => postgresProbe('db-lab', 'probe-db', { ...target, host: 'example.invalid' },
    async () => 'segredo'), /loopback/);
  let opened = false;
  const factory = (): DatabaseSession => { opened = true; throw new Error('Não deveria conectar'); };
  const missing = postgresProbe('db-lab', 'probe-db', target, async () => '', factory);
  await assert.rejects(missing.collect(new AbortController().signal), /Credencial PostgreSQL indisponível/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(missing.collect(cancelled.signal), /cancelada/);
  assert.equal(opened, false);
});

test('falha de consulta perde cobertura sem inventar incidente de banco', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-db-probe-'));
  const store = new EventStore(path.join(directory, 'state.db'));
  t.after(() => {
    store.close();
    if (!path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`)) throw new Error('Alvo temporário inválido');
    rmSync(directory, { recursive: true, force: true });
  });
  for (let i = 1; i <= 3; i++)
    store.registerProject({ projectId: `p${i}`, name: `Projeto ${i}`, canonicalPath: `C:\\Projects\\p${i}` });
  const inventory = JSON.parse(readFileSync(new URL('../../contracts/fixtures/m2/shared-infrastructure.v1.json', import.meta.url), 'utf8')) as Inventory;
  store.infrastructure.replaceInventory(inventory);
  let ended = false;
  const probe = postgresProbe('db-lab', 'probe-db', target, async () => 'segredo-sintetico', () => ({
    async connect() {},
    async query(sql) { if (sql === 'SELECT 1 AS ok') throw new Error('Consulta indisponível'); return { rowCount: null, rows: [] }; },
    async end() { ended = true; }
  }), () => at);
  const result = await new CollectorRunner(store.infrastructure, [probe], 1000, () => at).collectOnce();
  assert.deepEqual(result, { collected: [], failed: ['db-lab'] });
  assert.equal(ended, true);
  const state = (store.snapshot(at).resourceStates as { resourceId: string; health: string; coverage: string }[]).find(item => item.resourceId === 'db-lab');
  assert.deepEqual([state?.health, state?.coverage], ['sem_dados', 'perdida']);
  assert.equal((store.snapshot(at).incidents as unknown[]).length, 0);
});
