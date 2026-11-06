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
