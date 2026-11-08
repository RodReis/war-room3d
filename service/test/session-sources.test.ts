import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { EventStore } from '../src/store/event-store.ts';
import { parseSessionSources, SessionFileCollector } from '../src/sessions/file-source.ts';
import { sanitizeSourceRecord } from '../src/sessions/capture-source.ts';
import { adaptSessionRecord } from '../src/sessions/adapters.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

test('captura descarta conteúdo e caminhos privados', () => {
  const claude = sanitizeSourceRecord('claude',{hook_event_name:'UserPromptSubmit',session_id:'s',cwd:'C:\\segredo',prompt:'token privado'});
  const codex = sanitizeSourceRecord('codex',{method:'item/completed',params:{threadId:'t',item:{type:'commandExecution',id:'i',command:'echo segredo',status:'completed'}}});
  assert.equal(claude?.hook_event_name,'UserPromptSubmit');
  assert.equal(typeof claude?.cwdHash,'string');
  assert.equal(JSON.stringify(claude).includes('token privado'),false);
  assert.deepEqual(codex,{method:'item/completed',params:{threadId:'t',item:{type:'commandExecution',id:'i',status:'completed'}}});
});

test('comando de hook grava somente campos permitidos', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-capture-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const filePath = path.join(directory,'claude.jsonl');
  const script = new URL('../src/sessions/capture-source.ts',import.meta.url);
  const result = spawnSync(process.execPath,[script.pathname.startsWith('/') && process.platform==='win32' ? decodeURIComponent(script.pathname.slice(1)) : decodeURIComponent(script.pathname),'claude',filePath],{
    input:JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'s',prompt:'segredo-sintetico',cwd:'C:\\privado'}),encoding:'utf8'
  });
  assert.equal(result.status,0,result.stderr);
  const saved = readFileSync(filePath,'utf8');
  assert.equal(JSON.parse(saved).session_id,'s');
  assert.equal(typeof JSON.parse(saved).cwdHash,'string');
  assert.equal(saved.includes('segredo-sintetico'),false);
});

test('captura Codex em fluxo não persiste conteúdo nem resposta RPC', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-codex-capture-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const filePath = path.join(directory,'codex.jsonl');
  const script = new URL('../src/sessions/capture-source.ts',import.meta.url);
  const scriptPath = process.platform==='win32' ? decodeURIComponent(script.pathname.slice(1)) : decodeURIComponent(script.pathname);
  const result = spawnSync(process.execPath,[scriptPath,'codex',filePath,'--stream'],{input:
    `${JSON.stringify({id:1,result:{token:'segredo'}})}\n${JSON.stringify({method:'item/completed',params:{threadId:'thread',item:{type:'commandExecution',id:'item',command:'segredo',status:'completed'}}})}\n`,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const saved = readFileSync(filePath,'utf8');
  assert.equal(saved.split('\n').filter(Boolean).length,1);
  assert.equal(saved.includes('segredo'),false);
});

test('backfill preserva horário da fonte distinto do recebimento', () => {
  const source = {sourceId:'lab',sourceVersion:'2.1.319',provider:'claude' as const,projectId:'p',accountRef:'lab',filePath:'C:\\lab\\events.jsonl'};
  const raw = {...sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'s',cwd:'C:\\repo\\p'}),capturedAt:'2026-11-08T10:00:00.000Z'};
  const events = adaptSessionRecord(source,raw,'file:100','2026-11-08T11:00:00.000Z');
  assert.equal(events[0].observedAt,'2026-11-08T10:00:00.000Z');
  assert.equal(events[0].receivedAt,'2026-11-08T11:00:00.000Z');
});

test('duas fontes, filho, linha parcial, reinício, rotação e perda mantêm identidades', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-sources-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const db = path.join(directory,'events.db');
  const claudeFile = path.join(directory,'claude.jsonl');
  const codexFile = path.join(directory,'codex.jsonl');
  const config = parseSessionSources({schemaVersion:'1.0',projects:[
    {projectId:'p-claude',name:'api',canonicalPath:'C:\\repo\\api'},
    {projectId:'p-codex',name:'api',canonicalPath:'D:\\repo\\api'}
  ],sources:[
    {sourceId:'claude-lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p-claude',accountRef:'lab-claude',filePath:claudeFile},
    {sourceId:'codex-lab',sourceVersion:'0.166.0',provider:'codex',projectId:'p-codex',accountRef:'lab-codex',filePath:codexFile}
  ]});
  let store = new EventStore(db);
  for (const project of config.projects) store.registerProject(project);
  const collector = new SessionFileCollector(store,config.sources);
  const line = (value: object) => `${JSON.stringify(value)}\n`;
  writeFileSync(claudeFile,line(sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'claude-1',cwd:'C:\\repo\\api'})!));
  writeFileSync(codexFile,line(sanitizeSourceRecord('codex',{method:'thread/started',params:{thread:{id:'codex-1',cwd:'D:\\repo\\api'}}})!));
  collector.poll();
  assert.equal((store.snapshot().sessions as unknown[]).length,2);
  appendFileSync(codexFile,line(sanitizeSourceRecord('codex',{method:'thread/started',params:{thread:{id:'codex-1',cwd:'D:\\repo\\api'}}})!));
  collector.poll();
  assert.equal((store.snapshot().sessions as unknown[]).length,2);
  assert.equal((store.snapshot().agents as unknown[]).length,2);
  appendFileSync(codexFile,JSON.stringify({method:'item/completed',params:{threadId:'codex-1',item:{type:'collabAgentToolCall',id:'spawn-1',receiverThreadIds:['child-1']}}}));
  collector.poll();
  assert.equal((store.snapshot().agents as unknown[]).length,2);
  appendFileSync(codexFile,'\n');
  collector.poll();
  const agents = store.snapshot().agents as {parentStatus:string}[];
  assert.equal(agents.length,3);
  assert.equal(agents.filter(agent => agent.parentStatus==='vinculado').length,1);
  const beforeDuplicateChild = store.snapshot().streamSequence;
  appendFileSync(codexFile,line({method:'item/completed',params:{threadId:'codex-1',item:{type:'collabAgentToolCall',id:'spawn-1',receiverThreadIds:['child-1']}}}));
  collector.poll();
  assert.equal(store.snapshot().streamSequence,beforeDuplicateChild);
  const before = store.snapshot().streamSequence;
  store.close();
  store = new EventStore(db);
  const resumed = new SessionFileCollector(store,config.sources);
  resumed.poll();
  assert.equal(store.snapshot().streamSequence,before);
  renameSync(codexFile,path.join(directory,'codex.old'));
  resumed.poll();
  assert.equal((store.snapshot().sources as {sourceId:string;status:string;errorCode?:string}[]).find(x=>x.sourceId==='codex-lab')?.errorCode,'file_missing');
  assert.equal((store.snapshot().sessions as {projectId:string;presence:string}[]).find(x=>x.projectId==='p-codex')?.presence,'desconhecida');
  writeFileSync(codexFile,line({method:'turn/started',params:{threadId:'codex-1'}}));
  resumed.poll();
  assert.equal((store.snapshot().sources as {sourceId:string;status:string}[]).find(x=>x.sourceId==='codex-lab')?.status,'atual');
  assert.equal((store.snapshot().sessions as {projectId:string;presence:string}[]).find(x=>x.projectId==='p-codex')?.presence,'trabalhando');
  store.reconcileSessionSourceBindings(config.sources);
  store.reconcileSessionSourceBindings([config.sources[0]]);
  assert.equal((store.snapshot().sources as {sourceId:string;status:string;errorCode?:string}[]).find(x=>x.sourceId==='codex-lab')?.errorCode,'revoked');
  assert.equal((store.snapshot().sessions as {projectId:string;presence:string}[]).find(x=>x.projectId==='p-codex')?.presence,'desconhecida');
  store.close();
});

test('atividade redigida atravessa arquivo, SQLite, HTTP e sequência SSE', async t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-session-http-'));
  const filePath = path.join(directory,'source.jsonl');
  const store = new EventStore(path.join(directory,'events.db'));
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\projeto'});
  const collector = new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p',accountRef:'lab',filePath}]);
  const token = randomBytes(32).toString('hex');
  const {server,url} = await startReadOnlyServer(store,token);
  t.after(() => { server.closeAllConnections(); server.close(); store.close(); rmSync(directory,{recursive:true,force:true}); });
  writeFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'s',cwd:'C:\\repo\\projeto',prompt:'privado'}))}\n`);
  collector.poll();
  const baseline = store.snapshot().streamSequence as number;
  appendFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'PreToolUse',session_id:'s',cwd:'C:\\repo\\projeto',tool_name:'Skill',tool_use_id:'skill-use',tool_input:{skill:'review',secret:'privado'}}))}\n`);
  collector.poll();
  const headers = {Authorization:`Bearer ${token}`};
  const response = await fetch(`${url}/v1/snapshot`,{headers});
  assert.equal(response.status,200);
  const snapshot = await response.json() as {invocations:{kind:string;name:string;status:string}[];streamSequence:number};
  assert.deepEqual(snapshot.invocations.map(item=>[item.kind,item.name,item.status]),[['skill','review','observada']]);
  assert.equal((store.snapshot().capabilities as string[]).includes('skills'),true);
  assert.equal(snapshot.streamSequence,baseline+1);
  const controller = new AbortController();
  const stream = await fetch(`${url}/v1/events`,{headers:{...headers,'Last-Event-ID':String(baseline)},signal:controller.signal});
  assert.equal(stream.status,200);
  const reader = stream.body!.getReader();
  const frame = new TextDecoder().decode((await reader.read()).value);
  assert.match(frame,/event: event\.changed/);
  assert.match(frame,new RegExp(`id: ${baseline+1}`));
  controller.abort();
  await reader.cancel().catch(()=>{});
});

test('janela de frescor expirada sinaliza incerteza até novo evento', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-stale-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\p'});
  const filePath = path.join(directory,'events.jsonl');
  const collector = new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p',accountRef:'lab',filePath,staleAfterMs:1000}]);
  writeFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'s',cwd:'C:\\repo\\p'}))}\n`);
  collector.poll();
  const observed = store.snapshot().sources as {lastApplied:string}[];
  collector.poll(Date.parse(observed[0].lastApplied)+1001);
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'desconhecida');
  collector.poll();
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'indisponivel');
  assert.equal((store.snapshot().sources as {errorCode:string}[])[0].errorCode,'stale');
  appendFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'UserPromptSubmit',session_id:'s',cwd:'C:\\repo\\p',prompt_id:'p1'}))}\n`);
  collector.poll();
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'trabalhando');
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'atual');
});

test('hook de projeto homônimo diferente não entra no projeto configurado', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-wrong-project-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'a',name:'api',canonicalPath:'C:\\repo\\api'});
  store.registerProject({projectId:'b',name:'api',canonicalPath:'D:\\repo\\api'});
  const filePath = path.join(directory,'claude.jsonl');
  writeFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'s',cwd:'D:\\repo\\api'}))}\n`);
  new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'a',accountRef:'lab',filePath}]).poll();
  assert.deepEqual(store.snapshot().sessions,[]);
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'indisponivel');
  assert.equal((store.snapshot().sources as {errorCode:string}[])[0].errorCode,'invalid_scope');
  const codexFile = path.join(directory,'codex.jsonl');
  writeFileSync(codexFile,`${JSON.stringify(sanitizeSourceRecord('codex',{method:'thread/started',params:{thread:{id:'t',cwd:'D:\\repo\\api'}}}))}\n`);
  new SessionFileCollector(store,[{sourceId:'codex-lab',sourceVersion:'0.166.0',provider:'codex',projectId:'a',accountRef:'lab',filePath:codexFile}]).poll();
  assert.deepEqual(store.snapshot().sessions,[]);
  assert.equal((store.snapshot().sources as {sourceId:string;errorCode?:string}[]).find(x=>x.sourceId==='codex-lab')?.errorCode,'invalid_scope');
});

test('configuração inválida reverte cadastro parcial de projetos', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-config-rollback-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  assert.throws(() => store.configureSessionSources([
    {projectId:'a',name:'api',canonicalPath:'C:\\repo\\same'},
    {projectId:'b',name:'api',canonicalPath:'C:\\repo\\same'}
  ],[]));
  assert.deepEqual(store.snapshot().projects,[]);
});
