import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EventStore } from '../src/store/event-store.ts';
import { parseWorkspaceConfig, WorkspaceFileCollector } from '../src/sessions/workspace-source.ts';

const digest = (s:string) => createHash('sha256').update(s).digest('hex');

function setup(t:test.TestContext) {
  const directory=mkdtempSync(path.join(tmpdir(),'wr3d-workspaces-'));
  const store=new EventStore(path.join(directory,'db.sqlite'));
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  const config=parseWorkspaceConfig({schemaVersion:'1.0',vscodeVersion:'1.148.0',
    projects:[{projectId:'api-a',name:'API',canonicalPath:'C:\\lab\\a\\api'},
      {projectId:'api-b',name:'API',canonicalPath:'C:\\lab\\b\\api'}],
    sources:['api-a','api-b'].map(projectId=>({sourceId:'vscode-'+projectId,projectId,directory:path.join(directory,projectId),staleAfterMs:15000}))});
  for(const source of config.sources)mkdirSync(source.directory);
  store.configureWorkspaceSources(config.projects,config.sources);
  const collector=new WorkspaceFileCollector(store,config);
  const write=(projectId:string,window:string,state:'opened'|'closed',now:number,extra={})=>{
    const source=config.sources.find(s=>s.projectId===projectId)!;
    const project=config.projects.find(p=>p.projectId===projectId)!;
    const record={schemaVersion:'1.0',sourceVersion:'vscode-workspace-1',vscodeVersion:'1.148.0',windowKey:digest(window),publisherId:digest('publisher'),
      cwdHash:digest(project.canonicalPath.toLowerCase()),state,sequence:now,observedAt:new Date(now).toISOString(),...extra};
    writeFileSync(path.join(source.directory,digest(window)+'.json'),JSON.stringify(record));
  };
  const rooms=()=>store.snapshot().roomPlacements as {projectId:string;slotId:string;status:string}[];
  return {store,config,collector,write,rooms};
}

test('workspace local cria salas homônimas distintas sem sessões, agentes ou atividade',t=>{
  const {store,collector,write,rooms}=setup(t),now=Date.now();
  write('api-a','janela-1','opened',now);write('api-b','janela-1','opened',now);
  collector.poll(now);
  assert.deepEqual(rooms().map(r=>r.projectId),['api-a','api-b']);
  assert.notEqual(rooms()[0]!.slotId,rooms()[1]!.slotId);
  assert.deepEqual(store.snapshot().sessions,[]);assert.deepEqual(store.snapshot().agents,[]);
  assert.equal(store.activity.hour(new Date(now).toISOString()).series.every(s=>s.buckets.every(b=>b.count===null||b.count===0)),true);
});

test('duas janelas fecham isoladamente, perda individual fica incerta e reconexão recupera o slot',t=>{
  const {collector,write,rooms}=setup(t),now=Date.now();
  write('api-a','janela-1','opened',now);write('api-a','janela-2','opened',now);collector.poll(now);
  const slot=rooms()[0]!.slotId;
  write('api-a','janela-1','closed',now+1);collector.poll(now+1);
  assert.equal(rooms()[0]!.status,'active');
  collector.poll(now+16000);assert.equal(rooms()[0]!.status,'uncertain');
  write('api-a','janela-2','opened',now+16001);collector.poll(now+16001);
  assert.equal(rooms()[0]!.status,'active');assert.equal(rooms()[0]!.slotId,slot);
  write('api-a','janela-2','closed',now+16002);collector.poll(now+16002);assert.deepEqual(rooms(),[]);
});

test('reinício não duplica eventos e fonte workspace não pode forjar sessão de agente',t=>{
  const {store,config,collector,write}=setup(t),now=Date.now();
  write('api-a','janela','opened',now);collector.poll(now);
  const seq=store.snapshot().streamSequence;
  new WorkspaceFileCollector(store,config).poll(now);assert.equal(store.snapshot().streamSequence,seq);
  const result=store.apply({schemaVersion:'1.0',eventId:'forged',sourceId:'vscode-api-a',sourceVersion:'vscode-workspace-1',
    type:'session.working',projectId:'api-a',provider:'codex',sessionKey:'forged',observedAt:new Date(now+1).toISOString(),receivedAt:new Date(now+1).toISOString(),
    provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]},{sourceId:'vscode-api-a',fileKey:'fake',generation:0,offset:1});
  assert.equal(result.applied,false);assert.deepEqual(store.snapshot().sessions,[]);
  const resource=store.apply({schemaVersion:'1.0',eventId:'forged-resource',sourceId:'vscode-api-a',sourceVersion:'vscode-workspace-1',
    type:'resource.observed',resourceId:'fake',environmentId:'fake',observedAt:new Date(now+1).toISOString(),receivedAt:new Date(now+1).toISOString(),
    provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]},{sourceId:'vscode-api-a',fileKey:'fake',generation:0,offset:2});
  assert.equal(resource.applied,false,'a ausência de projectId não contorna o papel da fonte');
});

test('janela vencida não fica aberta quando outra janela continua emitindo sinais',t=>{
  const {store,collector,write,rooms}=setup(t),now=Date.now();
  write('api-a','lost','opened',now);write('api-a','live','opened',now);collector.poll(now);
  write('api-a','live','opened',now+16000);collector.poll(now+16000);
  assert.equal(rooms()[0]!.status,'active');
  assert.equal(store.workspacePresence('vscode-api-a').filter(w=>w.status==='uncertain').length,1);
  write('api-a','live','closed',now+16001);collector.poll(now+16001);
  assert.equal(rooms()[0]!.status,'uncertain');
});

test('fonte workspace não pode ser reutilizada como fonte Claude/Codex',t=>{
  const {store}=setup(t);
  assert.throws(()=>store.reconcileSessionSourceBindings([{sourceId:'vscode-api-a',sourceVersion:'fixture',provider:'claude',
    projectId:'api-a',accountRef:'fake',filePath:'C:\\fake.jsonl'}]),/colide com workspace/);
});

test('arquivos grandes e conteúdo extra não viram evidência nem sala',t=>{
  const {config,collector,write,rooms}=setup(t),now=Date.now();
  write('api-a','janela','opened',now,{content:'segredo não autorizado'});collector.poll(now);assert.deepEqual(rooms(),[]);
  writeFileSync(path.join(config.sources[0]!.directory,digest('janela')+'.json'),'x'.repeat(4097));
  collector.poll(now+1);assert.deepEqual(rooms(),[]);
});

test('registro adulterado não abre sala e revogação preserva cadastro sem renovar presença',t=>{
  const {store,config,collector,write,rooms}=setup(t),now=Date.now();
  write('api-a','janela','opened',now,{cwdHash:digest('outro')});collector.poll(now);assert.deepEqual(rooms(),[]);
  write('api-a','janela','opened',now+1);collector.poll(now+1);assert.equal(rooms().length,1);
  store.configureWorkspaceSources(config.projects,[]);
  write('api-a','janela','opened',now+2);collector.poll(now+2);
  assert.equal(rooms()[0]!.status,'uncertain');assert.equal((store.snapshot().projects as unknown[]).length,2);
});
