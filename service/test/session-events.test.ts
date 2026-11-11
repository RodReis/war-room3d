import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { EventStore } from '../src/store/event-store.ts';
import { adaptSessionRecord, type SessionSource } from '../src/sessions/adapters.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

test('eventos de sessão paginam por projeto e agente sem expor payload ou cruzar escopos',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'wr3d-34-events-'));
  const store=new EventStore(path.join(dir,'state.sqlite'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'project-a',name:'Projeto A',canonicalPath:'C:\\lab\\a'});
  store.registerProject({projectId:'project-b',name:'Projeto B',canonicalPath:'C:\\lab\\b'});
  const source:SessionSource={sourceId:'source-a',sourceVersion:'1',provider:'claude',projectId:'project-a',accountRef:'lab',filePath:'C:\\lab\\a.jsonl'};
  const at=new Date().toISOString();
  const input=(hook_event_name:string,session_id:string,extra:Record<string,unknown>={})=>({hook_event_name,session_id,...extra});
  let offset=0;
  const apply=(scoped:SessionSource,raw:unknown)=>{
    const events=adaptSessionRecord(scoped,raw,`r-${++offset}`,at);
    store.applyBatch(events,{sourceId:scoped.sourceId,fileKey:'fixture',generation:0,offset});
    return events;
  };
  const started=apply(source,input('SessionStart','session-a'));
  const prompted=apply(source,input('UserPromptSubmit','session-a',{prompt:'conteúdo que não pode aparecer',prompt_id:'prompt-1'}));
  const tool=apply(source,input('PostToolUse','session-a',{tool_name:'Read',tool_use_id:'tool-1'}));
  apply({...source,sourceId:'source-b',projectId:'project-b'},input('SessionStart','session-b'));
  const first=store.pageSessionEvents({projectId:'project-a',limit:2})!;
  const second=store.pageSessionEvents({projectId:'project-a',limit:2,before:first.nextBefore!})!;
  assert.equal(first.items.length,2);
  assert.ok(first.nextBefore);
  assert.equal(first.coverage,'covered');
  const from=at.slice(0,19)+'Z',to=new Date(Date.parse(at)+1000).toISOString().slice(0,19)+'Z';
  assert.equal(store.pageSessionEvents({projectId:'project-a',from,to})?.items.length,6);
  assert.equal(new Set([...first.items,...second.items].map(item=>item.eventId)).size,4);
  assert.equal(JSON.stringify([...first.items,...second.items]).includes('conteúdo que não pode aparecer'),false);
  assert.deepEqual(store.pageSessionEvents({projectId:'project-a',agentKey:tool[0]!.agentKey!})?.items.map(item=>item.eventId),
    [tool[0]!.eventId,prompted[1]!.eventId,started[1]!.eventId]);
  assert.equal(store.getSessionEvent('project-b',tool[0]!.eventId),null);
  const readToken=randomBytes(32).toString('hex'),commandToken=randomBytes(32).toString('hex');
  const server=await startReadOnlyServer(store,readToken,0,{token:commandToken,actor:{actorId:'lab',projectIds:['project-a']}});
  t.after(()=>new Promise<void>(resolve=>server.server.close(()=>resolve())));
  const route=`${server.url}/v1/session-events?projectId=project-a&sessionKey=${started[0]!.sessionKey}&limit=2`;
  assert.equal((await fetch(route,{headers:{Authorization:`Bearer ${commandToken}`}})).status,403);
  assert.equal((await fetch(route,{headers:{Authorization:`Bearer ${readToken}`,Origin:'http://evil.invalid'}})).status,403);
  const page=await fetch(route,{headers:{Authorization:`Bearer ${readToken}`}});
  assert.equal(page.status,200);
  assert.equal((await page.json() as {items:unknown[]}).items.length,2);
  const detail=await fetch(`${server.url}/v1/session-events/${tool[0]!.eventId}?projectId=project-a`,
    {headers:{Authorization:`Bearer ${readToken}`}});
  assert.equal(detail.status,200);
  const detailBody=await detail.json() as {sourceId:string;evidenceRefs:string[]};
  assert.equal(detailBody.sourceId,'source-a');
  assert.deepEqual(detailBody.evidenceRefs,tool[0]!.evidenceRefs);
  assert.equal((await fetch(`${server.url}/v1/session-events/${tool[0]!.eventId}?projectId=project-b`,
    {headers:{Authorization:`Bearer ${readToken}`}})).status,404);
});
