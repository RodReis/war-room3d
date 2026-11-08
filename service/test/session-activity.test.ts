import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventStore, type NormalizedEvent } from '../src/store/event-store.ts';
import Database from 'better-sqlite3';

test('tarefa e invocações sobrevivem ao reinício; perda de fonte não conclui trabalho', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-activity-'));
  const databasePath = path.join(directory, 'events.db');
  t.after(() => { rmSync(directory, { recursive: true, force: true }); });
  let store = new EventStore(databasePath);
  store.registerProject({ projectId: 'p', name: 'Projeto', canonicalPath: 'C:\\projetos\\um' });
  const event = (type: string, n: number, payload: NormalizedEvent['payload']): NormalizedEvent => ({
    schemaVersion: '1.0', eventId: `event-${n}`, sourceId: 'source', sourceEventId: `source-${n}`,
    sourceVersion: 'fixture-1', type, observedAt: `2026-11-08T10:00:${String(n).padStart(2,'0')}Z`,
    receivedAt: `2026-11-08T10:00:${String(n).padStart(2,'0')}Z`, projectId: 'p',
    provider: 'claude', sessionKey: 'session', provenance: 'observed', ingestionMode: 'live', payload, evidenceRefs: []
  });
  const apply = (value: NormalizedEvent, offset: number) => store.apply(value, { sourceId: 'source', fileKey: 'file', generation: 0, offset });
  apply(event('session.observed', 1, {}), 1);
  apply(event('task.working', 2, { taskId: 'task', title: 'Revisar' }), 2);
  apply(event('tool.observed', 3, { invocationId: 'tool', name: 'Read' }), 3);
  apply(event('skill.observed', 4, { invocationId: 'skill', name: 'review' }), 4);
  assert.equal(apply(event('skill.observed', 4, { invocationId: 'skill', name: 'review' }), 5).reason, 'duplicate');
  store.close();
  store = new EventStore(databasePath);
  assert.equal(store.getCursor('source','file')?.offset, 5);
  apply(event('source.unavailable', 5, { reason: 'source_lost' }), 6);
  const state = store.snapshot();
  assert.equal((state.tasks as {status:string}[])[0].status, 'desconhecida');
  assert.deepEqual((state.invocations as {kind:string;status:string}[]).map(x => [x.kind,x.status]), [['skill','desconhecida'],['tool','desconhecida']]);
  assert.equal((state.sessions as {presence:string}[])[0].presence, 'desconhecida');
  assert.equal((state.sources as {status:string}[])[0].status, 'indisponivel');
  store.close();
});

test('retomada explícita reabre sessão encerrada sem reabrir tarefa', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-resume-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\p'});
  const event = (type:string,n:number,payload:NormalizedEvent['payload']):NormalizedEvent => ({
    schemaVersion:'1.0',eventId:`e${n}`,sourceId:'source',sourceEventId:`r${n}`,sourceVersion:'2.1.319',type,
    observedAt:`2026-11-08T10:00:0${n}Z`,receivedAt:`2026-11-08T10:00:0${n}Z`,projectId:'p',provider:'claude',sessionKey:'s',
    provenance:'observed',ingestionMode:'live',payload,evidenceRefs:[]
  });
  const apply=(value:NormalizedEvent,n:number)=>store.apply(value,{sourceId:'source',fileKey:'f',generation:0,offset:n});
  apply(event('session.observed',1,{}),1);
  apply(event('task.working',2,{taskId:'task',title:'Tarefa observada'}),2);
  apply(event('session.ended',3,{}),3);
  assert.equal((store.snapshot().tasks as {status:string}[])[0].status,'desconhecida');
  apply(event('session.observed',4,{}),4);
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'encerrada');
  apply(event('session.observed',5,{reason:'source_recovered'}),5);
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'observada');
  assert.equal((store.snapshot().tasks as {status:string}[])[0].status,'desconhecida');
});

test('migração 0017 abre banco v16 sem perder projeto existente', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-v16-'));
  const databasePath = path.join(directory,'events.db');
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const db = new Database(databasePath);
  const root = new URL('../src/store/',import.meta.url);
  db.exec(readFileSync(new URL('schema.sql',root),'utf8'));
  for (const name of readdirSync(new URL('migrations/',root)).filter(name => /^00(0[2-9]|1[0-6])_.*\.sql$/.test(name)).sort())
    db.exec(readFileSync(new URL(`migrations/${name}`,root),'utf8'));
  db.prepare('INSERT INTO projects(project_id,name) VALUES (?,?)').run('p','Projeto antigo');
  assert.equal((db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as {value:number}).value,16);
  db.close();
  const store = new EventStore(databasePath);
  assert.deepEqual(store.snapshot().projects,[{projectId:'p',name:'Projeto antigo'}]);
  assert.deepEqual(store.snapshot().tasks,[]);
  assert.deepEqual(store.snapshot().invocations,[]);
  assert.equal((store.snapshot().capabilities as string[]).includes('skills'),false);
  store.close();
});

test('linha com dois eventos reverte por completo se segundo viola contrato', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-batch-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\p'});
  const first:NormalizedEvent = {schemaVersion:'1.0',eventId:'e1',sourceId:'source',sourceEventId:'r1',sourceVersion:'test',
    type:'session.observed',observedAt:'2026-11-08T10:00:00Z',receivedAt:'2026-11-08T10:00:00Z',projectId:'p',provider:'codex',
    sessionKey:'s',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const cursor = {sourceId:'source',fileKey:'f',generation:0,offset:1};
  assert.throws(() => store.applyBatch([first,{...first,eventId:'e2',sourceEventId:'r2',type:'agent.observed',agentKey:'a',payload:{prompt:'proibido'} as NormalizedEvent['payload']}],cursor),/Lote/);
  assert.deepEqual(store.snapshot().sessions,[]);
  assert.equal(store.getCursor('source','f'),null);
  assert.equal(store.quarantineCount(),0);
});
