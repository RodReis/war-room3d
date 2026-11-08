import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { randomBytes } from 'node:crypto';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import { createDockerLogsCollector, createHttpNetworkSink } from '../src/operations/operation-collector.ts';
import type { Observation, OperationSource } from '../src/operations/operations-store.ts';

function setup(t:TestContext) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'wr3d-m5-'));
  const store=new EventStore(path.join(directory,'state.sqlite'));
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  store.registerProject({projectId:'project-a',name:'Projeto sintético',canonicalPath:'C:\\Projetos\\sintetico'});
  store.infrastructure.replaceInventory({schemaVersion:'1.0',environments:[{environmentId:'env-a',name:'Laboratório sintético'}],
    resources:[{resourceId:'api-a',environmentId:'env-a',kind:'api',name:'API sintética',sourceId:'probe-a',staleAfterMs:60_000}],
    projectResources:[{projectId:'project-a',resourceId:'api-a',origin:'configured',confidence:'confirmed'}],dependencies:[]});
  const source:OperationSource={sourceId:'logs-lab',sourceVersion:'1.0',environmentId:'env-a',enabled:true,permissions:['log','trace','network','security_detection'],staleAfterMs:60_000,retentionDays:14};
  store.operations.registerSource(source);
  return {store,source};
}

function observation(overrides:Partial<Observation>={}):Observation {
  const now='2026-11-07T12:00:00.000Z';
  return {schemaVersion:'1.0',observationId:'obs-1',sourceId:'logs-lab',sourceVersion:'1.0',environmentId:'env-a',resourceId:'api-a',observedAt:now,receivedAt:now,
    category:'log',classification:'application',confidence:'observed',evidenceRef:'file://logs/app.log?token=secret-value',coverage:'covered',fields:{message:'Authorization: Bearer sample-secret {"password":"json-secret"}',api_token:'leak',status:500},...overrides};
}

test('cobertura distingue fonte ausente, sem dados, sem permissão, desligada, indisponível e desatualizada',t=>{
  const {store,source}=setup(t);
  assert.equal(store.operations.coverage('env-missing','log'),'absent');
  assert.equal(store.operations.coverage('env-a','log'),'no_data');
  store.operations.registerSource({...source,sourceId:'off',enabled:false});
  store.operations.registerSource({...source,sourceId:'denied',status:'denied'});
  store.operations.registerSource({...source,sourceId:'down',status:'unavailable'});
  assert.equal(store.operations.sources('env-a').find(x=>x.sourceId==='off')?.coverage.log,'disabled');
  assert.equal(store.operations.sources('env-a').find(x=>x.sourceId==='denied')?.coverage.log,'no_permission');
  assert.equal(store.operations.sources('env-a').find(x=>x.sourceId==='down')?.coverage.log,'unavailable');
  store.operations.record(observation());
  assert.equal(store.operations.record(observation()),false);
  assert.equal(store.operations.coverage('env-a','log','2026-11-07T12:00:00.000Z'),'covered');
  assert.equal(store.operations.sources('env-a','2026-11-07T12:02:00.000Z').find(x=>x.sourceId==='logs-lab')?.coverage.log,'stale');
});

test('observação redige segredo antes de persistir e pagina sem misturar ambiente',t=>{
  const {store}=setup(t);
  store.operations.record(observation());
  store.operations.record(observation({observationId:'obs-2',fields:{message:'token=second-secret'},receivedAt:'2026-11-07T12:00:01.000Z',observedAt:'2026-11-07T12:00:01.000Z'}));
  const page=store.operations.query({environmentId:'env-a',category:'log',limit:1});
  assert.equal(page.items.length,1);
  assert.equal(page.nextCursor!==null,true);
  assert.equal(page.items[0]?.fields.api_token,'[REDACTED]');
  assert.equal(page.items[0]?.fields.message,'Authorization: Bearer [REDACTED] {"password":"[REDACTED]"}');
  assert.equal(page.items[0]?.evidenceRef,'file://logs/app.log');
  assert.throws(()=>store.operations.query({environmentId:'env-b',category:'log',sourceId:'logs-lab'}),/fora do ambiente/);
  const second=store.operations.query({environmentId:'env-a',category:'log',cursor:page.nextCursor!,limit:5});
  assert.equal(second.items[0]?.observationId,'obs-2');
});

test('correlação de rastros usa IDs explícitos e não proximidade temporal',t=>{
  const {store}=setup(t);
  const traceA=observation({category:'trace',observationId:'trace-1',correlation:{traceId:'0123456789abcdef0123456789abcdef',spanId:'0123456789abcdef'}});
  const traceB=observation({category:'trace',observationId:'trace-2',observedAt:'2026-11-07T12:00:00.100Z',receivedAt:'2026-11-07T12:00:00.100Z',correlation:{traceId:'ffffffffffffffffffffffffffffffff'}});
  store.operations.record(traceA); store.operations.record(traceB);
  const matches=store.operations.query({environmentId:'env-a',category:'trace',traceId:'0123456789abcdef0123456789abcdef'});
  assert.deepEqual(matches.items.map(x=>x.observationId),['trace-1']);
  assert.deepEqual(store.operations.query({environmentId:'env-a',category:'trace',spanId:'0123456789abcdef'}).items.map(x=>x.observationId),['trace-1']);
});

test('retenção por fonte remove observações vencidas sem promover coleta antiga a atual',t=>{
  const {store,source}=setup(t);
  store.operations.registerSource({...source,retentionDays:1});
  const old=new Date(Date.now()-2*86_400_000).toISOString();
  store.operations.record(observation({observationId:'expired-log',observedAt:old,receivedAt:old}));
  assert.equal(store.operations.query({environmentId:'env-a',category:'log'}).items.length,0);
  assert.equal(store.operations.coverage('env-a','log'),'stale');
});

test('incidente versionado abre, reconhece, não resolve com perda de fonte e só encerra por decisão explícita',t=>{
  const {store}=setup(t);
  store.operations.registerRule({ruleId:'latency-high',version:1,category:'network',field:'latencyMs',operator:'gte',expectedValue:500,severity:'high',enabled:true});
  assert.throws(()=>store.operations.registerRule({ruleId:'latency-high',version:1,category:'network',field:'latencyMs',operator:'gte',expectedValue:900,severity:'high',enabled:true}),/imutável/);
  store.operations.record(observation({category:'network',observationId:'net-normal',fields:{latencyMs:200}}));
  assert.equal(store.operations.incidents('env-a').length,0);
  const signal=observation({category:'network',observationId:'net-1',fields:{latencyMs:900}});
  store.operations.record(signal);
  let incidents=store.operations.incidents('env-a');
  assert.equal(incidents.length,1); assert.equal(incidents[0]?.status,'open'); assert.equal(incidents[0]?.rule_version,1);
  const id=String(incidents[0]?.incident_id);
  store.operations.acknowledge(id,'operator-1','2026-11-07T12:01:00.000Z');
  store.operations.setSourceStatus('logs-lab','unavailable');
  incidents=store.operations.incidents('env-a');
  assert.equal(incidents[0]?.status,'acknowledged');
  assert.throws(()=>store.operations.record(observation({...signal,observationId:'while-unavailable',receivedAt:'2026-11-07T12:01:30.000Z',observedAt:'2026-11-07T12:01:30.000Z'})),/sem permissão/);
  assert.equal(store.operations.incidents('env-a')[0]?.status,'acknowledged');
  store.operations.resolve(id,'operator-1','Verificado no laboratório','2026-11-07T12:02:00.000Z');
  store.operations.setSourceStatus('logs-lab','active');
  store.operations.record(observation({...signal,observationId:'net-2',receivedAt:'2026-11-07T12:03:00.000Z',observedAt:'2026-11-07T12:03:00.000Z'}));
  incidents=store.operations.incidents('env-a');
  assert.equal(incidents[0]?.status,'open');
  assert.equal((incidents[0]?.events as unknown[]).length,4);
});

test('API exige leitura, ambiente explícito e credencial separada para transição de incidente',async t=>{
  const {store}=setup(t);
  store.operations.registerRule({ruleId:'security-match',version:1,category:'security_detection',field:'signature',operator:'eq',expectedValue:'fixture-alert',severity:'medium',enabled:true});
  store.operations.record(observation({category:'security_detection',observationId:'sec-1',fields:{signature:'fixture-alert'}}));
  const readToken=randomBytes(32).toString('hex'),commandToken=randomBytes(32).toString('hex');
  const started=await startReadOnlyServer(store,readToken,0,{token:commandToken,actor:{actorId:'operator-1',projectIds:['project-a']}});
  t.after(()=>new Promise<void>(resolve=>started.server.close(()=>resolve())));
  const read={Authorization:`Bearer ${readToken}`},command={Authorization:`Bearer ${commandToken}`};
  assert.equal((await fetch(`${started.url}/v1/logs`,{headers:read})).status,400);
  const sources=await fetch(`${started.url}/v1/operations/sources?environmentId=env-a`,{headers:read});
  assert.equal(sources.status,200);
  const coverageBody=await sources.json() as {coverage:Record<string,string>};
  assert.equal(coverageBody.coverage.trace,'no_data');
  assert.equal(coverageBody.coverage.security_report,'no_permission');
  const absent=await fetch(`${started.url}/v1/operations/sources?environmentId=missing`,{headers:read});
  assert.equal((await absent.json() as {coverage:Record<string,string>}).coverage.log,'absent');
  assert.equal((await fetch(`${started.url}/v1/logs?environmentId=env-a&environmentId=env-b`,{headers:read})).status,400);
  const incidentResponse=await fetch(`${started.url}/v1/operations/incidents?environmentId=env-a`,{headers:read});
  const incidentText=await incidentResponse.text();
  assert.equal(incidentResponse.status,200,incidentText);
  const data=JSON.parse(incidentText) as {incidents:Array<{incident_id:string}>};
  const id=data.incidents[0]!.incident_id;
  assert.equal((await fetch(`${started.url}/v1/operations/incidents/${id}/acknowledge`,{method:'POST',headers:{...read,'Content-Length':'2'},body:'{}'})).status,403);
  assert.equal((await fetch(`${started.url}/v1/operations/incidents/${id}/acknowledge`,{method:'POST',headers:{...command,'Content-Length':'2'},body:'{}'})).status,200);
  assert.equal((await fetch(`${started.url}/v1/traces?environmentId=env-a&traceId=0123456789abcdef0123456789abcdef`,{headers:command})).status,403);
});

test('sonda HTTP M2 alimenta apenas sinais de rede M5 autorizados e perda preserva incidente',t=>{
  const {store}=setup(t);
  const sink=createHttpNetworkSink(store.operations,new Map([['api-a',{environmentId:'env-a'}]]),5000,14);
  store.operations.registerRule({ruleId:'latency-high',version:1,category:'network',field:'latencyMs',operator:'gte',expectedValue:500,severity:'high',enabled:true});
  sink.record({resourceId:'api-a',sourceId:'probe-api',sourceVersion:'http-get-1',health:'degradado',observedAt:'2026-11-07T12:00:00.000Z',evidenceRef:'http-status-503',indicator:'latency',value:900,unit:'ms'},'2026-11-07T12:00:00.100Z');
  assert.equal(store.operations.coverage('env-a','network','2026-11-07T12:00:00.100Z'),'covered');
  assert.match(String(store.operations.incidents('env-a')[0]?.source_id),/^m5n-[a-f0-9]{24}$/);
  sink.unavailable('api-a');
  assert.equal(store.operations.coverage('env-a','network'),'unavailable');
  assert.equal(store.operations.incidents('env-a')[0]?.status,'open');
});

test('coletor Docker persiste API redigida, correlaciona ID explícito e marca contêiner parado indisponível',async t=>{
  const {store}=setup(t);
  const collector=createDockerLogsCollector(store.operations,{composeProject:'contaia',composeWorkingDir:'C:\\Desenv\\Projetos\\rrb-contaia\\infra\\docker',environmentId:'env-a',resourceId:'api-a',retentionDays:1,initialLookbackMinutes:4320},
    {url:'http://127.0.0.1:34567/v1/logs',token:'t'.repeat(64)},async()=>new Response(JSON.stringify({version:1,observedAt:'2026-11-08T12:00:00.000Z',service:'api',containerName:'contaia-api',containerState:'exited',entries:[
      {observedAt:'2026-11-06T19:41:58.676Z',stream:'stdout',message:'falha CPF 123.456.789-09 email cliente@example.com tenantId=tenant-42 [corr-abc]',requestId:'corr-abc'}
    ]}),{status:200,headers:{'Content-Type':'application/json'}}),()=>new Date('2026-11-08T12:00:00.000Z'));
  const result=await collector.collectOnce();
  assert.deepEqual(result,{recorded:1,state:'unavailable',truncated:false});
  const logs=store.operations.query({environmentId:'env-a',category:'log'}).items;
  assert.equal(logs.length,1);
  assert.equal(logs[0]?.correlation?.requestId,'corr-abc');
  assert.equal(logs[0]?.fields.message,'falha CPF [CPF REDIGIDO] email [EMAIL REDIGIDO] tenantId=[REDACTED] [corr-abc]');
  assert.equal(store.operations.coverage('env-a','log'),'unavailable');
});
