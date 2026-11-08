import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import { adaptConversationRecord, adaptSessionRecord, type SessionSource } from '../src/sessions/adapters.ts';
import { sanitizeSourceRecord } from '../src/sessions/capture-source.ts';
import { parseSessionSources, SessionFileCollector } from '../src/sessions/file-source.ts';

const at=new Date().toISOString();
const pageSchema=JSON.parse(readFileSync(new URL('../../contracts/schemas/conversation-page.v1.schema.json',import.meta.url),'utf8'));
const validatePage=new Ajv2020({strict:true}).compile(pageSchema);
const source:SessionSource={sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'project-a',accountRef:'disposable',filePath:'C:\\lab\\events.jsonl',
  conversationContent:{consentRef:'lab-consent-33',retentionDays:1}};
const raw=(hook_event_name:string,extra:Record<string,unknown>={})=>({hook_event_name,session_id:'session-a',capturedAt:at,...extra});

test('captura permanece sem conteúdo por padrão e exige opt-in explícito por fonte',()=>{
  const prompt=raw('UserPromptSubmit',{cwd:'C:\\lab',prompt:'texto sintético',prompt_id:'prompt-1'});
  assert.equal(sanitizeSourceRecord('claude',prompt)?.prompt,undefined);
  assert.equal(sanitizeSourceRecord('claude',prompt,true)?.prompt,'texto sintético');
  const tool=raw('PreToolUse',{cwd:'C:\\lab',tool_name:'Read',tool_input:{file_path:'C:\\privado',skill:'x'}});
  assert.equal(JSON.stringify(sanitizeSourceRecord('claude',tool,true)).includes('privado'),false);
  assert.equal(adaptConversationRecord({...source,conversationContent:undefined},prompt,'r-1',at),null);
  assert.throws(()=>parseSessionSources({schemaVersion:'1.0',projects:[{projectId:'project-a',name:'Lab',canonicalPath:'C:\\lab'}],
    sources:[{...source,conversationContent:{consentRef:''}}]}),/Fonte de sessão/);
  const codex={method:'item/completed',capturedAt:at,params:{threadId:'thread-lab',item:{type:'agentMessage',id:'answer-1',text:'resposta sintética',secret:'não capturar'}}};
  const captured=sanitizeSourceRecord('codex',codex,true)!;
  assert.equal(JSON.stringify(captured).includes('não capturar'),false);
  assert.equal(adaptConversationRecord({...source,provider:'codex'},{...captured,capturedAt:at},'answer-1',at)?.content,'resposta sintética');
  assert.equal(adaptConversationRecord(source,{...prompt,capturedAt:undefined},'r-2',at),null);
  assert.equal(adaptSessionRecord({...source,provider:'codex'},captured,'answer-1',at)[0].type,'message.observed');
});

test('histórico observado pagina por sessão e separa texto de recibo M4',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'wr3d-chat-'));
  const store=new EventStore(path.join(dir,'state.sqlite'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'project-a',name:'Lab A',canonicalPath:'C:\\lab\\a'});
  store.registerProject({projectId:'project-b',name:'Lab B',canonicalPath:'C:\\lab\\b'});
  const session=adaptSessionRecord(source,raw('SessionStart'),'r-start',at);
  store.applyBatch(session,{sourceId:'lab',fileKey:'test',generation:0,offset:1});
  const messages=[
    raw('UserPromptSubmit',{prompt:'pergunta sintética',prompt_id:'p1'}),
    raw('Stop',{last_assistant_message:'resposta sintética',turn_id:'t1'}),
    raw('UserPromptSubmit',{prompt:'segunda pergunta',prompt_id:'p2'})
  ];
  for(const [index,input] of messages.entries()) {
    const message=adaptConversationRecord(source,input,`r-${index}`,at);
    assert.ok(message);
    store.applyCapturedRecord(adaptSessionRecord(source,input,`r-${index}`,at),
      {sourceId:'lab',fileKey:'test',generation:0,offset:index+2},message);
  }
  const page=store.conversations.page('project-a',session[0].sessionKey!,null,2)!;
  assert.equal(validatePage(page),true,JSON.stringify(validatePage.errors));
  assert.deepEqual(page.items.map(item=>item.role),['assistant','user']);
  assert.equal(page.nextBefore,2);
  assert.equal(page.receiptIsResponse,false);
  assert.deepEqual(store.conversations.page('project-a',session[0].sessionKey!,page.nextBefore,2)?.items.map(item=>item.content),['pergunta sintética']);
  assert.equal(store.conversations.page('project-b',session[0].sessionKey!,null,20),null);
  assert.throws(()=>store.conversations.record({...adaptConversationRecord(source,messages[0],'r-0',at)!,content:'outro texto'}),/colide/);
  const readToken='r'.repeat(40),commandToken='c'.repeat(40);
  const {server,url}=await startReadOnlyServer(store,readToken,0,{token:commandToken,actor:{actorId:'operador',projectIds:['project-b']}});
  t.after(()=>server.close());
  const query=`/v1/conversations?projectId=project-a&sessionKey=${session[0].sessionKey}&limit=2`;
  const read=await fetch(url+query,{headers:{Authorization:`Bearer ${readToken}`}});
  assert.equal(read.status,200);
  assert.equal((await read.json() as {items:unknown[]}).items.length,2);
  assert.equal((await fetch(url+query,{headers:{Authorization:`Bearer ${commandToken}`}})).status,403);
  assert.equal((await fetch(url+query,{headers:{Authorization:`Bearer ${readToken}`,Origin:'http://evil.invalid'}})).status,403);
  assert.equal((await fetch(url+query+'&limit=3',{headers:{Authorization:`Bearer ${readToken}`}})).status,400);
  const expiry=Date.parse(page.items[0].expiresAt);
  assert.equal(store.conversations.purgeExpired(expiry+1),3);
  assert.equal(store.conversations.page('project-a',session[0].sessionKey!,null,20)?.items.length,0);
});

test('captura opt-in sintética atravessa CLI, arquivo, coletor e SQLite sem conteúdo no feed',t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'wr3d-chat-capture-'));
  const filePath=path.join(dir,'observed.jsonl');
  const store=new EventStore(path.join(dir,'state.sqlite'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'project-a',name:'Lab A',canonicalPath:dir});
  const scoped={...source,filePath};
  const capture=(value:unknown)=>{
    const run=spawnSync(process.execPath,[fileURLToPath(new URL('../src/sessions/capture-source.ts',import.meta.url)),'claude',filePath,'--content'],
      {input:JSON.stringify(value),encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
  };
  capture(raw('SessionStart',{cwd:dir}));
  capture(raw('UserPromptSubmit',{cwd:dir,prompt:'pergunta de laboratório',prompt_id:'prompt-lab'}));
  capture(raw('Stop',{cwd:dir,last_assistant_message:'resposta de laboratório'}));
  new SessionFileCollector(store,[scoped]).poll();
  const session=(store.snapshot().sessions as {sessionKey:string}[])[0];
  assert.ok(session);
  const page=store.conversations.page('project-a',session.sessionKey,null,20)!;
  assert.deepEqual(page.items.map(item=>item.content),['pergunta de laboratório','resposta de laboratório']);
  assert.equal(JSON.stringify(store.snapshot().feed).includes('pergunta de laboratório'),false);
  assert.equal(page.items[0].consentRef,'lab-consent-33');
  assert.ok(page.items[0].expiresAt);
});

test('exclusão de conteúdo exige credencial de comando, projeto e confirmação da sessão',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'wr3d-chat-delete-'));
  const store=new EventStore(path.join(dir,'state.sqlite'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'project-a',name:'Lab A',canonicalPath:'C:\\lab\\a'});
  const session=adaptSessionRecord(source,raw('SessionStart'),'r-start',at);
  store.applyBatch(session,{sourceId:'lab',fileKey:'test',generation:0,offset:1});
  store.conversations.record(adaptConversationRecord(source,raw('UserPromptSubmit',{prompt:'apagar sintético',prompt_id:'pd'}),'r-msg',at)!);
  const readToken='r'.repeat(40),commandToken='c'.repeat(40);
  const {server,url}=await startReadOnlyServer(store,readToken,0,{token:commandToken,actor:{actorId:'operador',projectIds:['project-a']}});
  t.after(()=>server.close());
  const target=`${url}/v1/conversations?projectId=project-a&sessionKey=${session[0].sessionKey}`;
  assert.equal((await fetch(target,{method:'DELETE',headers:{Authorization:`Bearer ${readToken}`,'X-WR3D-Delete-Confirm':session[0].sessionKey!}})).status,403);
  assert.equal((await fetch(target,{method:'DELETE',headers:{Authorization:`Bearer ${commandToken}`}})).status,403);
  const removed=await fetch(target,{method:'DELETE',headers:{Authorization:`Bearer ${commandToken}`,
    'X-WR3D-Delete-Confirm':session[0].sessionKey!,'Content-Length':'0'}});
  assert.equal(removed.status,200);
  assert.equal((await removed.json() as {removed:number}).removed,1);
  assert.equal(store.conversations.page('project-a',session[0].sessionKey!,null,20)?.items.length,0);
  assert.equal(store.conversations.record(adaptConversationRecord(source,
    raw('UserPromptSubmit',{prompt:'apagar sintético',prompt_id:'pd'}),'r-replay',at)!),false);
  assert.equal(store.conversations.page('project-a',session[0].sessionKey!,null,20)?.items.length,0);
});

test('revogar consentimento da fonte remove conteúdo armazenado',t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'wr3d-chat-revoke-'));
  const store=new EventStore(path.join(dir,'state.sqlite'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'project-a',name:'Lab A',canonicalPath:'C:\\lab\\a'});
  const session=adaptSessionRecord(source,raw('SessionStart'),'r-start',at);
  store.applyBatch(session,{sourceId:'lab',fileKey:'test',generation:0,offset:1});
  store.reconcileSessionSourceBindings([source]);
  store.conversations.record(adaptConversationRecord(source,raw('UserPromptSubmit',{prompt:'apagar ao revogar',prompt_id:'pr'}),'r-msg',at)!);
  assert.equal(store.conversations.page('project-a',session[0].sessionKey!,null,20)?.items.length,1);
  store.reconcileSessionSourceBindings([{...source,conversationContent:undefined}]);
  assert.equal(store.conversations.page('project-a',session[0].sessionKey!,null,20)?.items.length,0);
});

test('mudar prazo ou referência de consentimento remove conteúdo da política anterior',t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'wr3d-chat-policy-'));
  const store=new EventStore(path.join(dir,'state.sqlite'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'project-a',name:'Lab A',canonicalPath:'C:\\lab\\a'});
  const session=adaptSessionRecord(source,raw('SessionStart'),'r-start',at);
  store.applyBatch(session,{sourceId:'lab',fileKey:'test',generation:0,offset:1});
  store.reconcileSessionSourceBindings([source]);
  const record=(promptId:string)=>store.conversations.record(adaptConversationRecord(source,
    raw('UserPromptSubmit',{prompt:'conteúdo sintético',prompt_id:promptId}),promptId,at)!);
  record('prazo');
  assert.equal(store.conversations.page('project-a',session[0].sessionKey!,null,20)?.items.length,1);
  store.reconcileSessionSourceBindings([{...source,conversationContent:{consentRef:'lab-consent-33',retentionDays:2}}]);
  assert.equal(store.conversations.page('project-a',session[0].sessionKey!,null,20)?.items.length,0);
  record('consentimento');
  store.reconcileSessionSourceBindings([{...source,conversationContent:{consentRef:'nova-autorizacao',retentionDays:1}}]);
  assert.equal(store.conversations.page('project-a',session[0].sessionKey!,null,20)?.items.length,0);
});
