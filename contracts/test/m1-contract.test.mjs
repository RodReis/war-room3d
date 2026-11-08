import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
const event = ajv.compile(read('../schemas/event.v1.schema.json'));
const snapshot = ajv.compile(read('../schemas/snapshot.v1.schema.json'));
const session = read('../fixtures/m1/session-observed.v1.json');
const resource = read('../fixtures/m1/resource-observed.v1.json');
const empty = read('../fixtures/m1/empty-snapshot.v1.json');

test('evento de sessão e recurso sem sessão seguem contratos separados', () => {
  assert.equal(event(session), true, JSON.stringify(event.errors));
  assert.equal(event(resource), true, JSON.stringify(event.errors));
  assert.equal(event({ ...session, projectId: undefined }), false);
  assert.equal(event({ ...session, provider: undefined }), false);
  assert.equal(event({ ...resource, resourceId: undefined }), false);
});

test('observação GitHub do transcript exige identidade canônica sem conteúdo bruto', () => {
  const observation = { ...session, type: 'github.observed', projectId: 'p1', provider: undefined, sessionKey: undefined,
    payload: { repositoryId: 'repo-1', entityType: 'pull_request', entityId: '101', transition: 'merged' } };
  assert.equal(event(observation), true, JSON.stringify(event.errors));
  assert.equal(event({ ...observation, payload: { ...observation.payload, entityId: undefined } }), false);
  assert.equal(event({ ...observation, payload: { ...observation.payload, prompt: 'segredo-sintetico' } }), false);
});

test('envelope rejeita dados ausentes, versão incompatível e payload bruto', () => {
  for (const candidate of [
    { ...session, sourceId: undefined },
    { ...session, observedAt: undefined },
    { ...session, provenance: undefined },
    { ...session, schemaVersion: '2.0' },
    { ...session, payload: { prompt: 'texto sintetico' } },
    { ...session, ingestionMode: 'demo' },
    { ...session, token: 'segredo-sintetico' }
  ]) assert.equal(event(candidate), false);
});

test('snapshot live inclui estruturas do HUD e não aceita fixture demo', () => {
  assert.equal(snapshot(empty), true, JSON.stringify(snapshot.errors));
  assert.equal(snapshot({ ...empty, mode: 'demo' }), false);
  assert.equal(snapshot({ ...empty, feed: undefined }), false);
  assert.equal(snapshot({ ...empty, sessions: [{ sessionKey: 's' }] }), false);
});

test('atividade aceita apenas identidade e metadados redigidos', () => {
  const base = { ...session, eventId: 'activity-1' };
  const task = { ...base, type: 'task.observed', payload: { taskId: 'task-1', title: 'Revisar' } };
  const skill = { ...base, type: 'skill.observed', payload: { invocationId: 'skill-1', name: 'review' } };
  const message = { ...base, type: 'message.observed', payload: { messageId: 'message-1' } };
  for (const value of [task, skill, message]) assert.equal(event(value), true, JSON.stringify(event.errors));
  for (const value of [
    { ...task, payload: { title: 'Revisar' } },
    { ...skill, payload: { invocationId: 'skill-1' } },
    { ...message, payload: { messageId: 'message-1', content: 'texto privado' } },
    { ...task, sessionKey: undefined }
  ]) assert.equal(event(value), false);
});
