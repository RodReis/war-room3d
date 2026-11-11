import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { EventStore, type NormalizedEvent } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import type { SessionSource } from '../src/sessions/adapters.ts';

test('série por projeto usa horário da origem, deduplicação e cobertura explícita',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'wr3d-51-activity-'));
  const store=new EventStore(path.join(dir,'state.sqlite'));
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const projects=[{projectId:'project-a',name:'Projeto A',canonicalPath:'C:\\lab\\a'},
    {projectId:'project-b',name:'Projeto B',canonicalPath:'C:\\lab\\b'}];
  const sources:SessionSource[]=projects.map((project,index)=>({
    sourceId:`source-${index}`,sourceVersion:'1',provider:'claude',projectId:project.projectId,
    accountRef:'lab',filePath:`C:\\lab\\${index}.jsonl`}));
  store.configureSessionSources(projects,sources);
  let offset=0;
  const event=(source:SessionSource,type:string,observedAt:string,extras:Partial<NormalizedEvent>={}):NormalizedEvent=>({
    schemaVersion:'1.0',eventId:`e-${++offset}`,sourceId:source.sourceId,sourceVersion:source.sourceVersion,
    sourceEventId:`native-${offset}`,type,observedAt,receivedAt:observedAt,projectId:source.projectId,
    provider:'claude',sessionKey:`session-${source.projectId}`,provenance:'observed',ingestionMode:'live',
    payload:{},evidenceRefs:[],...extras});
  const apply=(item:NormalizedEvent)=>store.apply(item,{sourceId:item.sourceId,fileKey:'fixture',generation:0,offset:offset});
  apply(event(sources[0]!,'session.observed','2026-11-11T11:30:00.000Z'));
  apply(event(sources[1]!,'session.observed','2026-11-11T11:30:00.000Z'));
  const coverageA=event(sources[0]!,'source.covered','2026-11-11T12:30:00.000Z',{
    evidenceRefs:['coverage-a'],
    payload:{coverageStart:'2026-11-11T11:30:00.000Z',coverageEnd:'2026-11-11T12:30:00.000Z'}});
  const coverageB=event(sources[1]!,'source.covered','2026-11-11T12:30:00.000Z',{
    evidenceRefs:['coverage-b'],
    payload:{coverageStart:'2026-11-11T11:30:00.000Z',coverageEnd:'2026-11-11T12:30:00.000Z'}});
  assert.equal(apply(coverageA).applied,true);
  assert.equal(apply(coverageB).applied,true);
  const action=event(sources[0]!,'tool.observed','2026-11-11T12:06:00.000Z',{payload:{invocationId:'tool-1',name:'Read'}});
  assert.equal(apply(action).applied,true);
  assert.equal(apply(action).reason,'duplicate');
  const boundary=event(sources[0]!,'tool.observed','2026-11-11T12:10:00Z',
    {payload:{invocationId:'tool-boundary',name:'Read'}});
  assert.equal(apply(boundary).applied,true);
  const later=event(sources[0]!,'message.observed','2026-11-11T12:25:00.000Z',{payload:{messageId:'message-1'}});
  apply(later);
  const delayed=event(sources[0]!,'task.observed','2026-11-11T12:08:00.000Z',{
    receivedAt:'2026-11-11T12:35:00.000Z',ingestionMode:'backfill',payload:{taskId:'task-1',title:'Tarefa sintética'}});
  apply(delayed);
  const lost=event(sources[0]!,'source.unavailable','2026-11-11T12:20:00.000Z',{payload:{reason:'source_lost'}});
  const recovered=event(sources[0]!,'source.recovered','2026-11-11T12:25:00.000Z',{payload:{reason:'source_recovered'}});
  apply(lost);apply(recovered);
  const hour=store.activity.hour('2026-11-11T12:30:00.000Z');
  assert.equal(hour.intervalMinutes,5);
  assert.equal(hour.unit,'eventos observados');
  const a=hour.series.find(item=>item.projectId==='project-a')!;
  const b=hour.series.find(item=>item.projectId==='project-b')!;
  assert.equal(a.buckets[7]?.count,2); // 12:05–12:10; duplicata não infla, backfill entra
  assert.equal(a.buckets[7]?.coverage,'covered');
  assert.equal(a.buckets[8]?.count,1); // instante exato pertence ao próximo intervalo
  assert.equal(b.buckets[7]?.count,0);
  assert.equal(b.buckets[7]?.coverage,'covered');
  assert.equal(a.buckets[10]?.count,null); // 12:20–12:25: perda da fonte
  assert.equal(a.buckets[10]?.coverage,'gap');
  assert.equal(b.buckets[10]?.count,0);
  assert.equal(a.lastUpdatedAt,'2026-11-11T12:30:00.000Z');
  assert.equal(b.lastUpdatedAt,'2026-11-11T12:30:00.000Z');
  assert.equal(b.buckets.reduce((sum,bucket)=>sum+(bucket.count??0),0),0);
  apply(event(sources[1]!,'source.covered','2026-11-11T12:35:00.000Z',{
    receivedAt:'2026-11-11T12:40:00.000Z',ingestionMode:'backfill',
    evidenceRefs:['coverage-b-backfill'],
    payload:{coverageStart:'2026-11-11T11:30:00.000Z',coverageEnd:'2026-11-11T12:30:00.000Z'}}));
  assert.equal(store.activity.hour('2026-11-11T12:40:00.000Z').series.find(item=>item.projectId==='project-b')?.lastUpdatedAt,
    '2026-11-11T12:30:00.000Z');
  assert.deepEqual(store.activity.events('project-a','2026-11-11T12:05:00.000Z','2026-11-11T12:10:00.000Z')
    ?.items.map(item=>item.eventId).sort(),[action.eventId,delayed.eventId].sort());
  assert.deepEqual(store.activity.events('project-b','2026-11-11T12:05:00.000Z','2026-11-11T12:10:00.000Z')?.items,[]);
  assert.deepEqual(store.activity.events('project-a','2026-11-11T12:10:00.000Z','2026-11-11T12:15:00.000Z')
    ?.items.map(item=>item.eventId),[boundary.eventId]);
  const token=randomBytes(32).toString('hex');
  const server=await startReadOnlyServer(store,token);
  t.after(()=>new Promise<void>(resolve=>server.server.close(()=>resolve())));
  const headers={Authorization:`Bearer ${token}`};
  assert.equal((await fetch(`${server.url}/v1/activity`,{headers})).status,200);
  const endpoint=`${server.url}/v1/activity/events?projectId=project-a&from=2026-11-11T12%3A05%3A00.000Z&to=2026-11-11T12%3A10%3A00.000Z`;
  const response=await fetch(endpoint,{headers});
  assert.equal(response.status,200);
  const details=await response.json() as {items:{sourceId:string;observedAt:string}[]};
  assert.equal(details.items.length,2);
  assert.ok(details.items.every(item=>item.sourceId==='source-0'&&item.observedAt.startsWith('2026-11-11T12:0')));
  assert.equal((await fetch(endpoint,{headers:{Authorization:'Bearer invalid'}})).status,401);
  assert.equal((await fetch(endpoint,{headers:{...headers,Origin:'http://evil.invalid'}})).status,403);
});
