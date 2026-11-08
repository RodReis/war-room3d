import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';

const schema=JSON.parse(readFileSync(new URL('../schemas/observation.v1.schema.json',import.meta.url),'utf8'));
const validate=new Ajv2020({allErrors:true,strict:true}).compile(schema);

test('observação M5 exige fonte, ambiente, cobertura e evidência com IDs de correlação explícitos',()=>{
  const observation={schemaVersion:'1.0',observationId:'obs-1',sourceId:'logs-lab',sourceVersion:'1.0',environmentId:'env-a',resourceId:'api-a',
    observedAt:'2026-11-07T12:00:00.000Z',receivedAt:'2026-11-07T12:00:01.000Z',category:'trace',classification:'application',confidence:'observed',
    evidenceRef:'file://logs/trace.jsonl',coverage:'covered',correlation:{traceId:'0123456789abcdef0123456789abcdef',spanId:'0123456789abcdef'},fields:{status:503}};
  assert.equal(validate(observation),true);
  assert.equal(validate({...observation,coverage:'unknown'}),false);
  assert.equal(validate({...observation,correlation:{traceId:'nearby-in-time'}}),false);
  assert.equal(validate({...observation,accessToken:'synthetic-secret'}),false);
});
