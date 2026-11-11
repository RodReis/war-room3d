import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EventStore, type NormalizedEvent } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import type { SessionSource } from '../src/sessions/adapters.ts';

// Laboratório local, somente com identidades e eventos sintéticos.
const output=process.argv[2];
if(!output||!path.isAbsolute(output))throw new Error('Diretório absoluto do laboratório obrigatório');
mkdirSync(output,{recursive:true});
const store=new EventStore(path.join(output,'state.sqlite'));
const projects=[{projectId:'lab-atlas',name:'Plataforma Atlas · sintético',canonicalPath:'C:\\lab\\atlas'},
  {projectId:'lab-orion',name:'Aplicativo Orion · sintético',canonicalPath:'C:\\lab\\orion'}];
const sources:SessionSource[]=projects.map((project,index)=>({
  sourceId:`lab-source-${index}`,sourceVersion:'1',provider:'claude',projectId:project.projectId,
  accountRef:'lab',filePath:`C:\\lab\\${index}.jsonl`}));
store.configureSessionSources(projects,sources);
const now=Date.now(),slot=300000,end=Math.ceil(now/slot)*slot,start=end-12*slot;
let sequence=0;
function apply(source:SessionSource,type:string,at:number,payload:NormalizedEvent['payload']={}):void {
  const number=++sequence;
  const event:NormalizedEvent={schemaVersion:'1.0',eventId:`lab-event-${number}`,sourceEventId:`lab-native-${number}`,
    sourceId:source.sourceId,sourceVersion:source.sourceVersion,type,observedAt:new Date(at).toISOString(),
    receivedAt:new Date(now).toISOString(),projectId:source.projectId,provider:'claude',
    sessionKey:`lab-session-${source.projectId}`,provenance:'observed',ingestionMode:'live',payload,
    evidenceRefs:type==='source.covered'?[`lab-coverage-${source.sourceId}`]:[]};
  const result=store.apply(event,{sourceId:source.sourceId,fileKey:'synthetic',generation:0,offset:number});
  if(!result.applied)throw new Error(`Evento sintético recusado: ${result.reason}`);
}
for(const source of sources)apply(source,'session.observed',start);
apply(sources[0]!,'tool.observed',end-7*60000,{invocationId:'lab-tool-1',name:'Ferramenta sintética'});
for(const source of sources)apply(source,'source.covered',now,{
  coverageStart:new Date(start).toISOString(),coverageEnd:new Date(end-slot).toISOString()});
const token=randomBytes(32).toString('hex');
const service=await startReadOnlyServer(store,token);
writeFileSync(path.join(output,'service.json'),JSON.stringify({url:service.url,token}),{encoding:'utf8'});
process.stdout.write('LAB_READY\n');
process.on('SIGINT',()=>service.server.close(()=>{store.close();process.exit(0);}));
