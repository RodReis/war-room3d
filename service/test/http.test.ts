import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

function temporaryStore(t: { after: (fn: () => void) => void }): EventStore {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-http-'));
  const store = new EventStore(path.join(directory, 'state.db'));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  store.infrastructure.replaceInventory({
    schemaVersion: '1.0', environments: [{ environmentId: 'lab', name: 'Laboratório' }],
    resources: [{ resourceId: 'db-lab', environmentId: 'lab', kind: 'database', name: 'Banco sintético', sourceId: 'probe-db', staleAfterMs: 60000 }],
    projectResources: [], dependencies: []
  });
  return store;
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(expected)) {
    const next = await reader.read();
    if (next.done) throw new Error('SSE encerrado antes do evento esperado');
    text += decoder.decode(next.value, { stream: true });
  }
  return text;
}

test('HTTP exige token, publica snapshot M2 e SSE após commit com replay', async t => {
  const store = temporaryStore(t);
  const token = randomBytes(32).toString('hex');
  const { server, url } = await startReadOnlyServer(store, token);
  t.after(() => server.close());
  const headers = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${url}/v1/snapshot`)).status, 401);
  assert.equal((await fetch(`${url}/v1/snapshot`, { method: 'POST', headers })).status, 405);
  assert.equal((await fetch(`${url}/v1/snapshot?token=x`, { headers })).status, 404);
  assert.equal((await fetch(`${url}/v1/events`, { headers })).status, 409);
  const response = await fetch(`${url}/v1/snapshot`, { headers });
  assert.equal(response.status, 200);
  const snapshot = await response.json() as { mode: string; streamSequence: number; resources: { resourceId: string }[] };
  assert.equal(snapshot.mode, 'live');
  assert.equal(snapshot.streamSequence, 1);
  assert.deepEqual(snapshot.resources.map(item => item.resourceId), ['db-lab']);
  const controller = new AbortController();
  const stream = await fetch(`${url}/v1/events`, { headers: { ...headers, 'Last-Event-ID': String(snapshot.streamSequence) }, signal: controller.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  const now = new Date().toISOString();
  store.infrastructure.recordReading({ resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'degradado', observedAt: now, evidenceRef: 'probe-test' }, now);
  const frame = await readUntil(reader, 'event: resource.changed');
  assert.match(frame, /id: 2\nevent: resource\.changed/);
  assert.match(frame, /"resourceId":"db-lab"/);
  store.registerProject({ projectId: 'projeto-lab', name: 'Projeto sintético', canonicalPath: 'C:\\Projetos\\sintetico' });
  const projectFrame = await readUntil(reader, 'event: project.changed');
  assert.match(projectFrame, /id: 3\nevent: project\.changed/);
  controller.abort();
  await reader.cancel().catch(() => {});
  const replayController = new AbortController();
  const replay = await fetch(`${url}/v1/events`, { headers: { ...headers, 'Last-Event-ID': '1' }, signal: replayController.signal });
  assert.match(await readUntil(replay.body!.getReader(), 'event: resource.changed'), /id: 2/);
  replayController.abort();
  assert.deepEqual(store.changesSince(0).map(item => item.type), ['dependency.changed', 'resource.changed', 'project.changed']);
});

test('SSE exige novo snapshot para cursor futuro ou fora da janela', async t => {
  const store = temporaryStore(t);
  const token = randomBytes(32).toString('hex');
  const { server, url } = await startReadOnlyServer(store, token);
  t.after(() => server.close());
  const headers = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${url}/v1/events`, { headers: { ...headers, 'Last-Event-ID': '999' } })).status, 409);
  const controller = new AbortController();
  const live = await fetch(`${url}/v1/events`, { headers: { ...headers, 'Last-Event-ID': '1' }, signal: controller.signal });
  assert.equal(live.status, 200);
  const start = Date.parse('2026-11-06T16:00:00.000Z');
  for (let index = 0; index < 1000; index++) store.infrastructure.markResourceCollectionFailed('db-lab', new Date(start + index).toISOString());
  assert.equal(store.transportBaseline(), 1);
  assert.equal(store.changesSince(0).length, 1000);
  assert.match(await readUntil(live.body!.getReader(), 'resync.required'), /event: resync\.required/);
  controller.abort();
  const expired = await fetch(`${url}/v1/events`, { headers: { ...headers, 'Last-Event-ID': '0' } });
  assert.equal(expired.status, 409);
  assert.deepEqual(await expired.json(), { code: 'resync_required' });
});

test('migração de M3 preserva snapshot e cursor SSE existentes', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-http-migration-'));
  const databasePath = path.join(directory, 'state.db');
  let migrated: EventStore | null = null;
  let server: Awaited<ReturnType<typeof startReadOnlyServer>>['server'] | null = null;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    migrated?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const original = new EventStore(databasePath);
  original.infrastructure.replaceInventory({ schemaVersion: '1.0', environments: [], resources: [], projectResources: [], dependencies: [] });
  const oldSequence = original.snapshot().streamSequence as number;
  original.close();
  const db = new Database(databasePath);
  db.exec("DROP TABLE history_milestones; DROP TABLE project_repositories; UPDATE meta SET value = 3 WHERE key = 'schema_version'");
  db.close();
  migrated = new EventStore(databasePath);
  assert.equal(migrated.transportBaseline(), -1);
  const current = migrated.snapshot().streamSequence as number;
  assert.equal(current, oldSequence);
  const token = randomBytes(32).toString('hex');
  const started = await startReadOnlyServer(migrated, token);
  server = started.server;
  const url = started.url;
  const headers = { Authorization: `Bearer ${token}` };
  const controller = new AbortController();
  const fresh = await fetch(`${url}/v1/events`, { headers: { ...headers, 'Last-Event-ID': String(current) }, signal: controller.signal });
  assert.equal(fresh.status, 200);
  controller.abort();
});

test('eventos de sessão e infraestrutura compartilham sequência de replay', t => {
  const store = temporaryStore(t);
  const fixture = JSON.parse(readFileSync(new URL('../../contracts/fixtures/m1/session-observed.v1.json', import.meta.url), 'utf8')) as {
    projectId: string; sourceId: string; [key: string]: unknown
  };
  store.registerProject({ projectId: fixture.projectId, name: 'Projeto sintético', canonicalPath: 'C:\\Projetos\\sessao' });
  const result = store.apply(fixture, { sourceId: fixture.sourceId, fileKey: 'synthetic.jsonl', generation: 1, offset: 1 });
  assert.equal(result.streamSequence, 3);
  const now = new Date().toISOString();
  store.infrastructure.recordReading({ resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'saudavel', observedAt: now, evidenceRef: 'probe-test' }, now);
  assert.deepEqual(store.changesSince(0).map(item => [item.streamSequence, item.type]), [
    [1, 'dependency.changed'], [2, 'project.changed'], [3, 'event.changed'], [4, 'resource.changed']
  ]);
});

test('snapshot mantém a mesma visão do SQLite durante escrita por outro processo', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-snapshot-'));
  const databasePath = path.join(directory, 'state.db');
  const reader = new EventStore(databasePath);
  reader.infrastructure.replaceInventory({
    schemaVersion: '1.0', environments: [{ environmentId: 'lab', name: 'Laboratório' }],
    resources: [{ resourceId: 'db-lab', environmentId: 'lab', kind: 'database', name: 'Banco sintético', sourceId: 'probe-db', staleAfterMs: 60000 }],
    projectResources: [], dependencies: []
  });
  const writer = new EventStore(databasePath);
  t.after(() => { writer.close(); reader.close(); rmSync(directory, { recursive: true, force: true }); });
  const original = reader.infrastructure.snapshot.bind(reader.infrastructure);
  const now = '2026-11-06T16:00:00.000Z';
  let wrote = false;
  reader.infrastructure.snapshot = (at: string) => {
    if (!wrote) {
      wrote = true;
      writer.infrastructure.recordReading({ resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'saudavel', observedAt: now, evidenceRef: 'probe-test' }, now);
    }
    return original(at);
  };
  const before = reader.snapshot(now) as { streamSequence: number; resourceStates: { health: string }[] };
  assert.equal(before.streamSequence, 1);
  assert.equal(before.resourceStates[0]?.health, 'sem_dados');
  const after = reader.snapshot(now) as { streamSequence: number; resourceStates: { health: string }[] };
  assert.equal(after.streamSequence, 2);
  assert.equal(after.resourceStates[0]?.health, 'saudavel');
});
