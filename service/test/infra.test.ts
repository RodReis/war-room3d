import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import Database from 'better-sqlite3';
import { EventStore } from '../src/store/event-store.ts';
import { affectedBy } from '../src/infra/dependency-graph.ts';
import { parseInventory, type Inventory } from '../src/infra/inventory.ts';
import { reduceHealth } from '../src/infra/health-reducer.ts';

const inventory = JSON.parse(readFileSync(new URL('../../contracts/fixtures/m2/shared-infrastructure.v1.json', import.meta.url), 'utf8')) as Inventory;
const snapshotSchema = JSON.parse(readFileSync(new URL('../../contracts/schemas/snapshot.v1.schema.json', import.meta.url), 'utf8'));
const validateSnapshot = new Ajv2020({ strict: true }).compile(snapshotSchema);
const at = '2026-11-06T16:00:00Z';
const later = '2026-11-06T16:00:10Z';

function temporaryStore(t: { after: (fn: () => void) => void }): { store: EventStore; databasePath: string } {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-m2-'));
  const databasePath = path.join(directory, 'events.db');
  const store = new EventStore(databasePath);
  t.after(() => {
    try { store.close(); } catch { /* fechado no teste de reinício */ }
    if (!path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`)) throw new Error('Diretório temporário fora do alvo');
    rmSync(directory, { recursive: true, force: true });
  });
  return { store, databasePath };
}

function register(store: EventStore): void {
  for (let i = 1; i <= 3; i++) store.registerProject({ projectId: `p${i}`, name: `Projeto ${i}`, canonicalPath: `C:\\Projects\\p${i}` });
  store.infrastructure.replaceInventory(inventory);
}

test('grafo alcança só dependentes explícitos e encerra ciclos', () => {
  const parsed = parseInventory(inventory, new Set(['p1', 'p2', 'p3']));
  assert.deepEqual(affectedBy('db-lab', parsed.dependencies, parsed.projectResources), { resourceIds: ['api-lab', 'db-lab'], projectIds: ['p1', 'p2'] });
  assert.deepEqual(affectedBy('db-homolog', parsed.dependencies, parsed.projectResources).projectIds, ['p3']);
  assert.deepEqual(affectedBy('db-lab', [...parsed.dependencies,
    { dependentResourceId: 'db-lab', dependencyResourceId: 'api-lab', origin: 'configured', confidence: 'confirmed' }], parsed.projectResources).projectIds, ['p1', 'p2']);
  assert.throws(() => parseInventory({ ...inventory, dependencies: [{ ...inventory.dependencies[0], dependencyResourceId: 'db-homolog' }] }, new Set(['p1', 'p2', 'p3'])), /ambientes/);
});

test('saúde, frescor e cobertura não convertem perda de coleta em verde', () => {
  const reading = { resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'saudavel' as const, observedAt: at, evidenceRef: null };
  assert.equal(reduceHealth(null, null, 60000, later, 'probe-db').health, 'sem_dados');
  assert.equal(reduceHealth(reading, null, 60000, later, 'probe-db').health, 'saudavel');
  assert.deepEqual([reduceHealth(reading, '2026-11-06T16:00:05Z', 60000, later, 'probe-db').health,
    reduceHealth(reading, '2026-11-06T16:00:05Z', 60000, later, 'probe-db').coverage], ['sem_dados', 'perdida']);
  assert.deepEqual([reduceHealth(reading, null, 60000, '2026-11-06T16:02:00Z', 'probe-db').health,
    reduceHealth(reading, null, 60000, '2026-11-06T16:02:00Z', 'probe-db').freshness], ['sem_dados', 'expirada']);
});

test('inventário e incidente compartilhado persistem sem sessões de agentes', t => {
  const { store, databasePath } = temporaryStore(t);
  register(store);
  const before = store.snapshot(later);
  assert.equal(validateSnapshot(before), true, JSON.stringify(validateSnapshot.errors));
  assert.equal((before.resourceStates as { health: string }[]).every(state => state.health === 'sem_dados'), true);
  assert.equal(store.infrastructure.recordReading({ resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'indisponivel', observedAt: at, evidenceRef: 'prova-db-1' }, later), true);
  const snapshot = store.snapshot(later);
  assert.deepEqual((snapshot.incidents as { projectIds: string[] }[])[0].projectIds, ['p1', 'p2']);
  assert.equal((snapshot.sessions as unknown[]).length, 0);
  assert.equal(validateSnapshot(snapshot), true, JSON.stringify(validateSnapshot.errors));
  store.close();
  const reopened = new EventStore(databasePath);
  assert.deepEqual((reopened.snapshot(later).incidents as { projectIds: string[] }[])[0].projectIds, ['p1', 'p2']);
  reopened.close();
});

test('fonte perdida, leitura tardia e recuperação observada preservam incidente', t => {
  const { store } = temporaryStore(t);
  register(store);
  store.infrastructure.recordReading({ resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'indisponivel', observedAt: at, evidenceRef: 'falha-1' }, later);
  store.infrastructure.markSourceLost('probe-db', '2026-11-06T16:00:20Z');
  const lost = store.snapshot('2026-11-06T16:00:30Z');
  const state = (lost.resourceStates as { resourceId: string; health: string; coverage: string }[]).find(item => item.resourceId === 'db-lab');
  assert.deepEqual([state?.health, state?.coverage], ['sem_dados', 'perdida']);
  assert.equal((lost.incidents as unknown[]).length, 1);
  store.infrastructure.recordReading({ resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'saudavel', observedAt: '2026-11-06T16:00:15Z', evidenceRef: 'recuperacao-tardia' }, '2026-11-06T16:00:31Z');
  assert.equal((store.snapshot('2026-11-06T16:00:30Z').incidents as unknown[]).length, 1);
  store.infrastructure.recordReading({ resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'saudavel', observedAt: '2026-11-06T16:00:40Z', evidenceRef: 'recuperacao-1' }, '2026-11-06T16:00:41Z');
  assert.equal((store.snapshot('2026-11-06T16:00:45Z').incidents as unknown[]).length, 0);
  assert.equal((store.snapshot('2026-11-06T16:00:45Z').resourceStates as { resourceId: string; health: string }[]).find(item => item.resourceId === 'db-lab')?.health, 'saudavel');
});

test('troca de inventário revoga vínculos e rejeita mudança de ambiente', t => {
  const { store } = temporaryStore(t);
  register(store);
  store.infrastructure.replaceInventory({ ...inventory, projectResources: inventory.projectResources.filter(link => link.projectId !== 'p2') });
  store.infrastructure.recordReading({ resourceId: 'db-lab', sourceId: 'probe-db', sourceVersion: '1', health: 'degradado', observedAt: at, evidenceRef: 'falha-1' }, later);
  assert.deepEqual((store.snapshot(later).incidents as { projectIds: string[] }[])[0].projectIds, ['p1']);
  assert.throws(() => store.infrastructure.replaceInventory({ ...inventory, resources: inventory.resources.map(item => item.resourceId === 'db-lab' ? { ...item, environmentId: 'homolog' } : item) }), /ambiente/);
  assert.deepEqual((store.snapshot(later).incidents as { projectIds: string[] }[])[0].projectIds, ['p1']);
});

test('leitura no mesmo instante é idempotente ou colisão explícita', t => {
  const { store } = temporaryStore(t);
  register(store);
  const reading = { resourceId: 'api-lab', sourceId: 'probe-api', sourceVersion: '1', health: 'saudavel' as const,
    observedAt: at, evidenceRef: 'http-status-200', indicator: 'latency', value: 12, unit: 'ms' };
  assert.equal(store.infrastructure.recordReading(reading, later), true);
  const before = store.snapshot(later);
  assert.equal(store.infrastructure.recordReading(reading, later), false);
  assert.throws(() => store.infrastructure.recordReading({ ...reading, value: 200 }, later), /colide/);
  assert.deepEqual(store.snapshot(later), before);
});

test('replay de infraestrutura usa inventário, leitura, perda e vínculos no instante', t => {
  const { store, databasePath } = temporaryStore(t);
  for (let i = 1; i <= 3; i++) store.registerProject({ projectId: `p${i}`, name: `Projeto ${i}`, canonicalPath: `C:\\Projects\\p${i}` });
  const base = Date.now() + 60000;
  const time = (seconds: number) => new Date(base + seconds * 1000).toISOString();
  assert.throws(()=>store.infrastructure.replaceInventory(inventory,'2026-11-06'),/Data do inventário inválida/);
  assert.deepEqual([store.historicalSnapshot(time(-1)).infrastructureReference,
    (store.historicalSnapshot(time(-1)).resources as unknown[]).length], ['unavailable', 0]);
  store.infrastructure.replaceInventory(inventory, time(0));
  const initial = store.historicalSnapshot(time(0));
  assert.equal(initial.infrastructureReference, 'recorded');
  assert.equal((initial.resources as unknown[]).length, inventory.resources.length);
  assert.equal((initial.resourceStates as {resourceId:string;health:string}[]).find(row => row.resourceId === 'db-lab')?.health, 'sem_dados');
  store.infrastructure.recordReading({ resourceId:'db-lab', sourceId:'probe-db', sourceVersion:'1', health:'degradado',
    observedAt:time(1), evidenceRef:'falha-db' }, time(2));
  const degraded = store.historicalSnapshot(time(1));
  assert.equal((degraded.resourceStates as {resourceId:string;health:string}[]).find(row => row.resourceId === 'db-lab')?.health, 'degradado');
  assert.deepEqual((degraded.incidents as {projectIds:string[]}[])[0]?.projectIds, ['p1','p2']);
  store.infrastructure.markSourceLost('probe-db', time(3));
  const lost = store.historicalSnapshot(time(3));
  assert.deepEqual((lost.resourceStates as {resourceId:string;health:string;coverage:string}[]).filter(row => row.resourceId === 'db-lab').map(row => [row.health,row.coverage]),
    [['sem_dados','perdida']]);
  store.infrastructure.replaceInventory({ ...inventory, projectResources: inventory.projectResources.filter(link => link.projectId !== 'p2') }, time(4));
  assert.deepEqual((store.historicalSnapshot(time(4)).incidents as {projectIds:string[]}[])[0]?.projectIds, ['p1']);
  assert.deepEqual((store.historicalSnapshot(time(1)).incidents as {projectIds:string[]}[])[0]?.projectIds, ['p1','p2']);
  store.infrastructure.recordReading({ resourceId:'db-lab', sourceId:'probe-db', sourceVersion:'1', health:'saudavel',
    observedAt:time(5), evidenceRef:'recuperacao-db' }, time(6));
  assert.equal((store.historicalSnapshot(time(5)).incidents as unknown[]).length, 0);
  assert.equal((store.historicalSnapshot(time(3)).incidents as unknown[]).length, 1);
  store.infrastructure.markResourceCollectionFailed('db-lab',time(7));
  assert.equal((store.historicalSnapshot(time(7)).resourceStates as {resourceId:string;coverage:string}[])
    .find(row=>row.resourceId==='db-lab')?.coverage,'perdida');
  store.close();
  const reopened=new EventStore(databasePath);
  assert.equal((reopened.historicalSnapshot(time(1)).resourceStates as {resourceId:string;health:string}[])
    .find(row=>row.resourceId==='db-lab')?.health,'degradado');
  assert.equal((reopened.historicalSnapshot(time(7)).resourceStates as {resourceId:string;coverage:string}[])
    .find(row=>row.resourceId==='db-lab')?.coverage,'perdida');
  reopened.close();
});

test('migração v11 registra inventário legado só desde sua execução', t => {
  const { store, databasePath } = temporaryStore(t);
  register(store);
  store.close();
  const db = new Database(databasePath);
  db.exec("DROP TABLE history_github_observations; DROP TABLE infra_inventory_versions; DROP TABLE infra_status_events; UPDATE meta SET value=10 WHERE key='schema_version'");
  db.close();
  const migrated = new EventStore(databasePath);
  const check = new Database(databasePath);
  const row = check.prepare('SELECT known_at FROM infra_inventory_versions').get() as {known_at:string};
  check.close();
  assert.equal(migrated.historicalSnapshot(new Date(Date.parse(row.known_at)-1).toISOString()).infrastructureReference,'unavailable');
  assert.equal(migrated.historicalSnapshot(row.known_at).infrastructureReference,'recorded');
  assert.equal((migrated.historicalSnapshot(row.known_at).resources as unknown[]).length,inventory.resources.length);
  migrated.close();
});
