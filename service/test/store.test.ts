import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { createService } from '../src/index.ts';
import { EventStore, type Cursor, type NormalizedEvent } from '../src/store/event-store.ts';

const fixture = JSON.parse(readFileSync(new URL('../../contracts/fixtures/m1/session-observed.v1.json', import.meta.url), 'utf8')) as NormalizedEvent;
const snapshotSchema = JSON.parse(readFileSync(new URL('../../contracts/schemas/snapshot.v1.schema.json', import.meta.url), 'utf8'));
const validateSnapshot = new Ajv2020({ strict: true }).compile(snapshotSchema);

function temporaryStore(t: { after: (fn: () => void) => void }): { store: EventStore; databasePath: string } {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-m1-'));
  const databasePath = path.join(directory, 'events.db');
  const store = new EventStore(databasePath);
  t.after(() => {
    try { store.close(); } catch { /* reinício pode fechar antes */ }
    if (!path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`)) throw new Error('Diretório temporário fora do alvo');
    rmSync(directory, { recursive: true, force: true });
  });
  return { store, databasePath };
}

const cursor = (offset: number): Cursor => ({ sourceId: fixture.sourceId, fileKey: 'session.jsonl', generation: 1, offset });

test('serviço inerte não abre porta e snapshot inicial é compatível', t => {
  const { databasePath, store } = temporaryStore(t);
  store.close();
  const service = createService({ listen: false, databasePath });
  assert.equal(validateSnapshot(service.store.snapshot()), true, JSON.stringify(validateSnapshot.errors));
  service.close();
});

test('projetos e posições persistem, com sétimo projeto em outro setor', t => {
  const { store } = temporaryStore(t);
  for (let i = 1; i <= 7; i++) store.registerProject({ projectId: `p${i}`, name: 'api', canonicalPath: `C:\\Projetos\\api-${i}` });
  const snapshot = store.snapshot();
  assert.equal((snapshot.projects as unknown[]).length, 7);
  assert.deepEqual((snapshot.roomPlacements as unknown[])[6], { projectId: 'p7', sectorId: 'setor-02', slotId: 'slot-01', layoutVersion: '1' });
  assert.equal(store.resolveProject('c:/projetos/api-1'), 'p1');
  assert.equal(store.resolveProject('c:/projetos/nao-cadastrado'), null);
  assert.equal(validateSnapshot(snapshot), true, JSON.stringify(validateSnapshot.errors));
});

test('duas sessões de provedores distintos permanecem em projetos corretos', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: 'projeto-a', name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  store.registerProject({ projectId: 'projeto-b', name: 'api', canonicalPath: 'D:\\Projetos\\api' });
  store.apply(fixture, cursor(100));
  store.apply({ ...fixture, eventId: 'evento-claude', sourceId: 'laboratorio-claude', sourceEventId: 'claude-1', provider: 'claude', projectId: 'projeto-b', sessionKey: 'sessao-b' },
    { sourceId: 'laboratorio-claude', fileKey: 'session.jsonl', generation: 1, offset: 100 });
  const sessions = store.snapshot().sessions as { projectId: string; provider: string }[];
  assert.deepEqual(sessions.map(session => [session.projectId, session.provider]), [['projeto-a', 'codex'], ['projeto-b', 'claude']]);
});

test('duplicata avança cursor sem alterar revisão, feed ou agente', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: fixture.projectId!, name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  assert.equal(store.apply(fixture, cursor(100)).applied, true);
  const before = store.snapshot();
  assert.deepEqual(store.apply({ ...fixture, eventId: 'event-duplicado' }, cursor(200)), { applied: false, revision: 2, streamSequence: 2, reason: 'duplicate' });
  assert.equal(store.getCursor(fixture.sourceId, 'session.jsonl')?.offset, 200);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(validateSnapshot(before), true, JSON.stringify(validateSnapshot.errors));
});

test('reinício recupera estado e cursor; filho antes do pai é resolvido depois', t => {
  const { store, databasePath } = temporaryStore(t);
  store.registerProject({ projectId: fixture.projectId!, name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  store.apply(fixture, cursor(100));
  store.close();
  const reopened = new EventStore(databasePath);
  assert.equal(reopened.getCursor(fixture.sourceId, 'session.jsonl')?.offset, 100);
  const agent = { ...fixture, eventId: 'filho-event', sourceEventId: 'filho-record', type: 'agent.observed', agentKey: 'filho', payload: { parentAgentKey: 'pai' } };
  reopened.apply(agent, cursor(150));
  assert.equal((reopened.snapshot().agents as { parentStatus: string }[])[0].parentStatus, 'vinculo_pendente');
  reopened.apply({ ...agent, eventId: 'pai-event', sourceEventId: 'pai-record', agentKey: 'pai', payload: {} }, cursor(200));
  assert.equal((reopened.snapshot().agents as { agentKey: string; parentStatus: string }[]).find(a => a.agentKey === 'filho')?.parentStatus, 'vinculado');
  reopened.close();
});

test('atualização de presença preserva parentesco informado antes', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: fixture.projectId!, name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  store.apply(fixture, cursor(100));
  const child = { ...fixture, eventId: 'filho-1', sourceEventId: 'filho-1', type: 'agent.observed', agentKey: 'filho', payload: { parentAgentKey: 'pai' } };
  store.apply(child, cursor(150));
  store.apply({ ...child, eventId: 'filho-2', sourceEventId: 'filho-2', type: 'agent.working', payload: {}, observedAt: '2026-11-06T15:01:00Z' }, cursor(200));
  assert.deepEqual((store.snapshot().agents as { parentAgentKey?: string; parentStatus: string }[])[0], {
    agentKey: 'filho', sessionKey: 'sessao-a', parentAgentKey: 'pai', presence: 'trabalhando', parentStatus: 'vinculo_pendente'
  });
});

test('falha após inserção reverte evento, revisão e cursor juntos', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: fixture.projectId!, name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  store.registerProject({ projectId: 'outro', name: 'api', canonicalPath: 'D:\\Projetos\\api' });
  store.apply(fixture, cursor(100));
  const before = store.snapshot();
  assert.throws(() => store.apply({ ...fixture, eventId: 'colisao', sourceEventId: 'colisao-record', projectId: 'outro' }, cursor(200)), /colide/);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.getCursor(fixture.sourceId, 'session.jsonl')?.offset, 100);
});

test('eventId repetido para outro evento é colisão e não avança cursor', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: fixture.projectId!, name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  store.apply(fixture, cursor(100));
  assert.throws(() => store.apply({ ...fixture, sourceEventId: 'registro-diferente' }, cursor(200)), /eventId colide/);
  assert.equal(store.getCursor(fixture.sourceId, 'session.jsonl')?.offset, 100);
  assert.equal((store.snapshot().feed as unknown[]).length, 1);
});

test('evento sem contexto fica diagnosticado sem persistir conteúdo bruto', t => {
  const { store } = temporaryStore(t);
  const result = store.apply({ ...fixture, projectId: undefined, payload: { prompt: 'segredo-sintetico' } }, cursor(100));
  assert.equal(result.reason, 'schema_invalid');
  assert.equal(store.quarantineCount(), 1);
  assert.equal((store.snapshot().feed as unknown[]).length, 0);
  assert.equal(store.getCursor(fixture.sourceId, 'session.jsonl')?.offset, 100);
});

test('projeto desconhecido é diagnosticado sem entrar em sala arbitrária', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: 'outro', name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  const result = store.apply(fixture, cursor(100));
  assert.equal(result.reason, 'unknown_project');
  assert.equal((store.snapshot().sessions as unknown[]).length, 0);
  assert.equal(store.quarantineCount(), 1);
  assert.equal(store.getCursor(fixture.sourceId, 'session.jsonl')?.offset, 100);
});

test('perda de fonte marca desconhecido, sem encerrar sessão', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: fixture.projectId!, name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  store.apply(fixture, cursor(100));
  store.apply({ ...fixture, eventId: 'agente-1', sourceEventId: 'agente-1', type: 'agent.working', agentKey: 'agente-a' }, cursor(150));
  store.apply({ ...fixture, eventId: 'fonte-perdida', sourceEventId: 'fonte-perdida-record', type: 'source.unavailable', projectId: undefined, sessionKey: undefined, provider: undefined, observedAt: '2026-11-06T15:05:00Z' }, cursor(200));
  const snapshot = store.snapshot();
  assert.equal((snapshot.sessions as { presence: string }[])[0].presence, 'desconhecida');
  assert.equal((snapshot.agents as { presence: string }[])[0].presence, 'desconhecida');
  assert.equal((snapshot.sources as { status: string }[])[0].status, 'indisponivel');
  assert.equal(validateSnapshot(snapshot), true, JSON.stringify(validateSnapshot.errors));
});

test('evento tardio não reativa fonte perdida nem sessão', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: fixture.projectId!, name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  store.apply({ ...fixture, type: 'session.working' }, cursor(100));
  store.apply({ ...fixture, eventId: 'fonte-perdida', sourceEventId: 'fonte-perdida', type: 'source.unavailable', projectId: undefined, sessionKey: undefined, provider: undefined, observedAt: '2026-11-06T15:02:00Z' }, cursor(150));
  store.apply({ ...fixture, eventId: 'tardio', sourceEventId: 'tardio', type: 'session.working', observedAt: '2026-11-06T15:01:00Z', receivedAt: '2026-11-06T15:03:00Z' }, cursor(200));
  store.apply({ ...fixture, eventId: 'agente-tardio', sourceEventId: 'agente-tardio', type: 'agent.working', agentKey: 'agente-tardio', observedAt: '2026-11-06T15:01:01Z', receivedAt: '2026-11-06T15:03:01Z' }, cursor(220));
  let snapshot = store.snapshot();
  assert.equal((snapshot.sessions as { presence: string }[])[0].presence, 'desconhecida');
  assert.equal((snapshot.agents as unknown[]).length, 0);
  assert.equal((snapshot.sources as { status: string }[])[0].status, 'indisponivel');
  store.apply({ ...fixture, eventId: 'novo', sourceEventId: 'novo', type: 'session.working', observedAt: '2026-11-06T15:03:01Z', receivedAt: '2026-11-06T15:03:02Z' }, cursor(250));
  snapshot = store.snapshot();
  assert.equal((snapshot.sessions as { presence: string }[])[0].presence, 'trabalhando');
  assert.equal((snapshot.sources as { status: string }[])[0].status, 'atual');
});

test('encerramento explícito encerra presença visual de agentes', t => {
  const { store } = temporaryStore(t);
  store.registerProject({ projectId: fixture.projectId!, name: 'api', canonicalPath: 'C:\\Projetos\\api' });
  store.apply(fixture, cursor(100));
  store.apply({ ...fixture, eventId: 'agente-1', sourceEventId: 'agente-1', type: 'agent.working', agentKey: 'agente-a' }, cursor(150));
  store.apply({ ...fixture, eventId: 'fim-1', sourceEventId: 'fim-1', type: 'session.ended', observedAt: '2026-11-06T15:05:00Z' }, cursor(200));
  assert.equal((store.snapshot().agents as { presence: string }[])[0].presence, 'encerrada');
  store.apply({ ...fixture, eventId: 'agente-tardio', sourceEventId: 'agente-tardio', type: 'agent.working', agentKey: 'agente-a', observedAt: '2026-11-06T15:06:00Z' }, cursor(250));
  assert.equal((store.snapshot().agents as { presence: string }[])[0].presence, 'encerrada');
});
