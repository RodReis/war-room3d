import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { EventStore } from '../src/store/event-store.ts';
import { GitHubClient, GitHubRateLimitError, normalizeWorkflowRun } from '../src/github/github-client.ts';
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

test('Meu dia separa fim de agente do fim da sessão',t=>{
  const store=storeFor(t);
  const base={schemaVersion:'1.0',sourceId:'source1',sourceVersion:'test',receivedAt:'2026-11-06T15:00:00Z',
    projectId:'p1',provider:'codex',sessionKey:'s1',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const apply=(id:string,type:string,at:string,offset:number,agentKey?:string)=>store.apply(
    {...base,eventId:id,sourceEventId:id,type,observedAt:at,...(agentKey?{agentKey}:{})},
    {sourceId:'source1',fileKey:'synthetic',generation:1,offset});
  apply('session-start','session.observed','2026-11-06T10:00:00Z',1);
  apply('agent-start','agent.observed','2026-11-06T10:00:00Z',2,'a1');
  apply('agent-end','agent.ended','2026-11-06T11:00:00Z',3,'a1');
  apply('session-end','session.ended','2026-11-06T12:00:00Z',4);
  const day=store.history.daySummary('2026-11-06','UTC','2026-11-07T00:00:00Z') as {elapsedDurationMs:number;agentHours:number};
  assert.equal(day.elapsedDurationMs,2*3600000);
  assert.equal(day.agentHours,1);
});

test('Meu dia encerra horas de agente com a sessão e deixa ausência de coleta desconhecida',t=>{
  const store=storeFor(t);
  const empty=store.history.daySummary('2026-11-06','UTC','2026-11-07T00:00:00Z') as
    {elapsedDurationMs:number|null;elapsedDurationKnown:boolean;agentHours:number|null;agentHoursKnown:boolean};
  assert.deepEqual([empty.elapsedDurationMs,empty.elapsedDurationKnown,empty.agentHours,empty.agentHoursKnown],[null,false,null,false]);
  const base={schemaVersion:'1.0',sourceId:'source1',sourceVersion:'test',receivedAt:'2026-11-06T15:00:00Z',
    projectId:'p1',provider:'codex',sessionKey:'s1',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const apply=(id:string,type:string,at:string,offset:number,agentKey?:string)=>store.apply(
    {...base,eventId:id,sourceEventId:id,type,observedAt:at,...(agentKey?{agentKey}:{})},
    {sourceId:'source1',fileKey:'synthetic',generation:1,offset});
  apply('session-start','session.observed','2026-11-06T10:00:00Z',1);
  apply('agent-start','agent.observed','2026-11-06T10:00:00Z',2,'a1');
  apply('session-end','session.ended','2026-11-06T12:00:00Z',3);
  const day=store.history.daySummary('2026-11-06','UTC','2026-11-07T00:00:00Z') as
    {elapsedDurationMs:number;agentHours:number;agentHoursKnown:boolean};
  assert.equal(day.elapsedDurationMs,2*3600000);
  assert.equal(day.agentHours,2);
  assert.equal(day.agentHoursKnown,true);
  const next=store.history.daySummary('2026-11-07','UTC','2026-11-08T00:00:00Z') as
    {elapsedDurationMs:number|null;elapsedDurationKnown:boolean;agentHours:number|null;agentHoursKnown:boolean};
  assert.deepEqual([next.elapsedDurationMs,next.elapsedDurationKnown,next.agentHours,next.agentHoursKnown],[null,false,null,false]);
});

test('Meu dia soma espera pela união de sessões e não completa intervalo aberto',t=>{
  const store=storeFor(t);
  const empty=store.history.daySummary('2026-11-06','America/Sao_Paulo') as {waitingDurationMs:number|null;waitingDurationKnown:boolean};
  assert.equal(empty.waitingDurationMs,null);
  assert.equal(empty.waitingDurationKnown,false);
  const base={schemaVersion:'1.0',sourceId:'source1',sourceVersion:'test',receivedAt:'2026-11-06T18:00:01Z',projectId:'p1',provider:'codex',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const apply=(id:string,sessionKey:string,type:string,observedAt:string,offset:number)=>store.apply({...base,eventId:id,sourceEventId:id,sessionKey,type,observedAt},{sourceId:'source1',fileKey:'synthetic',generation:1,offset});
  apply('s1-start','s1','session.observed','2026-11-06T14:00:00Z',1);
  apply('s1-wait','s1','session.waiting','2026-11-06T15:00:00Z',2);
  let summary=store.history.daySummary('2026-11-06','America/Sao_Paulo') as {waitingDurationMs:number|null;waitingDurationKnown:boolean};
  assert.equal(summary.waitingDurationMs,null);
  assert.equal(summary.waitingDurationKnown,false);
  apply('s2-start','s2','session.observed','2026-11-06T15:30:00Z',3);
  apply('s2-wait','s2','session.waiting','2026-11-06T16:00:00Z',4);
  apply('s1-work','s1','session.working','2026-11-06T17:00:00Z',5);
  apply('s2-end','s2','session.ended','2026-11-06T18:00:00Z',6);
  apply('s1-end','s1','session.ended','2026-11-06T18:00:00Z',7);
  summary=store.history.daySummary('2026-11-06','America/Sao_Paulo') as {waitingDurationMs:number|null;waitingDurationKnown:boolean};
  assert.equal(summary.waitingDurationMs,3*3600000);
  assert.equal(summary.waitingDurationKnown,true);
});

test('Meu dia não projeta sessão aberta até meia-noite e encerra intervalo na perda da fonte',t=>{
  const store=storeFor(t);
  const base={schemaVersion:'1.0',sourceId:'source1',sourceVersion:'test',receivedAt:'2026-11-06T16:00:01Z',projectId:'p1',provider:'codex',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const apply=(eventId:string,type:string,observedAt:string,offset:number,sessionKey?:string)=>store.apply({...base,eventId,sourceEventId:eventId,sessionKey,type,observedAt},{sourceId:'source1',fileKey:'synthetic',generation:1,offset});
  apply('open','session.observed','2026-11-06T15:00:00Z',1,'s1');
  assert.equal(store.history.daySummary('2026-11-06','America/Sao_Paulo').elapsedDurationMs,null);
  apply('lost','source.unavailable','2026-11-06T16:00:00Z',2);
  assert.equal(store.history.daySummary('2026-11-06','America/Sao_Paulo').elapsedDurationMs,3600000);
  apply('recovered','source.recovered','2026-11-06T17:00:00Z',3);
  const coverage=store.history.daySummary('2026-11-06','America/Sao_Paulo','2026-11-06T18:00:00Z').coverage as {status:string;gaps:{sourceId:string;start:string;end:string}[]};
  assert.equal(coverage.status,'unknown');
  assert.deepEqual(coverage.gaps,[{sourceId:'source1',start:'2026-11-06T16:00:00.000Z',end:'2026-11-06T17:00:00.000Z',reason:'source_unavailable'}]);
});

test('lacuna de fonte iniciada antes da meia-noite é recortada no dia local',t=>{
  const store=storeFor(t);
  const base={schemaVersion:'1.0',sourceId:'source1',sourceVersion:'test',receivedAt:'2026-11-06T03:11:00Z',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const apply=(eventId:string,type:string,observedAt:string,offset:number)=>store.apply({...base,eventId,sourceEventId:eventId,type,observedAt},{sourceId:'source1',fileKey:'synthetic',generation:1,offset});
  apply('lost','source.unavailable','2026-11-06T02:59:00Z',1);
  const stillLost=store.history.daySummary('2026-11-06','America/Sao_Paulo','2026-11-06T03:05:00Z').coverage as {status:string;gaps:{start:string;end:string}[]};
  assert.equal(stillLost.status,'none');
  assert.deepEqual(stillLost.gaps,[{sourceId:'source1',start:'2026-11-06T03:00:00.000Z',end:'2026-11-06T03:05:00.000Z',reason:'source_unavailable'}]);
  apply('recovered','source.recovered','2026-11-06T03:10:00Z',2);
  const coverage=store.history.daySummary('2026-11-06','America/Sao_Paulo','2026-11-06T03:11:00Z').coverage as {gaps:{start:string;end:string}[]};
  assert.deepEqual(coverage.gaps,[{sourceId:'source1',start:'2026-11-06T03:00:00.000Z',end:'2026-11-06T03:10:00.000Z',reason:'source_unavailable'}]);
});

test('Meu dia declara janela GitHub sem coleta no fuso local e recuperação sem afirmar cobertura contínua',t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'},'2026-11-05T00:00:00Z');
  store.history.markPollSuccess('42','2026-11-06T02:59:00Z',[],60000,'2026-11-06T02:59:00Z');
  const missing=store.history.daySummary('2026-11-06','America/Sao_Paulo','2026-11-06T03:03:00Z').githubCoverage as {status:string;gaps:unknown[]};
  assert.equal(missing.status,'none');
  assert.deepEqual(missing.gaps,[]);
  store.history.markPollFailure('42','2026-11-06T03:03:00Z','rate_limited',60000,'2026-11-06T03:03:01Z');
  store.history.markPollSuccess('42','2026-11-06T03:05:00Z',[],60000,'2026-11-06T03:05:00Z');
  const recovered=store.history.daySummary('2026-11-06','America/Sao_Paulo','2026-11-06T03:05:30Z').githubCoverage as {status:string;successfulAttempts:number;failedAttempts:number;gaps:{start:string;end:string;reason:string}[]};
  assert.equal(recovered.status,'partial');
  assert.deepEqual([recovered.successfulAttempts,recovered.failedAttempts],[1,1]);
  assert.deepEqual(recovered.gaps,[{repositoryId:'42',start:'2026-11-06T03:00:00.000Z',end:'2026-11-06T03:05:00.000Z',reason:'rate_limited'}]);
});

test('Meu dia filtra sessões, lacunas, GitHub e marcos por projeto explícito',async t=>{
  const store=storeFor(t);
  store.registerProject({projectId:'p2',name:'Outro projeto',canonicalPath:'C:\\synthetic2'});
  const base={schemaVersion:'1.0',sourceVersion:'test',receivedAt:'2026-11-06T19:00:00Z',provider:'codex',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const apply=(id:string,sourceId:string,projectId:string|undefined,sessionKey:string|undefined,type:string,at:string,offset:number)=>
    store.apply({...base,eventId:id,sourceEventId:id,sourceId,projectId,sessionKey,type,observedAt:at},
      {sourceId,fileKey:'synthetic',generation:1,offset});
  apply('p1-open','source1','p1','s1','session.observed','2026-11-06T15:00:00Z',1);
  apply('p2-open','source2','p2','s2','session.observed','2026-11-06T15:00:00Z',1);
  apply('p1-loss','source1',undefined,undefined,'source.unavailable','2026-11-06T16:00:00Z',2);
  apply('p1-end','source1','p1','s1','session.ended','2026-11-06T17:00:00Z',3);
  apply('p2-end','source2','p2','s2','session.ended','2026-11-06T18:00:00Z',2);
  for(const [repositoryId,projectId] of [['1','p1'],['2','p2']]){
    store.history.linkRepository({repositoryId,owner:'owner-a',name:`repo-${repositoryId}`,projectId},'2026-11-05T00:00:00Z');
    store.history.markPollSuccess(repositoryId,'2026-11-06T15:00:00Z',[],60000,'2026-11-06T15:00:01Z');
    store.history.recordGithubMilestone({repositoryId,projectId,entityType:'pull_request',entityId:`pr-${repositoryId}`,
      transition:'merged',occurredAt:'2026-11-06T16:00:00Z',payload:{number:Number(repositoryId)}});
  }
  const p1=store.history.daySummary('2026-11-06','America/Sao_Paulo','2026-11-07T02:00:00Z','p1') as
    {projectId:string;elapsedDurationMs:number;coverage:{gaps:{sourceId:string}[]};githubCoverage:{attempts:number};milestones:{projectId:string}[]};
  const p2=store.history.daySummary('2026-11-06','America/Sao_Paulo','2026-11-07T02:00:00Z','p2') as typeof p1;
  assert.deepEqual([p1.projectId,p1.elapsedDurationMs,p1.coverage.gaps.map(x=>x.sourceId),p1.githubCoverage.attempts,p1.milestones.map(x=>x.projectId)],
    ['p1',3600000,['source1'],1,['p1']]);
  assert.deepEqual([p2.projectId,p2.elapsedDurationMs,p2.coverage.gaps,p2.githubCoverage.attempts,p2.milestones.map(x=>x.projectId)],
    ['p2',10800000,[],1,['p2']]);
  const token=randomBytes(32).toString('hex');
  const {server,url}=await startReadOnlyServer(store,token);t.after(()=>server.close());
  const headers={Authorization:`Bearer ${token}`};
  const query='date=2026-11-06&timeZone=America%2FSao_Paulo&projectId=';
  const response=await fetch(`${url}/v1/history/day?${query}p1`,{headers});
  assert.equal(response.status,200);
  assert.equal((await response.json() as {projectId:string}).projectId,'p1');
  assert.equal((await fetch(`${url}/v1/history/day?${query}unknown`,{headers})).status,400);
});

test('desvincular e religar preserva períodos GitHub sem lacuna durante pausa',t=>{
  const store=storeFor(t);
  const link={repositoryId:'42',owner:'owner-a',name:'repo',projectId:'p1'};
  store.history.linkRepository(link,'2026-11-05T00:00:00Z');
  store.history.markPollSuccess('42','2026-11-05T12:00:00Z',[],60000,'2026-11-05T12:00:01Z');
  assert.throws(()=>store.history.unlinkRepository('42','p1','2026-11-04T23:00:00Z'),/Desvínculo não pode anteceder vínculo/);
  assert.equal(store.history.unlinkRepository('42','p1','2026-11-05T13:00:00Z'),true);
  assert.throws(()=>store.history.linkRepository(link,'2026-11-05T12:00:00Z'),/Vínculo não pode anteceder desvínculo/);
  store.history.linkRepository(link,'2026-11-06T00:00:00Z');
  store.history.markPollSuccess('42','2026-11-06T12:00:00Z',[],60000,'2026-11-06T12:00:01Z');
  const first=store.history.daySummary('2026-11-05','UTC','2026-11-07T00:00:00Z','p1').githubCoverage as {attempts:number;gaps:unknown[]};
  const second=store.history.daySummary('2026-11-06','UTC','2026-11-07T00:00:00Z','p1').githubCoverage as {attempts:number;gaps:unknown[]};
  assert.deepEqual([first.attempts,second.attempts],[1,1]);
  assert.deepEqual(first.gaps,[]);
  assert.deepEqual(second.gaps,[]);
});

test('migração v7 preserva vínculo existente na cobertura filtrada',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-link-v7-'));
  const databasePath=path.join(dir,'db.sqlite');
  let migrated:EventStore|null=null;
  t.after(()=>{migrated?.close();rmSync(dir,{recursive:true,force:true});});
  const original=new EventStore(databasePath);
  original.registerProject({projectId:'p1',name:'Projeto',canonicalPath:'C:\\synthetic'});
  original.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'repo',projectId:'p1'},'2026-11-05T00:00:00Z');
  original.history.markPollSuccess('42','2026-11-06T12:00:00Z',[],60000,'2026-11-06T12:00:01Z');
  original.close();
  const legacy=new Database(databasePath);
  legacy.exec("DROP TABLE github_entity_cursors; DROP TABLE history_github_observations; DROP TABLE project_repository_link_periods; UPDATE meta SET value=7 WHERE key='schema_version'");
  legacy.close();
  migrated=new EventStore(databasePath);
  const coverage=migrated.history.daySummary('2026-11-06','UTC','2026-11-07T00:00:00Z','p1').githubCoverage as {attempts:number};
  assert.equal(coverage.attempts,1);
});

test('replay reconstrói estado da sala no instante, inclui evento tardio e não altera live',t=>{
  const store=storeFor(t);
  const base={schemaVersion:'1.0',sourceId:'source1',sourceVersion:'test',receivedAt:'2026-11-06T16:00:01Z',projectId:'p1',provider:'codex',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]};
  const apply=(id:string,type:string,at:string,offset:number,extra:Record<string,unknown>={})=>store.apply({...base,eventId:id,sourceEventId:id,type,observedAt:at,...extra},{sourceId:'source1',fileKey:'synthetic',generation:1,offset});
  apply('start','session.observed','2026-11-06T13:00:00Z',1,{sessionKey:'s1'});
  apply('end','session.ended','2026-11-06T15:00:00Z',2,{sessionKey:'s1'});
  apply('late','agent.working','2026-11-06T14:00:00Z',3,{sessionKey:'s1',agentKey:'a1'});
  apply('fraction','agent.waiting','2026-11-06T14:30:00.900Z',4,{sessionKey:'s1',agentKey:'a1'});
  apply('lost','source.unavailable','2026-11-06T14:45:00Z',5);
  apply('recovered','source.recovered','2026-11-06T14:50:00Z',6);
  const before=store.historicalSnapshot('2026-11-06T13:30:00Z') as {mode:string;sessions:{presence:string}[];agents:unknown[]};
  assert.equal(before.mode,'replay');
  assert.equal(before.sessions[0]?.presence,'observada');
  assert.equal(before.agents.length,0);
  const during=store.historicalSnapshot('2026-11-06T14:30:00Z') as {sessions:{presence:string}[];agents:{presence:string}[]};
  assert.equal(during.sessions[0]?.presence,'observada');
  assert.equal(during.agents[0]?.presence,'trabalhando');
  const beforeFraction=store.historicalSnapshot('2026-11-06T14:30:00Z') as {agents:{presence:string}[]};
  assert.equal(beforeFraction.agents[0]?.presence,'trabalhando');
  assert.equal((store.historicalSnapshot('2026-11-06T14:30:01Z') as {agents:{presence:string}[]}).agents[0]?.presence,'aguardando');
  const duringLoss=store.historicalSnapshot('2026-11-06T14:47:00Z') as {coverage:{status:string;gaps:{sourceId:string}[]};sessions:{presence:string}[]};
  assert.equal(duringLoss.coverage.status,'gap');
  assert.equal(duringLoss.coverage.gaps[0]?.sourceId,'source1');
  assert.equal(duringLoss.sessions[0]?.presence,'desconhecida');
  assert.equal((store.historicalSnapshot('2026-11-06T14:55:00Z') as {coverage:{status:string}}).coverage.status,'unknown');
  const after=store.historicalSnapshot('2026-11-06T15:30:00Z') as {sessions:{presence:string}[];agents:{presence:string}[]};
  assert.equal(after.sessions[0]?.presence,'encerrada');
  assert.equal(after.agents[0]?.presence,'encerrada');
  assert.equal((store.snapshot() as {mode:string;sessions:{presence:string}[]}).sessions[0]?.presence,'encerrada');
});

test('replay omite projeto futuro e inclui projeto evidenciado por evento ou GitHub anterior',t=>{
  const store=storeFor(t);
  store.registerProject({projectId:'p2',name:'Segundo',canonicalPath:'C:\\synthetic-two'});
  const before=new Date(Date.now()-86400000).toISOString();
  const eventAt=new Date(Date.now()-72000000).toISOString();
  const at=new Date(Date.now()-36000000).toISOString();
  const empty=store.historicalSnapshot(before) as {projects:{projectId:string}[];roomPlacements:unknown[];layoutReference:string};
  assert.deepEqual(empty.projects,[]);
  assert.deepEqual(empty.roomPlacements,[]);
  assert.equal(empty.layoutReference,'unavailable');
  store.apply({schemaVersion:'1.0',eventId:'backfill-p1',sourceEventId:'backfill-p1',sourceId:'source1',sourceVersion:'test',
    type:'session.observed',observedAt:eventAt,receivedAt:new Date().toISOString(),projectId:'p1',provider:'codex',
    sessionKey:'s1',provenance:'observed',ingestionMode:'backfill',payload:{},evidenceRefs:[]},
    {sourceId:'source1',fileKey:'synthetic',generation:1,offset:1});
  const replay=store.historicalSnapshot(at) as {projects:{projectId:string}[];roomPlacements:{projectId:string}[];layoutReference:string};
  assert.deepEqual(replay.projects.map(project=>project.projectId),['p1']);
  assert.deepEqual(replay.roomPlacements,[]);
  assert.equal(replay.layoutReference,'unavailable');
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p2'});
  store.history.recordGithubMilestone({repositoryId:'42',projectId:'p2',entityType:'pull_request',entityId:'1',transition:'merged',
    occurredAt:eventAt,payload:{number:1}});
  const withGithub=store.historicalSnapshot(at) as {projects:{projectId:string}[]};
  assert.deepEqual(withGithub.projects.map(project=>project.projectId),['p1','p2']);
  const after=store.historicalSnapshot(new Date(Date.now()+3600000).toISOString()) as {projects:{projectId:string}[];roomPlacements:{projectId:string}[];layoutReference:string};
  assert.deepEqual(after.projects.map(project=>project.projectId),['p1','p2']);
  assert.deepEqual(after.roomPlacements.map(placement=>placement.projectId),['p1','p2']);
  assert.equal(after.layoutReference,'recorded');
});

test('migração v12 não projeta posição legada antes de conhecê-la',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-layout-'));
  const dbPath=path.join(dir,'db.sqlite');
  let store=new EventStore(dbPath);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'legacy',name:'Legado',canonicalPath:'C:\\legacy-layout'});
  store.close();
  const db=new Database(dbPath);
  db.exec("DROP TABLE github_entity_cursors; DROP TABLE history_github_observations; DROP TABLE room_placement_versions; UPDATE meta SET value=11 WHERE key='schema_version'");
  db.close();
  store=new EventStore(dbPath);
  const check=new Database(dbPath);
  const row=check.prepare('SELECT known_at FROM room_placement_versions').get() as {known_at:string};
  check.close();
  const before=store.historicalSnapshot(new Date(Date.parse(row.known_at)-1).toISOString()) as {projects:{projectId:string}[];roomPlacements:unknown[];layoutReference:string};
  assert.deepEqual(before.projects.map(project=>project.projectId),['legacy']);
  assert.deepEqual(before.roomPlacements,[]);
  assert.equal(before.layoutReference,'unavailable');
  const after=store.historicalSnapshot(row.known_at) as {roomPlacements:{projectId:string}[];layoutReference:string};
  assert.deepEqual(after.roomPlacements.map(placement=>placement.projectId),['legacy']);
  assert.equal(after.layoutReference,'recorded');
});

test('migração v9 registra presença de projeto antigo só a partir da migração',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-presence-'));
  const dbPath=path.join(dir,'db.sqlite');
  let store=new EventStore(dbPath);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'legacy',name:'Legado',canonicalPath:'C:\\legacy'});
  store.close();
  const db=new Database(dbPath);
  db.exec("DROP TABLE github_entity_cursors; DROP TABLE history_github_observations; DROP TABLE project_presence_evidence; UPDATE meta SET value=9 WHERE key='schema_version'");
  db.close();
  store=new EventStore(dbPath);
  const past=store.historicalSnapshot(new Date(Date.now()-86400000).toISOString()) as {projects:unknown[]};
  assert.deepEqual(past.projects,[]);
  const future=store.historicalSnapshot(new Date(Date.now()+3600000).toISOString()) as {projects:{projectId:string}[]};
  assert.deepEqual(future.projects.map(project=>project.projectId),['legacy']);
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

test('transcript antes ou depois da API preserva um marco confirmado e uma celebração',t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'repo-1',owner:'owner',name:'repo',projectId:'p1'});
  const at='2026-11-06T15:00:00Z';
  const now='2026-11-07T15:00:00Z';
  const observe=(eventId:string,entityId:string,offset:number,observedAt=at)=>store.apply({schemaVersion:'1.0',eventId,sourceEventId:eventId,
    sourceId:'transcript-1',sourceVersion:'test',type:'github.observed',projectId:'p1',observedAt,receivedAt:at,
    provenance:'observed',ingestionMode:'live',payload:{repositoryId:'repo-1',entityType:'pull_request',entityId,transition:'merged'},evidenceRefs:[]},
    {sourceId:'transcript-1',fileKey:'synthetic',generation:1,offset});
  const confirm=(entityId:string)=>store.history.recordGithubMilestone({repositoryId:'repo-1',projectId:'p1',entityType:'pull_request',entityId,
    transition:'merged',occurredAt:at,payload:{number:Number(entityId)}});
  assert.equal(observe('observado-1','101',1).applied,true);
  assert.equal(store.history.replay(0,500,now).events.filter(e=>(e as {kind?:string}).kind==='github.milestone').length,0);
  assert.equal(confirm('101'),true);
  assert.equal(confirm('101'),false);
  assert.equal(confirm('102'),true);
  assert.equal(observe('observado-2','102',2).applied,true);
  assert.equal(observe('observado-2','102',3).reason,'duplicate');
  assert.equal(observe('observado-antigo','103',4,'2026-10-20T15:00:00Z').applied,true);
  assert.equal(confirm('103'),true);
  const milestones=store.history.replay(0,500,now).events.filter(e=>(e as {kind?:string}).kind==='github.milestone') as
    {entityId:string;effects:{effectType:string}[];transcriptEvidence:{eventId:string;sourceId:string}[]}[];
  assert.deepEqual(milestones.map(m=>m.entityId),['101','102','103']);
  assert.deepEqual(milestones.map(m=>m.transcriptEvidence.map(e=>e.eventId)),[['observado-1'],['observado-2'],[]]);
  assert.ok(milestones.every(m=>m.effects.length===1 && m.effects[0]?.effectType==='merge.celebration'));
  assert.equal((store.history.daySummary('2026-11-06','UTC',now) as {milestones:unknown[]}).milestones.length,3);
});

test('polling simulado valida ID real, reconhece merge fora da sessão e não resolve CI de outro workflow',async t=>{
  const store=storeFor(t);
  configureGithub(store,{schemaVersion:'1.0',projects:[{projectId:'contaia',name:'ContaIA',canonicalPath:'C:\\Desenv\\Projetos\\rrb-contaia'}],repositories:[{repositoryId:'1371493574',owner:'RodReis',name:'rrb-contaia',projectId:'contaia'}]});
  let requests=0;
  const client=new GitHubClient('x'.repeat(30),async input=>{
    requests++;
    const url=String(input);
    if(url.endsWith('/repos/RodReis/rrb-contaia')) return new Response(JSON.stringify({id:1371493574}),{status:200});
    if(url.includes('/pulls?')) {
      assert.match(url,/sort=created/);
      return new Response(JSON.stringify([{id:11,number:5,state:'closed',merged_at:'2026-11-06T15:00:00Z',updated_at:'2026-11-06T15:00:00Z',html_url:'https://github.com/RodReis/rrb-contaia/pull/5'}]),{status:200});
    }
    return new Response(JSON.stringify({total_count:2,workflow_runs:[
      {id:100,workflow_id:7,run_attempt:1,head_sha:'sha-a',head_branch:'main',status:'completed',conclusion:'failure',updated_at:'2026-11-06T15:05:00Z',html_url:'https://github.com/RodReis/rrb-contaia/actions/runs/100'},
      {id:101,workflow_id:8,run_attempt:1,head_sha:'sha-b',head_branch:'main',status:'completed',conclusion:'success',updated_at:'2026-11-06T15:06:00Z',html_url:'https://github.com/RodReis/rrb-contaia/actions/runs/101'}
    ]}),{status:200});
  });
  const result=await pollLinkedRepositories(store,client);
  assert.equal(result.milestones,3);
  assert.equal(result.errors.length,0);
  const githubCoverage=store.history.daySummary(new Date().toISOString().slice(0,10),'UTC').githubCoverage as {status:string;attempts:number;successfulAttempts:number};
  assert.deepEqual([githubCoverage.status,githubCoverage.attempts,githubCoverage.successfulAttempts],['sampled',1,1]);
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

test('incidente CI atravessa dias e replay mostra apenas o estado no instante',t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'repo-1',owner:'owner-a',name:'same',projectId:'p1'});
  const base={repositoryId:'repo-1',projectId:'p1',entityType:'workflow' as const,entityId:'7:99:main:sha-a',
    payload:{workflowId:7,runId:99,attempt:1,ref:'main',headSha:'sha-a',url:'https://github.com/o/r/actions/runs/99'}};
  assert.equal(store.history.recordGithubMilestone({...base,transition:'attempt-1-failure',occurredAt:'2026-11-05T14:00:00Z'}),true);
  const active=store.historicalSnapshot('2026-11-06T12:00:00Z') as {ciIncidents:{workflowId:number;ref:string}[]};
  assert.deepEqual(active.ciIncidents.map(x=>[x.workflowId,x.ref]),[[7,'main']]);
  const before=store.historicalSnapshot('2026-11-05T13:00:00Z') as {ciIncidents:unknown[]};
  assert.deepEqual(before.ciIncidents,[]);
  assert.equal(store.history.recordGithubMilestone({...base,transition:'attempt-2-success',occurredAt:'2026-11-07T14:00:00Z',
    payload:{...base.payload,attempt:2}}),true);
  const historical=store.historicalSnapshot('2026-11-06T12:00:00Z') as {ciIncidents:Record<string,unknown>[]};
  assert.equal(historical.ciIncidents.length,1);
  assert.equal('lastAttempt' in historical.ciIncidents[0]!,false);
  assert.equal('evidenceUrl' in historical.ciIncidents[0]!,false);
  const carried=store.history.daySummary('2026-11-06','UTC','2026-11-08T00:00:00Z').incidentMarkers as
    {openedBeforeDay:boolean;resolvedAt:string|null;activeAtEnd:boolean}[];
  assert.equal(carried.length,1);
  assert.deepEqual([carried[0]!.openedBeforeDay,carried[0]!.resolvedAt,carried[0]!.activeAtEnd],[true,null,true]);
  const resolved=store.history.daySummary('2026-11-07','UTC','2026-11-08T00:00:00Z').incidentMarkers as
    {openedBeforeDay:boolean;resolvedAt:string|null;activeAtEnd:boolean}[];
  assert.deepEqual([resolved[0]!.openedBeforeDay,resolved[0]!.resolvedAt,resolved[0]!.activeAtEnd],
    [true,'2026-11-07T14:00:00Z',false]);
  assert.equal((store.historicalSnapshot('2026-11-07T13:00:00Z') as {ciIncidents:unknown[]}).ciIncidents.length,1);
  assert.equal((store.historicalSnapshot('2026-11-07T15:00:00Z') as {ciIncidents:unknown[]}).ciIncidents.length,0);
  const lateBase={...base,entityId:'8:100:main:sha-b',payload:{...base.payload,workflowId:8,runId:100,headSha:'sha-b'}};
  assert.equal(store.history.recordGithubMilestone({...lateBase,transition:'attempt-2-success',occurredAt:'2026-11-07T15:00:00Z',
    payload:{...lateBase.payload,attempt:2}}),true);
  assert.equal(store.history.recordGithubMilestone({...lateBase,transition:'attempt-1-failure',occurredAt:'2026-11-05T15:00:00Z'}),true);
  const lateDay=store.history.daySummary('2026-11-06','UTC','2026-11-08T00:00:00Z').incidentMarkers as {workflowId:number}[];
  assert.deepEqual(lateDay.map(x=>x.workflowId),[7,8]);
  assert.deepEqual((store.historicalSnapshot('2026-11-06T12:00:00Z') as {ciIncidents:{workflowId:number}[]}).ciIncidents.map(x=>x.workflowId),[7,8]);
  assert.equal((store.historicalSnapshot('2026-11-07T16:00:00Z') as {ciIncidents:unknown[]}).ciIncidents.length,0);
});

test('primeira coleta é backfill; novas transições são live sem repetir efeito',async t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  let phase=0;
  const freshAt=new Date(Date.now()+1000).toISOString();
  const client=new GitHubClient('',async input=>{
    const url=String(input);
    if(url.endsWith('/repos/owner-a/same')) return new Response(JSON.stringify({id:42}),{status:200});
    if(url.includes('/pulls?')) return new Response(JSON.stringify([
      {id:1,number:1,state:'closed',merged_at:'2026-11-05T12:00:00Z',updated_at:'2026-11-05T12:00:00Z',html_url:'https://github.com/owner-a/same/pull/1'},
      ...(phase ? [{id:2,number:2,state:'closed',merged_at:freshAt,updated_at:freshAt,html_url:'https://github.com/owner-a/same/pull/2'}] : []),
      ...(phase>1 ? [{id:3,number:3,state:'closed',merged_at:'2026-11-05T13:00:00Z',updated_at:'2026-11-05T13:00:00Z',html_url:'https://github.com/owner-a/same/pull/3'}] : [])
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
  phase=2;
  assert.equal((await pollLinkedRepositories(store,client)).milestones,1);
  assert.equal((store.history.replay(0,10).events as {ingestionMode:string}[])[2]?.ingestionMode,'backfill');
  assert.equal((await pollLinkedRepositories(store,client)).milestones,0);
});

test('merge ocorrido durante coleta anterior e visto depois permanece live',async t=>{
  const store=storeFor(t);
  const startedAt=new Date(Date.now()-20000).toISOString();
  const mergedAt=new Date(Date.now()-15000).toISOString();
  const completedAt=new Date(Date.now()-10000).toISOString();
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'},new Date(Date.now()-86400000).toISOString());
  store.history.markPollSuccess('42',startedAt,[],60000,completedAt);
  assert.equal(store.history.lastSuccessfulPollAt('42'),completedAt);
  assert.equal(store.history.lastSuccessfulPollStartedAt('42'),startedAt);
  const client=new GitHubClient('',async input=>{
    const url=String(input);
    if(url.endsWith('/repos/owner-a/same'))return new Response(JSON.stringify({id:42}),{status:200});
    if(url.includes('/pulls?'))return new Response(JSON.stringify([{id:2,number:2,state:'closed',merged_at:mergedAt,
      updated_at:mergedAt,html_url:'https://github.com/owner-a/same/pull/2'}]),{status:200});
    return new Response(JSON.stringify({workflow_runs:[]}),{status:200});
  });
  assert.equal((await pollLinkedRepositories(store,client)).milestones,1);
  const item=store.history.replay(0,10).events[0] as {ingestionMode:string;effects:{ingestionMode:string}[]};
  assert.equal(item.ingestionMode,'live');
  assert.equal(item.effects[0]?.ingestionMode,'live');
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
  assert.throws(()=>malicious.restorePageCache([{url:'https://evil.test/steal',etag:'"bad"',next:null}]),/inválido/);
  let anonymousHeaders: HeadersInit | undefined;
  const anonymous=new GitHubClient('',async (_input,init)=>{anonymousHeaders=init?.headers;return new Response('[]',{status:200});},'https://api.github.test');
  await anonymous.getAllPages('/public');
  assert.equal((anonymousHeaders as Record<string,string>).Authorization,undefined);
});

test('limite GitHub converte Retry-After em segundos e não marca coleta como concluída',async t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  const client=new GitHubClient('',async()=>new Response('{}',{status:403,headers:{'retry-after':'2'}}));
  await assert.rejects(()=>client.get('/repos/owner-a/same'),error=>error instanceof GitHubRateLimitError && error.retryAfterMs===2000);
  const result=await pollLinkedRepositories(store,client);
  assert.equal(result.milestones,0);
  assert.equal(result.errors[0]?.retryAfterMs,2000);
  assert.equal(store.history.hasSuccessfulPoll('42'),false);
  const coverage=store.history.daySummary(new Date().toISOString().slice(0,10),'UTC',new Date(Date.now()+1000).toISOString()).githubCoverage as {status:string;failedAttempts:number;gaps:unknown[]};
  assert.equal(coverage.status,'failed');
  assert.equal(coverage.failedAttempts,1);
  assert.deepEqual(coverage.gaps,[]);
});

test('GitHub 429 e limite secundário 403 aplicam pausa; coleta de PR e CI não concorre',async t=>{
  const tooMany=new GitHubClient('',async()=>new Response('{}',{status:429,headers:{'retry-after':'3'}}));
  await assert.rejects(()=>tooMany.get('/repos/owner-a/same'),error=>error instanceof GitHubRateLimitError && error.retryAfterMs===3000);
  const secondary=new GitHubClient('',async()=>new Response(JSON.stringify({message:'You have exceeded a secondary rate limit.'}),{status:403}));
  await assert.rejects(()=>secondary.get('/repos/owner-a/same'),error=>error instanceof GitHubRateLimitError && error.retryAfterMs===60000);
  const denied=new GitHubClient('',async()=>new Response(JSON.stringify({message:'Resource not accessible'}),{status:403}));
  await assert.rejects(()=>denied.get('/repos/owner-a/same'),/HTTP 403/);
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  let active=0,maxActive=0;
  const client=new GitHubClient('',async input=>{
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,5));
    active--;
    const url=String(input);
    if(url.endsWith('/repos/owner-a/same'))return new Response(JSON.stringify({id:42}),{status:200});
    if(url.includes('/pulls?'))return new Response('[]',{status:200});
    return new Response(JSON.stringify({workflow_runs:[]}),{status:200});
  });
  assert.equal((await pollLinkedRepositories(store,client)).errors.length,0);
  assert.equal(maxActive,1);
});

test('limite da API interrompe a rodada antes dos outros repositórios',async t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'first',projectId:'p1'});
  store.history.linkRepository({repositoryId:'43',owner:'owner-b',name:'second',projectId:'p1'});
  const requested:string[]=[];
  const client=new GitHubClient('',async input=>{
    requested.push(String(input));
    return new Response('{}',{status:429,headers:{'retry-after':'3'}});
  });
  const result=await pollLinkedRepositories(store,client);
  assert.equal(result.repositories,2);
  assert.deepEqual(result.errors.map(error=>[error.repositoryId,error.retryAfterMs]),[['42',3000]]);
  assert.equal(requested.length,1);
  assert.match(requested[0]??'',/owner-a\/first$/);
});

test('prazo de pausa GitHub sobrevive ao reinício do serviço',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-retry-'));
  const dbPath=path.join(dir,'db.sqlite');
  const store=new EventStore(dbPath);
  let reopened:EventStore|undefined;
  t.after(()=>{try{store.close();}catch{};reopened?.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'p1',name:'Projeto',canonicalPath:'C:\\retry'});
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  const before=Date.now();
  const client=new GitHubClient('',async()=>new Response('{}',{status:429,headers:{'retry-after':'120'}}));
  const result=await pollLinkedRepositories(store,client);
  assert.equal(result.errors[0]?.retryAfterMs,120000);
  const until=store.history.githubRetryUntilMs();
  assert.ok(until>=before+120000 && until<=Date.now()+120000);
  store.close();
  reopened=new EventStore(dbPath);
  assert.equal(reopened.history.githubRetryUntilMs(),until);
});

test('ETag por página evita reprocessar respostas 304 e preserva próxima página',async()=>{
  const requests: {url:string;etag:string|undefined}[]=[];
  const client=new GitHubClient('',async (input,init)=>{
    const url=String(input);
    const etag=(init?.headers as Record<string,string> | undefined)?.['If-None-Match'];
    requests.push({url,etag});
    if(etag) return new Response(null,{status:304});
    return new Response(JSON.stringify([{id:url.endsWith('/first')?1:2}]),{status:200,headers:{etag:url.endsWith('/first')?'"first"':'"second"',
      ...(url.endsWith('/first')?{link:'<https://api.github.test/second>; rel="next"'}:{})}});
  },'https://api.github.test');
  assert.deepEqual(await client.getAllPages<{id:number}>('/first'),[{id:1},{id:2}]);
  assert.deepEqual(await client.getAllPages<{id:number}>('/first'),[]);
  assert.deepEqual(requests.map(x=>x.etag),[undefined,undefined,'"first"','"second"']);
});

test('ETag só é restaurado do SQLite após coleta concluída e sobrevive reinício',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-etag-'));
  const dbPath=path.join(dir,'db.sqlite');
  let store:EventStore|null=new EventStore(dbPath);
  t.after(()=>{store?.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'p1',name:'Projeto',canonicalPath:'C:\\synthetic'});
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'},'2026-01-01T00:00:00Z');
  let conditional=0;
  const fetcher=async(input:string|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith('/repos/owner-a/same')) return new Response(JSON.stringify({id:42}),{status:200});
    if((init?.headers as Record<string,string>)['If-None-Match']) {conditional++;return new Response(null,{status:304});}
    if(url.includes('/pulls?')) return new Response(JSON.stringify([{id:11,number:5,state:'closed',merged_at:'2026-11-06T15:00:00Z',updated_at:'2026-11-06T15:00:00Z',html_url:'https://github.com/owner-a/same/pull/5'}]),{status:200,headers:{etag:'"prs"'}});
    return new Response(JSON.stringify({workflow_runs:[]}),{status:200,headers:{etag:'"runs"'}});
  };
  assert.equal((await pollLinkedRepositories(store,new GitHubClient('',fetcher))).milestones,1);
  assert.equal(store.history.githubPageCache().length,2);
  const firstScanStartedAt=store.history.lastSuccessfulPollStartedAt('42');
  assert.ok(firstScanStartedAt);
  store.close();store=null;
  store=new EventStore(dbPath);
  assert.equal(store.history.lastSuccessfulPollStartedAt('42'),firstScanStartedAt);
  const client=new GitHubClient('',fetcher);
  client.restorePageCache(store.history.githubPageCache());
  const result=await pollLinkedRepositories(store,client);
  assert.equal(result.milestones,0);
  assert.equal(result.errors.length,0);
  assert.equal(conditional,2);
  assert.equal((store.history.replay(0,10).events as unknown[]).length,1);
});

test('cursor por entidade persiste reinício, ignora versão igual e registra merge e rerun',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-entity-cursor-'));
  const dbPath=path.join(dir,'db.sqlite');
  let store:EventStore|null=new EventStore(dbPath);
  t.after(()=>{store?.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'p1',name:'Projeto',canonicalPath:'C:\\synthetic'});
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'repo',projectId:'p1'},'2026-11-01T00:00:00Z');
  let phase=0;
  const times=['2026-11-06T15:00:00Z','2026-11-06T15:05:00Z','2026-11-06T15:10:00Z'];
  const fetcher=async(input:string|URL)=>{
    const url=String(input);
    if(url.endsWith('/repos/owner-a/repo')) return new Response(JSON.stringify({id:42}),{status:200});
    if(url.includes('/pulls?')) return new Response(JSON.stringify([{id:11,number:5,state:phase===2?'closed':'open',
      merged_at:phase===2?times[phase]:null,updated_at:times[phase],html_url:'https://github.com/owner-a/repo/pull/5'}]),{status:200});
    return new Response(JSON.stringify({workflow_runs:[{id:100,workflow_id:7,run_attempt:phase===2?2:1,head_sha:'sha-a',
      head_branch:'main',status:'completed',conclusion:phase===2?'success':'failure',updated_at:times[phase],
      html_url:'https://github.com/owner-a/repo/actions/runs/100'}]}),{status:200});
  };
  const cursors=()=>{
    const db=new Database(dbPath);
    try{return db.prepare('SELECT entity_type,remote_updated_at,transition FROM github_entity_cursors ORDER BY entity_type').all() as
      {entity_type:string;remote_updated_at:string;transition:string}[];}
    finally{db.close();}
  };
  assert.equal((await pollLinkedRepositories(store,new GitHubClient('',fetcher))).milestones,2);
  assert.deepEqual(cursors().map(row=>row.entity_type),['pull_request','workflow']);
  store.close();store=null;
  store=new EventStore(dbPath);
  assert.equal((await pollLinkedRepositories(store,new GitHubClient('',fetcher))).milestones,0);
  phase=1;
  assert.equal((await pollLinkedRepositories(store,new GitHubClient('',fetcher))).milestones,0);
  assert.ok(cursors().every(row=>row.remote_updated_at===times[1]));
  phase=2;
  assert.equal((await pollLinkedRepositories(store,new GitHubClient('',fetcher))).milestones,2);
  assert.deepEqual(cursors().map(row=>row.transition),['merged','attempt-2-success']);
  assert.equal((await pollLinkedRepositories(store,new GitHubClient('',fetcher))).milestones,0);
  const milestones=store.history.replay(0,20,'2026-11-07T15:00:00Z').events.filter(e=>(e as {kind?:string}).kind==='github.milestone') as
    {entityType:string;transition:string;effects:{effectType:string}[]}[];
  assert.equal(milestones.length,4);
  assert.equal(milestones.filter(m=>m.transition==='merged' && m.effects[0]?.effectType==='merge.celebration').length,1);
  assert.equal((store.history.daySummary('2026-11-06','UTC','2026-11-07T15:00:00Z') as {incidentMarkers:{activeAtEnd:boolean}[]}).incidentMarkers[0]?.activeAtEnd,false);
});

test('novo projeto vinculado recebe backfill mesmo após ETag 304 de outro projeto',async t=>{
  const store=storeFor(t);
  store.registerProject({projectId:'p2',name:'Segundo',canonicalPath:'C:\\Projects\\second'});
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'},'2026-11-06T00:00:00Z');
  let conditional=0;
  const client=new GitHubClient('',async (input,init)=>{
    const url=String(input);
    if(url.endsWith('/repos/owner-a/same')) return new Response(JSON.stringify({id:42}),{status:200});
    if((init?.headers as Record<string,string>)['If-None-Match']) {conditional++;return new Response(null,{status:304});}
    if(url.includes('/pulls?')) return new Response(JSON.stringify([{id:11,number:5,state:'closed',merged_at:'2026-11-06T15:00:00Z',updated_at:'2026-11-06T15:00:00Z',html_url:'https://github.com/owner-a/same/pull/5'}]),{status:200,headers:{etag:'"prs"'}});
    return new Response(JSON.stringify({workflow_runs:[]}),{status:200,headers:{etag:'"runs"'}});
  });
  assert.equal((await pollLinkedRepositories(store,client)).milestones,1);
  assert.equal((await pollLinkedRepositories(store,client)).milestones,0);
  assert.equal(conditional,2);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p2'},new Date(Date.now()+1000).toISOString());
  assert.equal((await pollLinkedRepositories(store,client)).milestones,1);
  const day=store.history.daySummary('2026-11-06','America/Sao_Paulo') as {milestones:{projectId:string;ingestionMode:string}[]};
  assert.deepEqual(day.milestones.map(x=>[x.projectId,x.ingestionMode]).sort(),[['p1','backfill'],['p2','backfill']]);
});

test('erro em workflows invalida ETag de PR antes da gravação parcial',async t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  let fail=true; let conditionalPr=false;
  const client=new GitHubClient('',async (input,init)=>{
    const url=String(input);
    if(url.endsWith('/repos/owner-a/same')) return new Response(JSON.stringify({id:42}),{status:200});
    if(url.includes('/pulls?')) {
      conditionalPr=conditionalPr || Boolean((init?.headers as Record<string,string>)['If-None-Match']);
      return new Response(JSON.stringify([{id:11,number:5,state:'closed',merged_at:'2026-11-06T15:00:00Z',updated_at:'2026-11-06T15:00:00Z',html_url:'https://github.com/owner-a/same/pull/5'}]),{status:200,headers:{etag:'"prs"'}});
    }
    if(fail) return new Response('{}',{status:503});
    return new Response(JSON.stringify({workflow_runs:[]}),{status:200});
  });
  assert.equal((await pollLinkedRepositories(store,client)).errors.length,1);
  assert.equal(store.history.hasSuccessfulPoll('42'),false);
  assert.equal(store.history.githubPageCache().length,0);
  fail=false;
  assert.equal((await pollLinkedRepositories(store,client)).milestones,1);
  assert.equal(conditionalPr,false);
});

test('rotas de dia e replay autenticadas; comandos replay continuam rejeitados no backend',async t=>{
  const store=storeFor(t); const token=randomBytes(32).toString('hex');
  store.apply({schemaVersion:'1.0',eventId:'source-lost',sourceEventId:'source-lost',sourceId:'source1',sourceVersion:'test',type:'source.unavailable',observedAt:'2026-11-06T14:00:00Z',receivedAt:'2026-11-06T14:00:01Z',provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]},
    {sourceId:'source1',fileKey:'synthetic',generation:1,offset:1});
  const {server,url}=await startReadOnlyServer(store,token); t.after(()=>server.close());
  const headers={Authorization:`Bearer ${token}`};
  const day=await fetch(`${url}/v1/history/day?date=2026-11-06&timeZone=America%2FSao_Paulo`,{headers});
  assert.equal(day.status,200); assert.equal((await day.json() as {timeZone:string}).timeZone,'America/Sao_Paulo');
  assert.equal((await fetch(`${url}/v1/history/day?date=2026-02-30&timeZone=America%2FSao_Paulo`,{headers})).status,400);
  assert.equal((await fetch(`${url}/v1/history/day?date=2026-11-06&timeZone=Fuso%2FInexistente`,{headers})).status,400);
  const replay=await fetch(`${url}/v1/history/replay?cursor=0&limit=10`,{headers});
  assert.equal((await replay.json() as {viewMode:string}).viewMode,'replay');
  const state=await fetch(`${url}/v1/history/replay/state?at=2026-11-06T15%3A00%3A00Z`,{headers});
  assert.equal(state.status,200);
  const historicalState=(await state.json()) as {mode:string;coverage:{status:string;gaps:{sourceId:string}[]}};
  assert.equal(historicalState.mode,'replay');
  assert.deepEqual(historicalState.coverage,
    {status:'gap',reason:'expected_collection_windows_not_recorded',gaps:[{sourceId:'source1',start:'2026-11-06T14:00:00Z',end:'2026-11-06T15:00:00Z',reason:'source_unavailable'}]});
  assert.equal((await fetch(`${url}/v1/history/replay/state?at=invalid`,{headers})).status,400);
  assert.equal((await fetch(`${url}/v1/commands`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,405);
});

test('replay recusa cursor expirado ou futuro e aceita limite da janela',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-replay-cursor-'));
  const dbPath=path.join(dir,'db.sqlite');
  const store=new EventStore(dbPath);
  let server: Awaited<ReturnType<typeof startReadOnlyServer>>['server']|null=null;
  t.after(()=>{server?.closeAllConnections();server?.close();store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'p1',name:'Projeto',canonicalPath:'C:\\synthetic'});
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  assert.equal(store.history.recordGithubMilestone({repositoryId:'42',projectId:'p1',entityType:'pull_request',entityId:'7',
    transition:'merged',occurredAt:'2026-11-06T15:00:00Z',payload:{number:7}}),true);
  const db=new Database(dbPath);
  db.prepare("UPDATE meta SET value=2 WHERE key='transport_baseline'").run();
  assert.equal(store.history.replay(0,10).events.length,1);
  db.prepare("UPDATE meta SET value=1 WHERE key='replay_baseline'").run();
  db.close();
  assert.throws(()=>store.history.replay(0,10),/indisponível/);
  assert.equal(store.history.replay(1,10).events.length,1);
  assert.throws(()=>store.history.replay(3,10),/indisponível/);
  const token=randomBytes(32).toString('hex');
  const started=await startReadOnlyServer(store,token);server=started.server;
  const headers={Authorization:`Bearer ${token}`};
  for(const cursor of [0,3]){
    const response=await fetch(`${started.url}/v1/history/replay?cursor=${cursor}`,{headers});
    assert.equal(response.status,409);
    assert.deepEqual(await response.json(),{code:'resync_required'});
  }
  assert.equal((await fetch(`${started.url}/v1/history/replay?cursor=1`,{headers})).status,200);
});

test('retenção 7/90 oculta detalhe antigo, preserva contagem e sinaliza evidência expirada',async t=>{
  const store=storeFor(t);
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  const base={repositoryId:'42',projectId:'p1',entityType:'pull_request' as const,transition:'merged'};
  assert.equal(store.history.recordGithubMilestone({...base,entityId:'old',occurredAt:'2026-10-20T15:00:00Z',payload:{url:'https://example.test/private-old'}}),true);
  assert.equal(store.history.recordGithubMilestone({...base,entityId:'new',occurredAt:'2026-11-06T15:00:00Z',payload:{url:'https://example.test/recent'}}),true);
  assert.equal(store.history.recordGithubMilestone({...base,entityId:'late-old',occurredAt:'2026-10-21T15:00:00Z',payload:{url:'https://example.test/private-late'}}),true);
  const now='2026-11-07T15:00:00Z';
  const old=store.history.daySummary('2026-10-20','UTC',now) as {milestones:unknown[];milestoneCounts:{count:number}[];retention:{evidenceStatus:string}};
  assert.deepEqual(old.milestones,[]);
  assert.deepEqual(old.milestoneCounts.map(row=>row.count),[1]);
  assert.equal(old.retention.evidenceStatus,'expired');
  assert.doesNotMatch(JSON.stringify(old),/private-old/);
  const replay=store.history.replay(0,10,now) as {events:{entityId:string}[]};
  assert.deepEqual(replay.events.map(row=>row.entityId),['new']);
  assert.throws(()=>store.historicalSnapshot('2026-10-20T15:00:00Z',now),/expirado/);
  assert.throws(()=>store.history.daySummary('2026-07-01','UTC',now),/expirado/);
  const token=randomBytes(32).toString('hex');
  const {server,url}=await startReadOnlyServer(store,token);
  t.after(()=>{server.closeAllConnections();server.close();});
  const headers={Authorization:`Bearer ${token}`};
  const retention=await fetch(`${url}/v1/history/retention`,{headers});
  assert.equal(retention.status,200);
  assert.deepEqual([(await retention.json() as {detailWindowDays:number;aggregateWindowDays:number}).detailWindowDays,
    (await (await fetch(`${url}/v1/history/retention`,{headers})).json() as {aggregateWindowDays:number}).aggregateWindowDays],[7,90]);
  const expiredDay=await fetch(`${url}/v1/history/day?date=2026-01-01&timeZone=UTC`,{headers});
  assert.equal(expiredDay.status,410);
  assert.deepEqual(await expiredDay.json(),{code:'aggregate_expired',evidenceStatus:'expired'});
  const expiredState=await fetch(`${url}/v1/history/replay/state?at=2026-01-01T12%3A00%3A00Z`,{headers});
  assert.equal(expiredState.status,410);
  assert.deepEqual(await expiredState.json(),{code:'evidence_expired',evidenceStatus:'expired'});
  const workflow={repositoryId:'42',projectId:'p1',entityType:'workflow' as const,
    payload:{workflowId:7,runId:1,attempt:1,ref:'main',headSha:'sha',url:'https://example.test/ci'}};
  store.history.recordGithubMilestone({...workflow,entityId:'closed-failure',transition:'attempt-1-failure',occurredAt:'2026-01-01T12:00:00Z'});
  store.history.recordGithubMilestone({...workflow,entityId:'closed-success',transition:'attempt-1-success',occurredAt:'2026-01-01T12:05:00Z'});
  store.history.recordGithubMilestone({...workflow,entityId:'open-failure',transition:'attempt-1-failure',occurredAt:'2026-01-01T12:10:00Z',payload:{...workflow.payload,workflowId:8}});
  store.history.markPollSuccess('42','2026-01-01T12:00:00Z',[],60000,'2026-01-01T12:00:01Z');
  assert.deepEqual(store.history.pruneExpired(now),{effects:4,resolvedIncidents:1,pollAttempts:1,scrubbedMilestones:5,scrubbedEventEvidence:0,observations:0});
  assert.deepEqual(store.history.pruneExpired(now),{effects:0,resolvedIncidents:0,pollAttempts:0,scrubbedMilestones:0,scrubbedEventEvidence:0,observations:0});
  assert.equal(store.history.ciIncidentsAt(now).some(incident=>incident.workflowId===8),true);
});

test('manutenção elimina URLs e evidência de transcript expirada sem perder contagem e incidente aberto',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'wr3d-m3-retention-'));
  const dbPath=path.join(dir,'db.sqlite');
  const store=new EventStore(dbPath);
  let db:Database.Database|null=null;
  t.after(()=>{db?.close();store.close();rmSync(dir,{recursive:true,force:true});});
  store.registerProject({projectId:'p1',name:'Projeto',canonicalPath:'C:\\synthetic'});
  store.history.linkRepository({repositoryId:'42',owner:'owner-a',name:'same',projectId:'p1'});
  const at='2026-10-20T15:00:00Z';
  store.apply({schemaVersion:'1.0',eventId:'transcript-old',sourceId:'transcript',sourceVersion:'test',
    type:'github.observed',observedAt:at,receivedAt:at,projectId:'p1',provenance:'observed',ingestionMode:'backfill',
    payload:{repositoryId:'42',entityType:'pull_request',entityId:'11',transition:'merged'},evidenceRefs:['private-ref']},
    {sourceId:'transcript',fileKey:'synthetic',generation:1,offset:1});
  store.history.recordGithubMilestone({repositoryId:'42',projectId:'p1',entityType:'pull_request',entityId:'11',
    transition:'merged',occurredAt:at,payload:{url:'https://example.test/private-old'}});
  store.history.recordGithubMilestone({repositoryId:'42',projectId:'p1',entityType:'workflow',entityId:'run-1',
    transition:'attempt-1-failure',occurredAt:at,payload:{workflowId:8,runId:1,ref:'main',headSha:'secret-sha',url:'https://example.test/private-ci'}});
  store.history.recordGithubMilestone({repositoryId:'42',projectId:'p1',entityType:'workflow',entityId:'run-2',
    transition:'attempt-1-success',occurredAt:'2026-10-21T15:00:00Z',payload:{workflowId:9,runId:2,ref:'main',headSha:'secret-sha',url:'https://example.test/private-ci'}});
  db=new Database(dbPath);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM history_github_observations').get() as {count:number}).count,1);
  const pruned=store.history.pruneExpired('2026-11-07T15:00:00Z');
  assert.deepEqual({scrubbedMilestones:pruned.scrubbedMilestones,scrubbedEventEvidence:pruned.scrubbedEventEvidence,observations:pruned.observations},
    {scrubbedMilestones:3,scrubbedEventEvidence:1,observations:1});
  const stored=JSON.stringify({events:db.prepare('SELECT event_json FROM events').all(),milestones:db.prepare('SELECT payload_json FROM history_milestones').all()});
  assert.doesNotMatch(stored,/private-old|private-ci|secret-sha|private-ref/);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM history_github_observations').get() as {count:number}).count,0);
  assert.equal((store.history.daySummary('2026-10-20','UTC','2026-11-07T15:00:00Z') as {milestoneCounts:{count:number}[]}).milestoneCounts.reduce((sum,row)=>sum+row.count,0),2);
  assert.equal(store.history.ciIncidentsAt('2026-11-07T15:00:00Z').some(incident=>incident.workflowId===8),true);
  assert.equal(store.history.pruneExpired('2026-11-07T15:00:00Z').scrubbedMilestones,0);
  store.history.recordGithubMilestone({repositoryId:'42',projectId:'p1',entityType:'workflow',entityId:'late-run',
    transition:'attempt-1-failure',occurredAt:'2026-10-20T14:00:00Z',
    payload:{workflowId:9,runId:3,ref:'main',headSha:'late-sha',url:'https://example.test/late'}});
  assert.equal(store.history.ciIncidentsAt('2026-11-07T15:00:00Z').some(incident=>incident.workflowId===9),false);
});
