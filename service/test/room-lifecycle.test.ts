import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventStore, type NormalizedEvent } from '../src/store/event-store.ts';

const at = (second: number) => `2026-11-09T20:00:${String(second).padStart(2, '0')}Z`;
const source = (projectId: string, sourceId: string) => ({
  projectId, sourceId, sourceVersion: 'fixture-1', provider: 'claude' as const,
  accountRef: 'conta-sintetica', filePath: `C:\\fixture\\${sourceId}.jsonl`
});

function event(sourceId: string, projectId: string | undefined, type: string, id: string, second: number, workspaceKey = 'janela-1'): NormalizedEvent {
  return { schemaVersion: '1.0', eventId: id, sourceId, sourceEventId: id, sourceVersion: 'fixture-1', type,
    observedAt: at(second), receivedAt: at(second), ...(projectId ? { projectId } : {}),
    provenance: 'observed', ingestionMode: 'live', payload: type.startsWith('workspace.') ? { workspaceKey } : {}, evidenceRefs: [] };
}

function apply(store: EventStore, input: NormalizedEvent, offset: number) {
  return store.apply(input, { sourceId: input.sourceId, fileKey: 'fixture', generation: 1, offset });
}

function placements(store: EventStore) {
  return store.snapshot().roomPlacements as { projectId: string; sectorId: string; slotId: string; status: string }[];
}

test('duas fontes no mesmo projeto ocupam uma sala; última saída explícita a desativa e posição retorna após reinício', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-rooms-'));
  const databasePath = path.join(directory, 'state.sqlite');
  let store = new EventStore(databasePath);
  t.after(() => { try { store.close(); } catch { /* encerrado para reinício */ } rmSync(directory, {recursive:true,force:true}); });
  store.registerProject({projectId:'a',name:'API',canonicalPath:'C:\\Projetos\\a\\api'});
  store.registerProject({projectId:'b',name:'API',canonicalPath:'D:\\Projetos\\b\\api'});
  store.reconcileSessionSourceBindings([source('a','fonte-1'),source('a','fonte-2'),source('b','fonte-3')]);
  assert.deepEqual(placements(store), []);
  apply(store,event('fonte-1','a','workspace.opened','e1',1),1);
  apply(store,event('fonte-2','a','workspace.opened','e2',2),1);
  apply(store,event('fonte-3','b','workspace.opened','e3',3),1);
  const initial = placements(store);
  assert.deepEqual(initial.map(item=>[item.projectId,item.sectorId,item.slotId,item.status]),
    [['a','setor-01','slot-01','active'],['b','setor-01','slot-02','active']]);
  assert.equal(apply(store,event('fonte-1','a','workspace.opened','e1',1),2).reason,'duplicate');
  assert.deepEqual(placements(store),initial);
  apply(store,event('fonte-1','a','workspace.closed','e4',4),3);
  assert.equal(placements(store).find(item=>item.projectId==='a')?.status,'active');
  apply(store,event('fonte-2','a','workspace.closed','e5',5),2);
  assert.deepEqual(placements(store).map(item=>item.projectId),['b']);
  store.close();
  store = new EventStore(databasePath);
  apply(store,event('fonte-1','a','workspace.opened','e6',6),4);
  assert.deepEqual(placements(store).find(item=>item.projectId==='a')?.sectorId,initial[0]?.sectorId);
  assert.deepEqual(placements(store).find(item=>item.projectId==='a')?.slotId,initial[0]?.slotId);
});

test('perda preserva sala incerta; evento antigo e projeto fora do vínculo não reativam', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-rooms-'));
  const store = new EventStore(path.join(directory, 'state.sqlite'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'a',name:'API',canonicalPath:'C:\\Projetos\\a'});
  store.registerProject({projectId:'b',name:'API',canonicalPath:'D:\\Projetos\\b'});
  store.reconcileSessionSourceBindings([source('a','fonte-1')]);
  assert.equal(apply(store,event('fonte-1','b','workspace.opened','fora',1),1).reason,'unknown_project');
  assert.equal(apply(store,{...event('fonte-1','a','workspace.opened','versao-fora',1),sourceVersion:'fixture-antiga'},2).reason,'unknown_project');
  assert.equal(apply(store,{...event('fonte-1','a','workspace.opened','provedor-fora',1),provider:'codex'},3).reason,'unknown_project');
  assert.equal(apply(store,{...event('nao-autorizada','a','session.observed','sessao-fora',1),provider:'claude',sessionKey:'s-fora'},1).reason,'unknown_project');
  assert.deepEqual(placements(store),[]);
  apply(store,event('fonte-1','a','workspace.opened','abre',2),4);
  apply(store,event('fonte-1',undefined,'source.unavailable','perda',4),5);
  assert.equal(placements(store)[0]?.status,'uncertain');
  apply(store,event('fonte-1','a','workspace.opened','atrasado',3),6);
  assert.equal(placements(store)[0]?.status,'uncertain');
  apply(store,event('fonte-1','a','workspace.opened','retorna',5),7);
  assert.equal(placements(store)[0]?.status,'active');
  apply(store,event('fonte-1','a','workspace.closed','fecha',6),8);
  assert.deepEqual(placements(store),[]);
  assert.equal(store.quarantineCount(),4);
});

test('sessões paralelas mantêm uma sala até o último encerramento observado', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-rooms-'));
  const store = new EventStore(path.join(directory, 'state.sqlite'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'a',name:'API',canonicalPath:'C:\\Projetos\\a'});
  store.reconcileSessionSourceBindings([source('a','fonte-1')]);
  const session = (sessionKey: string, type: string, id: string, second: number) =>
    ({...event('fonte-1','a',type,id,second),sessionKey,provider:'claude' as const});
  apply(store,session('s1','session.observed','s1-open',1),1);
  apply(store,session('s2','session.working','s2-work',2),2);
  assert.deepEqual(placements(store).map(room=>room.projectId),['a']);
  apply(store,session('s1','session.ended','s1-end',3),3);
  assert.equal(placements(store)[0]?.status,'active');
  apply(store,session('s2','session.ended','s2-end',4),4);
  assert.deepEqual(placements(store),[]);
});

test('sete projetos observados ocupam seis posições no primeiro setor e uma no segundo', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-rooms-'));
  const store = new EventStore(path.join(directory, 'state.sqlite'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  const sources = Array.from({length:7},(_,index) => source(`p${index+1}`,`fonte-${index+1}`));
  for (let index=0;index<7;index++) store.registerProject({projectId:`p${index+1}`,name:'Mesmo nome',canonicalPath:`C:\\Projetos\\p${index+1}`});
  store.reconcileSessionSourceBindings(sources);
  for (let index=0;index<7;index++) apply(store,event(`fonte-${index+1}`,`p${index+1}`,'workspace.opened',`abre-${index+1}`,index+1),1);
  const rooms = placements(store);
  assert.equal(rooms.filter(room=>room.sectorId==='setor-01').length,6);
  assert.deepEqual([rooms[6]?.projectId,rooms[6]?.sectorId,rooms[6]?.slotId,rooms[6]?.status],
    ['p7','setor-02','slot-01','active']);
});

test('projetos só configurados não empurram o primeiro projeto ativo ao segundo setor', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-rooms-'));
  const store = new EventStore(path.join(directory, 'state.sqlite'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  for (let index=1;index<=7;index++) store.registerProject({projectId:`p${index}`,name:'API',canonicalPath:`C:\\Projetos\\p${index}`});
  store.reconcileSessionSourceBindings([source('p7','fonte-7')]);
  apply(store,event('fonte-7','p7','workspace.opened','primeiro-ativo',1),1);
  assert.deepEqual(placements(store).map(item=>[item.projectId,item.sectorId,item.slotId]),
    [['p7','setor-01','slot-01']]);
});

test('replay conserva sala aberta apenas por workspace e a retira após fechamento', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-rooms-'));
  const store = new EventStore(path.join(directory, 'state.sqlite'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'a',name:'API',canonicalPath:'C:\\Projetos\\a'});
  store.reconcileSessionSourceBindings([source('a','fonte-1')]);
  const base = Date.now() + 1000;
  const openedAt = new Date(base).toISOString();
  const during = new Date(base + 1000).toISOString();
  const closedAt = new Date(base + 2000).toISOString();
  const after = new Date(base + 3000).toISOString();
  apply(store,{...event('fonte-1','a','workspace.opened','abre-replay',1),observedAt:openedAt,receivedAt:openedAt},1);
  assert.deepEqual((store.historicalSnapshot(during).roomPlacements as {projectId:string;status:string}[])
    .map(room=>[room.projectId,room.status]),[['a','active']]);
  apply(store,{...event('fonte-1','a','workspace.closed','fecha-replay',2),observedAt:closedAt,receivedAt:closedAt},2);
  assert.deepEqual(store.historicalSnapshot(after).roomPlacements,[]);
});

test('perda usa ordem cronológica com timestamps de precisão diferente', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wr3d-rooms-'));
  const store = new EventStore(path.join(directory, 'state.sqlite'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'a',name:'API',canonicalPath:'C:\\Projetos\\a'});
  store.reconcileSessionSourceBindings([source('a','fonte-1')]);
  apply(store,event('fonte-1','a','workspace.opened','abre-inteiro',2),1);
  apply(store,{...event('fonte-1',undefined,'source.unavailable','perda-fracao',2),observedAt:'2026-11-09T20:00:02.500Z'},2);
  assert.equal(placements(store)[0]?.status,'uncertain');
  apply(store,{...event('fonte-1','a','workspace.opened','reabre-fracao',3),observedAt:'2026-11-09T20:00:03.500Z'},3);
  assert.equal(placements(store)[0]?.status,'active');
  apply(store,event('fonte-1',undefined,'source.unavailable','perda-antiga',3),4);
  assert.equal(placements(store)[0]?.status,'active');
});
