import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true, strictRequired: false });
const activity = ajv.compile(read('../schemas/activity.v1.schema.json'));
const event = ajv.compile(read('../schemas/event.v1.schema.json'));
const start = Date.parse('2026-11-11T11:30:00.000Z');
const bucket = index => ({
  start: new Date(start + index * 300000).toISOString(),
  end: new Date(start + (index + 1) * 300000).toISOString(),
  count: 0, coverage: 'covered'
});
const response = {schemaVersion:'1.0',mode:'live',unit:'eventos observados',intervalMinutes:5,
  from:new Date(start).toISOString(),to:new Date(start+3600000).toISOString(),
  series:[{projectId:'project-a',name:'Projeto A',lastUpdatedAt:null,
    buckets:Array.from({length:12},(_,index)=>bucket(index))}]};

test('contrato temporal distingue zero coberto, lacuna e contagem parcial',()=>{
  assert.equal(activity(response),true,JSON.stringify(activity.errors));
  const gap=structuredClone(response);
  gap.series[0].buckets[4]={...gap.series[0].buckets[4],count:null,coverage:'gap'};
  assert.equal(activity(gap),true,JSON.stringify(activity.errors));
  const falseZero=structuredClone(gap);
  falseZero.series[0].buckets[4].count=0;
  assert.equal(activity(falseZero),false);
  const partialZero=structuredClone(response);
  partialZero.series[0].buckets[4].coverage='partial';
  assert.equal(activity(partialZero),false);
});

test('marcador de cobertura exige origem, intervalo e referência de prova',()=>{
  const covered={schemaVersion:'1.0',eventId:'e-covered',sourceId:'source-a',sourceEventId:'native-covered',
    sourceVersion:'1',type:'source.covered',observedAt:'2026-11-11T12:30:00.000Z',
    receivedAt:'2026-11-11T12:30:01.000Z',projectId:'project-a',provenance:'observed',ingestionMode:'live',
    payload:{coverageStart:'2026-11-11T11:30:00.000Z',coverageEnd:'2026-11-11T12:30:00.000Z'},
    evidenceRefs:['coverage-proof']};
  assert.equal(event(covered),true,JSON.stringify(event.errors));
  assert.equal(event({...covered,evidenceRefs:[]}),false);
  assert.equal(event({...covered,sourceEventId:undefined}),false);
  assert.equal(event({...covered,payload:{coverageStart:covered.payload.coverageStart}}),false);
  assert.equal(event({...covered,provenance:'inferred'}),false);
});
