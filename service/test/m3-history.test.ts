import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EventStore } from '../src/store/event-store.ts';
import { GitHubClient, normalizeWorkflowRun } from '../src/github/github-client.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

function storeFor(t: { after: (fn: () => void) => void }): EventStore {
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-'));
  const store=new EventStore(path.join(dir,'db.sqlite'));
  store.registerProject({projectId:'p1',name:'Projeto',canonicalPath:'C:\\synthetic'});
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return store;
}

test('vínculo explícito, marcos deduplicados por identidade GitHub e histórico preservado após desvincular', t=>{
  const store=storeFor(t);
  const link=store.history.linkRepository({repositoryId:'repo-1',owner:'owner-a',name:'same',projectId:'p1'});
  assert.equal(link.repositoryId,'repo-1');
  const milestone={repositoryId:'repo-1',projectId:'p1',entityType:'workflow' as const,entityId:'wf:7:2:main:abc',transition:'failure',occurredAt:'2026-11-06T13:00:00.000Z',payload:{workflowId:7,runId:1,attempt:2,ref:'main',headSha:'abc'}};
  assert.equal(store.history.recordGithubMilestone(milestone),true);
  assert.equal(store.history.recordGithubMilestone(milestone),false);
  assert.equal(store.history.unlinkRepository('repo-1','p1'),true);
  assert.equal(store.history.recordGithubMilestone(milestone),false);
  assert.equal(store.history.daySummary('2026-11-06','America/Sao_Paulo').coverage && (store.history.daySummary('2026-11-06','America/Sao_Paulo').milestones as unknown[]).length,1);
});

test('Meu dia aplica fuso São Paulo e união de sessões sobrepostas sem contar duas vezes',t=>{
  const store=storeFor(t);
  const base={schemaVersion:'1.0',sourceId:'source1',sourceVersion:'test',receivedAt:'2026-11-06T15:00:01Z',projectId:'p1',provider:'codex',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const apply=(eventId:string,sessionKey:string,type:string,observedAt:string,offset:number)=>store.apply({...base,eventId,sourceEventId:eventId,sessionKey,type,observedAt},{sourceId:'source1',fileKey:'synthetic',generation:1,offset});
  apply('a','s1','session.observed','2026-11-06T15:00:00Z',1);
  apply('b','s2','session.observed','2026-11-06T16:00:00Z',2);
  apply('c','s1','session.ended','2026-11-06T17:00:00Z',3);
  apply('d','s2','session.ended','2026-11-06T18:00:00Z',4);
  const summary=store.history.daySummary('2026-11-06','America/Sao_Paulo') as {elapsedDurationMs:number;coverage:{status:string}};
  assert.equal(summary.elapsedDurationMs,3*60*60*1000);
  assert.equal(summary.coverage.status,'unknown');
});

test('workflow preserva identidade de workflow, ref, SHA e tentativa',()=>{
  const base={id:9,workflow_id:4,run_attempt:1,head_sha:'sha1',head_branch:'main',status:'completed',conclusion:'failure',updated_at:'2026-11-06T13:00:00.000Z',html_url:'https://github.com/o/r/actions/runs/9'};
  const first=normalizeWorkflowRun('repo','p',base)!;
  const other=normalizeWorkflowRun('repo','p',{...base,workflow_id:5})!;
  const rerun=normalizeWorkflowRun('repo','p',{...base,run_attempt:2,conclusion:'success'})!;
  assert.notEqual(first.entityId,other.entityId);
  assert.equal(first.entityId,rerun.entityId);
  assert.notEqual(first.transition,rerun.transition);
  assert.equal(normalizeWorkflowRun('repo','p',{...base,status:'in_progress',conclusion:null}),null);
});

test('falha CI mantém incidente; só rerun do mesmo workflow e ref resolve; replay inclui marcos e efeito',t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'repo-1',owner:'owner-a',name:'same',projectId:'p1'});
  const record=(entityId:string,transition:string,runId:number,workflowId:number)=>store.history.recordGithubMilestone({repositoryId:'repo-1',projectId:'p1',entityType:'workflow',entityId,transition,occurredAt:`2026-11-06T1${runId}:00:00Z`,payload:{workflowId,runId,attempt:Number(transition.match(/attempt-(\d+)/)?.[1]),ref:'main',headSha:'sha-a',url:'https://github.com/o/r/actions'}});
  const identity='7:99:main:sha-a';
  assert.equal(record(identity,'attempt-1-failure',99,7),true);
  assert.equal(record('8:100:main:sha-b','attempt-1-success',100,8),true);
  let incidents=(store.history.daySummary('2026-11-06','America/Sao_Paulo').incidentMarkers as {resolvedAt:string|null}[]);
  assert.equal(incidents.length,1); assert.equal(incidents[0]!.resolvedAt,null);
  assert.equal(record(identity,'attempt-2-success',99,7),true);
  incidents=store.history.daySummary('2026-11-06','America/Sao_Paulo').incidentMarkers as {resolvedAt:string|null}[];
  assert.ok(incidents[0]!.resolvedAt);
  const replay=store.history.replay(0,20);
  assert.equal(replay.events.filter(e=>(e as {kind?:string}).kind==='github.milestone').length,3);
  assert.equal(replay.events.filter(e=>(e as {kind?:string}).kind==='effect').length,1);
});

test('cliente GitHub pagina, aceita 304, recusa token e não encaminha paginação para outra origem',async()=>{
  const requests: RequestInit[]=[];
  const fake=async (input:string|URL,init?:RequestInit)=>{
    requests.push(init??{});
    const url=String(input);
    if(url.endsWith('/start')) return new Response(JSON.stringify([{n:1}]),{status:200,headers:{link:'<https://api.github.test/next>; rel="next"'}});
    if(url.endsWith('/next')) return new Response(JSON.stringify([{n:2}]),{status:200});
    if(url.endsWith('/etag')) return new Response(null,{status:304});
    return new Response('[]',{status:200});
  };
  const client=new GitHubClient('x'.repeat(30),fake,'https://api.github.test');
  assert.deepEqual(await client.getAllPages('/start'),[{n:1},{n:2}]);
  assert.equal((await client.get('/etag','W/"tag"')).status,304);
  assert.match(String((requests[0]!.headers as Record<string,string>).Authorization),/^Bearer /);
  const malicious=new GitHubClient('x'.repeat(30),async()=>new Response('[]',{status:200,headers:{link:'<https://evil.test/steal>; rel="next"'}}),'https://api.github.test');
  await assert.rejects(()=>malicious.getAllPages('/start'),/fora da origem/);
});

test('rotas de dia e replay autenticadas; comandos replay continuam rejeitados no backend',async t=>{
  const store=storeFor(t); const token=randomBytes(32).toString('hex');
  const {server,url}=await startReadOnlyServer(store,token); t.after(()=>server.close());
  const headers={Authorization:`Bearer ${token}`};
  const day=await fetch(`${url}/v1/history/day?date=2026-11-06&timeZone=America%2FSao_Paulo`,{headers});
  assert.equal(day.status,200); assert.equal((await day.json() as {timeZone:string}).timeZone,'America/Sao_Paulo');
  const replay=await fetch(`${url}/v1/history/replay?cursor=0&limit=10`,{headers});
  assert.equal((await replay.json() as {viewMode:string}).viewMode,'replay');
  assert.equal((await fetch(`${url}/v1/commands`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,405);
});
