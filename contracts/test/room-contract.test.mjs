import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';

const eventSchema = JSON.parse(readFileSync(new URL('../schemas/event.v1.schema.json', import.meta.url), 'utf8'));
const snapshotSchema = JSON.parse(readFileSync(new URL('../schemas/snapshot.v1.schema.json', import.meta.url), 'utf8'));
const validateEvent = new Ajv2020({strict:true,strictRequired:false}).compile(eventSchema);
const validateSnapshot = new Ajv2020({strict:true}).compile(snapshotSchema);

test('vínculo de workspace exige projeto e chave opaca sem caminho bruto', () => {
  const event = {schemaVersion:'1.0',eventId:'e1',sourceId:'fonte',sourceVersion:'fixture-1',type:'workspace.opened',
    observedAt:'2026-11-09T20:00:00Z',receivedAt:'2026-11-09T20:00:00Z',projectId:'projeto-a',
    provenance:'observed',ingestionMode:'live',payload:{workspaceKey:'workspace-a'},evidenceRefs:[]};
  assert.equal(validateEvent(event),true,JSON.stringify(validateEvent.errors));
  assert.equal(validateEvent({...event,payload:{}}),false);
  assert.equal(validateEvent({...event,payload:{workspaceKey:'workspace-a',path:'C:\\segredo'}}),false);
  assert.equal(validateEvent({...event,projectId:undefined}),false);
});

test('snapshot distingue sala ativa e incerta em setores sem reservar espaço fixo', () => {
  const snapshot = {schemaVersion:'1.0',mode:'live',revision:1,streamSequence:1,
    projects:[{projectId:'a',name:'API'}],roomPlacements:[{projectId:'a',sectorId:'setor-02',slotId:'slot-01',layoutVersion:'1',status:'uncertain',lastSignalAt:'2026-11-09T20:00:00Z'}],
    sessions:[],agents:[],tasks:[],invocations:[],feed:[],sources:[],environments:[],resources:[],projectResources:[],dependencies:[],resourceStates:[],incidents:[],capabilities:[]};
  assert.equal(validateSnapshot(snapshot),true,JSON.stringify(validateSnapshot.errors));
  assert.equal(validateSnapshot({...snapshot,roomPlacements:[{...snapshot.roomPlacements[0],status:'closed'}]}),false);
});
