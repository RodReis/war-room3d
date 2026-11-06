import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EventStore } from '../src/store/event-store.ts';
import { GitHubClient, normalizeWorkflowRun } from '../src/github/github-client.ts';
import { configureGithub } from '../src/github/github-config.ts';
import { pollLinkedRepositories } from '../src/github/github-poller.ts';
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

test('configuração GitHub cadastra projeto sem sonda M2 e preserva vínculo no reinício',t=>{
  const store=storeFor(t);
  const config={schemaVersion:'1.0',projects:[{projectId:'contaia',name:'ContaIA',canonicalPath:'C:\\Desenv\\Projetos\\rrb-contaia'}],repositories:[{repositoryId:'1371493574',owner:'RodReis',name:'rrb-contaia',projectId:'contaia'}]};
  assert.deepEqual(configureGithub(store,config),{projects:1,repositories:1});
  const first=store.history.repositories()[0]!;
  assert.equal(first.repositoryId,'1371493574');
  assert.equal(store.resolveProject('c:\\desenv\\projetos\\rrb-contaia'),'contaia');
  configureGithub(store,config);
  assert.equal(store.history.repositories()[0]!.linkedAt,first.linkedAt);
  assert.throws(()=>configureGithub(store,{...config,repositories:[{...config.repositories[0],name:'wrong'}]}),/outro owner\/repo/);
});

test('mesmo repositório vinculado a dois projetos preserva dois marcos e duas celebrações',t=>{
  const store=storeFor(t);
  store.registerProject({projectId:'p2',name:'Segundo',canonicalPath:'C:\\Projects\\second'});
  for(const projectId of ['p1','p2']) store.history.linkRepository({repositoryId:'1371493574',owner:'RodReis',name:'rrb-contaia',projectId});
  const merged={repositoryId:'1371493574',entityType:'pull_request' as const,entityId:'5084137796',transition:'merged',occurredAt:'2026-11-06T15:00:00Z',payload:{number:168}};
  assert.equal(store.history.recordGithubMilestone({...merged,projectId:'p1'}),true);
  assert.equal(store.history.recordGithubMilestone({...merged,projectId:'p2'}),true);
  const summary=store.history.daySummary('2026-11-06','America/Sao_Paulo') as {milestones:{projectId:string}[]};
  assert.deepEqual(summary.milestones.map(x=>x.projectId).sort(),['p1','p2']);
  const firstPage=store.history.replay(0,1);
  assert.equal((firstPage.events[0] as {effects:unknown[]}).effects.length,1);
  assert.ok(firstPage.nextCursor);
  assert.equal((store.history.replay(firstPage.nextCursor!,1).events[0] as {effects:unknown[]}).effects.length,1);
});

test('polling simulado valida ID real, reconhece merge fora da sessão e não resolve CI de outro workflow',async t=>{
  const store=storeFor(t);
  configureGithub(store,{schemaVersion:'1.0',projects:[{projectId:'contaia',name:'ContaIA',canonicalPath:'C:\\Desenv\\Projetos\\rrb-contaia'}],repositories:[{repositoryId:'1371493574',owner:'RodReis',name:'rrb-contaia',projectId:'contaia'}]});
  let requests=0;
  const client=new GitHubClient('x'.repeat(30),async input=>{
    requests++;
    const url=String(input);
    if(url.endsWith('/repos/RodReis/rrb-contaia')) return new Response(JSON.stringify({id:1371493574}),{status:200});
    if(url.includes('/pulls?')) return new Response(JSON.stringify([{id:11,number:5,state:'closed',merged_at:'2026-11-06T15:00:00Z',updated_at:'2026-11-06T15:00:00Z',html_url:'https://github.com/RodReis/rrb-contaia/pull/5'}]),{status:200});
    return new Response(JSON.stringify({total_count:2,workflow_runs:[
      {id:100,workflow_id:7,run_attempt:1,head_sha:'sha-a',head_branch:'main',status:'completed',conclusion:'failure',updated_at:'2026-11-06T15:05:00Z',html_url:'https://github.com/RodReis/rrb-contaia/actions/runs/100'},
      {id:101,workflow_id:8,run_attempt:1,head_sha:'sha-b',head_branch:'main',status:'completed',conclusion:'success',updated_at:'2026-11-06T15:06:00Z',html_url:'https://github.com/RodReis/rrb-contaia/actions/runs/101'}
    ]}),{status:200});
  });
  const result=await pollLinkedRepositories(store,client);
  assert.equal(result.milestones,3);
  assert.equal(result.errors.length,0);
  assert.ok(requests>=3);
  const incidents=store.history.daySummary('2026-11-06','America/Sao_Paulo').incidentMarkers as {resolvedAt:string|null}[];
  assert.equal(incidents.length,1);
  assert.equal(incidents[0]!.resolvedAt,null);
  assert.equal((await pollLinkedRepositories(store,client)).milestones,0);
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
  assert.equal(normalizeWorkflowRun('repo','p',{...base,head_branch:null}),null);
});

test('falha CI mantém incidente; só rerun do mesmo workflow e ref resolve; replay inclui marcos e efeito',t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'repo-1',owner:'owner-a',name:'same',projectId:'p1'});
  const record=(entityId:string,transition:string,runId:number,workflowId:number,minute:number,ref='main')=>store.history.recordGithubMilestone({repositoryId:'repo-1',projectId:'p1',entityType:'workflow',entityId,transition,occurredAt:`2026-11-06T15:${String(minute).padStart(2,'0')}:00Z`,payload:{workflowId,runId,attempt:Number(transition.match(/attempt-(\d+)/)?.[1]),ref,headSha:'sha-a',url:'https://github.com/o/r/actions'}});
  const identity='7:99:main:sha-a';
  assert.equal(record(identity,'attempt-1-failure',99,7,0),true);
  assert.equal(record('8:100:main:sha-b','attempt-1-success',100,8,1),true);
  assert.equal(record('7:101:feature:sha-c','attempt-1-success',101,7,2,'feature'),true);
  let incidents=(store.history.daySummary('2026-11-06','America/Sao_Paulo').incidentMarkers as {resolvedAt:string|null}[]);
  assert.equal(incidents.length,1); assert.equal(incidents[0]!.resolvedAt,null);
  assert.equal(record('7:102:main:sha-d','attempt-1-success',102,7,3),true);
  incidents=store.history.daySummary('2026-11-06','America/Sao_Paulo').incidentMarkers as {resolvedAt:string|null}[];
  assert.ok(incidents[0]!.resolvedAt);
  assert.equal(record('7:98:main:sha-old','attempt-1-failure',98,7,0),true);
  incidents=store.history.daySummary('2026-11-06','America/Sao_Paulo').incidentMarkers as {resolvedAt:string|null}[];
  assert.equal(incidents.length,1);
  const replay=store.history.replay(0,20);
  assert.equal(replay.events.filter(e=>(e as {kind?:string}).kind==='github.milestone').length,5);
  assert.equal(replay.events.map(e=>(e as {effects?:unknown[]}).effects?.length??0).reduce((sum,count)=>sum+count,0),2);
});

test('primeira coleta é backfill; novas transições são live sem repetir efeito',async t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  let phase=0;
  const client=new GitHubClient('',async input=>{
    const url=String(input);
    if(url.endsWith('/repos/owner-a/same')) return new Response(JSON.stringify({id:42}),{status:200});
    if(url.includes('/pulls?')) return new Response(JSON.stringify([
      {id:1,number:1,state:'closed',merged_at:'2026-11-05T12:00:00Z',updated_at:'2026-11-05T12:00:00Z',html_url:'https://github.com/owner-a/same/pull/1'},
      ...(phase ? [{id:2,number:2,state:'closed',merged_at:'2026-11-06T15:00:00Z',updated_at:'2026-11-06T15:00:00Z',html_url:'https://github.com/owner-a/same/pull/2'}] : [])
    ]),{status:200});
    return new Response(JSON.stringify({workflow_runs:[]}),{status:200});
  });
  assert.equal((await pollLinkedRepositories(store,client)).milestones,1);
  assert.equal(store.history.hasSuccessfulPoll('42'),true);
  phase=1;
  assert.equal((await pollLinkedRepositories(store,client)).milestones,1);
  const replay=store.history.replay(0,10);
  const milestones=replay.events as {ingestionMode:string;effects:{ingestionMode:string}[]}[];
  assert.deepEqual(milestones.map(x=>x.ingestionMode),['backfill','live']);
  assert.deepEqual(milestones.map(x=>x.effects[0]?.ingestionMode),['backfill','live']);
  assert.equal((await pollLinkedRepositories(store,client)).milestones,0);
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
  let anonymousHeaders: HeadersInit | undefined;
  const anonymous=new GitHubClient('',async (_input,init)=>{anonymousHeaders=init?.headers;return new Response('[]',{status:200});},'https://api.github.test');
  await anonymous.getAllPages('/public');
  assert.equal((anonymousHeaders as Record<string,string>).Authorization,undefined);
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
