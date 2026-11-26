import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, appendFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSessionSources, SessionFileCollector } from '../src/sessions/file-source.ts';
import { adaptSessionRecord, adaptConversationRecord, type SessionSource } from '../src/sessions/adapters.ts';
import { sanitizeSourceRecord } from '../src/sessions/capture-source.ts';
import { EventStore } from '../src/store/event-store.ts';

// Todos os eventos deste arquivo são sintéticos; nenhuma prova do aplicativo.
const origin = {surface:'desktop',version:'26.1117.4957.0',transport:'hooks'} as const;
const source:SessionSource = {sourceId:'codex-desktop-lab',sourceVersion:'0.171.0-alpha.13',provider:'codex',
  projectId:'p',accountRef:'synthetic',filePath:path.resolve('desktop.jsonl'),origin};
const project = {projectId:'p',name:'Sintético',canonicalPath:'C:\\lab\\projeto'};
const at = '2026-11-26T12:00:00.000Z';
const hook = (name:string,extra:object={}) => ({...sanitizeSourceRecord('codex',{
  hook_event_name:name,session_id:'s',cwd:project.canonicalPath,...extra}),capturedAt:at});

test('origem Codex é estrita; Desktop não aceita transporte de cliente App Server', () => {
  const config = (candidate:object) => ({schemaVersion:'1.0',projects:[project],sources:[candidate]});
  assert.deepEqual(parseSessionSources(config(source)).sources[0].origin,origin);
  for(const invalid of [null,{}, {...origin,surface:'cloud'}, {...origin,transport:'app-server'},
    {...origin,version:'latest'}, {...origin,verified:true}]) {
    assert.throws(()=>parseSessionSources(config({...source,origin:invalid})));
  }
  assert.throws(()=>parseSessionSources(config({...source,provider:'claude'})));
  assert.ok(parseSessionSources(config({...source,origin:{surface:'app-server-client',version:'0.171.0',transport:'app-server'}})));
  const {origin:omitted,...legacy}=source;
  assert.equal(parseSessionSources(config(legacy)).sources[0].origin,undefined);
});

test('adaptador Desktop recusa notificações App Server inclusive conteúdo opt-in', () => {
  const raw={method:'thread/started',params:{thread:{id:'s',cwd:project.canonicalPath}},capturedAt:at};
  assert.deepEqual(adaptSessionRecord(source,raw,'r',at),[]);
  const message={method:'item/completed',params:{threadId:'s',item:{id:'m',type:'userMessage',text:'privado'}},capturedAt:at};
  assert.equal(adaptConversationRecord({...source,conversationContent:{consentRef:'test',retentionDays:1}},message,'r',at),null);
  assert.equal(adaptSessionRecord(source,hook('SessionStart'),'r',at).length,2);
  const ownClient={...source,origin:{surface:'app-server-client',version:'0.171.0',transport:'app-server'} as const};
  assert.deepEqual(adaptSessionRecord(ownClient,hook('SessionStart'),'r',at),[]);
});

test('Interrupt deixa sessão/agente em espera explícita sem encerrar nem criar tarefa', () => {
  const events=adaptSessionRecord(source,hook('Interrupt',{turn_id:'turn-1'}),'r',at);
  assert.deepEqual(events.map(e=>e.type),['session.waiting','agent.waiting']);
  assert.ok(events.every(e=>e.payload.reason==='explicit'));
});

test('coletor sinaliza invalid_scope ao receber App Server na fonte Desktop', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'wr3d-desktop-origin-'));
  const store=new EventStore(path.join(directory,'events.db'));
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  const scoped={...source,filePath:path.join(directory,'capture.jsonl')};
  store.configureSessionSources([project],[scoped]);
  writeFileSync(scoped.filePath,JSON.stringify({...sanitizeSourceRecord('codex',{
    method:'thread/started',params:{thread:{id:'s',cwd:project.canonicalPath}}}),capturedAt:at})+'\n');
  new SessionFileCollector(store,[scoped]).poll();
  assert.equal((store.snapshot().sessions as unknown[]).length,0);
  assert.equal((store.snapshot().sources as {errorCode:string}[])[0].errorCode,'invalid_scope');
});

test('captura Desktop seleciona projeto, remove conteúdo e recusa App Server e outro cwd', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'wr3d-desktop-capture-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const scoped={...source,filePath:path.join(directory,'capture.jsonl')};
  const config=path.join(directory,'source.json');
  writeFileSync(config,JSON.stringify({schemaVersion:'1.0',projects:[project],sources:[scoped]}));
  const script=fileURLToPath(new URL('../src/sessions/capture-codex-desktop.ts',import.meta.url));
  const send=(input:object)=>spawnSync(process.execPath,[script,config,scoped.sourceId],{input:JSON.stringify(input),encoding:'utf8'});
  const input={hook_event_name:'SessionStart',session_id:'s',cwd:project.canonicalPath,
    source:'startup',prompt:'segredo',transcript_path:'C:\\privado\\chat.jsonl',tool_input:{command:'segredo'}};
  assert.equal(send(input).status,0);
  const saved=readFileSync(scoped.filePath,'utf8');
  assert.equal(JSON.parse(saved).hook_event_name,'SessionStart');
  assert.equal(saved.includes('segredo'),false);
  assert.equal(saved.includes('privado'),false);
  const diagnostic=spawnSync(process.execPath,[script,config,scoped.sourceId,'--diagnostic'],{encoding:'utf8'});
  assert.equal(diagnostic.status,0,diagnostic.stderr);
  const info=JSON.parse(diagnostic.stdout);
  assert.equal(info.attribution,'declared');assert.equal(info.desktopProof,'not_run');assert.equal(info.contentCapture,false);
  assert.equal(diagnostic.stdout.includes(directory),false);
  assert.notEqual(send({...input,cwd:'C:\\outro'}).status,0);
  assert.notEqual(send({method:'thread/started',params:{thread:{id:'s',cwd:project.canonicalPath}}}).status,0);
  assert.equal(readFileSync(scoped.filePath,'utf8'),saved);
  assert.notEqual(send({...input,prompt:'s'.repeat(70*1024)}).status,0);
  writeFileSync(config,JSON.stringify({schemaVersion:'1.0',projects:[project],sources:[{
    ...scoped,conversationContent:{consentRef:'test',retentionDays:1}}]}));
  assert.notEqual(send(input).status,0);
});

test('fluxo sintético preserva identidade na interrupção, perda, retomada e reinício', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'wr3d-desktop-lifecycle-'));
  const database=path.join(directory,'events.db');
  let store=new EventStore(database);
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  const scoped={...source,filePath:path.join(directory,'capture.jsonl')};
  store.configureSessionSources([project],[scoped]);
  const write=(name:string,second:number,extra:object={})=>appendFileSync(scoped.filePath,
    JSON.stringify({...hook(name,extra),capturedAt:new Date(Date.parse(at)+second*1000).toISOString()})+'\n');
  write('SessionStart',0,{source:'startup'});write('UserPromptSubmit',1,{turn_id:'t1'});write('Interrupt',2,{turn_id:'t1'});
  let collector=new SessionFileCollector(store,[scoped]);collector.poll();
  const initial=store.snapshot();
  assert.equal((initial.sessions as {presence:string}[])[0].presence,'aguardando');
  const identity=(initial.sessions as {sessionKey:string}[])[0].sessionKey;
  renameSync(scoped.filePath,scoped.filePath+'.hold');collector.poll();
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'desconhecida');
  renameSync(scoped.filePath+'.hold',scoped.filePath);
  const future=Math.ceil((Date.now()-Date.parse(at))/1000)+2;
  write('SessionStart',future,{source:'resume'});collector.poll();
  assert.equal((store.snapshot().sessions as unknown[]).length,1);
  store.close();store=new EventStore(database);store.configureSessionSources([project],[scoped]);
  collector=new SessionFileCollector(store,[scoped]);
  const sequence=store.snapshot().streamSequence;collector.poll();
  assert.equal(store.snapshot().streamSequence,sequence);
  const sessions=store.snapshot().sessions as {sessionKey:string}[];
  assert.equal(sessions.length,1);assert.equal(sessions[0].sessionKey,identity);
  assert.equal((store.snapshot().projects as unknown[]).length,1);
});
