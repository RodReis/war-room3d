import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRegistry, sessionKey } from '../src/domain/identity.ts';
import { parentStatus, reduceSession } from '../src/domain/session-reducer.ts';

test('projetos homônimos não se fundem; alias Windows/WSL exige cadastro', () => {
  const registry = new ProjectRegistry([
    { projectId: 'a', name: 'api', canonicalPath: 'C:\\Projetos\\api', aliases: ['/mnt/c/Projetos/api'] },
    { projectId: 'b', name: 'api', canonicalPath: 'D:\\Projetos\\api' }
  ]);
  assert.equal(registry.resolve('c:/projetos/API'), 'a');
  assert.equal(registry.resolve('/mnt/c/Projetos/api'), 'a');
  assert.equal(registry.resolve('D:/Projetos/api'), 'b');
  assert.equal(registry.resolve('/mnt/d/Projetos/api'), null);
  assert.equal(registry.resolve(null), null);
  assert.throws(() => registry.add({ projectId: 'c', name: 'outro', canonicalPath: 'c:/PROJETOS/api' }), /colide/);
});

test('identidade de sessão inclui provedor e conta opaca', () => {
  assert.notEqual(sessionKey('codex', 'conta-a', 'sessao-1'), sessionKey('claude', 'conta-a', 'sessao-1'));
  assert.notEqual(sessionKey('codex', 'conta-a', 'sessao-1'), sessionKey('codex', 'conta-b', 'sessao-1'));
  assert.equal(sessionKey('codex', 'conta-a', 'sessao-1'), sessionKey('codex', 'conta-a', 'sessao-1'));
});

test('presença não vira encerrada por perda da fonte ou evento tardio', () => {
  const observed = reduceSession(null, 'session.observed', '2026-11-06T15:00:00Z');
  const working = reduceSession(observed, 'session.working', '2026-11-06T15:01:00Z');
  const lost = reduceSession(working, 'source.unavailable', '2026-11-06T15:02:00Z');
  assert.deepEqual([lost.presence, lost.freshness], ['desconhecida', 'desatualizado']);
  assert.deepEqual(reduceSession(lost, 'session.waiting', '2026-11-06T14:59:00Z'), lost);
  const ended = reduceSession(lost, 'session.ended', '2026-11-06T15:03:00Z');
  assert.equal(ended.presence, 'encerrada');
  assert.deepEqual(reduceSession(ended, 'session.working', '2026-11-06T15:04:00Z'), ended);
});

test('subagente sem pai conhecido mantém vínculo pendente', () => {
  assert.equal(parentStatus('filho', 'pai', new Set()), 'vinculo_pendente');
  assert.equal(parentStatus('filho', 'pai', new Set(['pai'])), 'vinculado');
  assert.equal(parentStatus('pai', null, new Set()), 'principal');
});

test('frações de segundo são ordenadas como instantes', () => {
  const working = reduceSession(null, 'session.working', '2026-11-06T15:00:00Z');
  const waiting = reduceSession(working, 'session.waiting', '2026-11-06T15:00:00.500Z');
  assert.equal(waiting.presence, 'aguardando');
  assert.deepEqual(reduceSession(waiting, 'session.working', '2026-11-06T15:00:00.100Z'), waiting);
});

test('evento atrasado não restaura presença após perda de fonte', () => {
  const working = reduceSession(null, 'session.working', '2026-11-06T15:00:00Z');
  const lost = reduceSession(working, 'source.unavailable', '2026-11-06T15:02:00Z');
  assert.deepEqual(reduceSession(lost, 'session.working', '2026-11-06T15:01:00Z'), lost);
  const recovered = reduceSession(lost, 'session.working', '2026-11-06T15:03:00Z');
  assert.deepEqual([recovered.presence, recovered.freshness, recovered.sourceUnavailableAt], ['trabalhando', 'atual', null]);
});
