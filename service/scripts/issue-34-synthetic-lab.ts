// Laboratório do Player: somente observações sintéticas e serviço local efêmero.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventStore, type NormalizedEvent } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import type { Observation } from '../src/operations/operations-store.ts';

const player=process.env.WR3D_34_PLAYER;
const proofDirectory=process.env.WR3D_34_PROOF_DIR;
if(!player||!proofDirectory||!existsSync(player))throw new Error('Informe Player e diretório de prova do laboratório #34');
const proofPath=proofDirectory;
const directory=mkdtempSync(path.join(os.tmpdir(),'wr3d-34-synthetic-'));
const store=new EventStore(path.join(directory,'state.sqlite'));
const token=randomBytes(32).toString('hex');
const projectId='lab-34',environmentId='env-34',resourceId='api-34',sourceId='lab-34-logs';
store.registerProject({projectId,name:'LAB #34 · SINTÉTICO',canonicalPath:directory});
store.infrastructure.replaceInventory({schemaVersion:'1.0',environments:[{environmentId,name:'Laboratório sintético'}],
  resources:[{resourceId,environmentId,kind:'api',name:'API sintética',sourceId:'probe-34',staleAfterMs:600000}],
  projectResources:[{projectId,resourceId,origin:'configured',confidence:'confirmed'}],dependencies:[]});
store.operations.registerSource({sourceId,sourceVersion:'1',environmentId,enabled:true,permissions:['log'],staleAfterMs:600000,retentionDays:1});
const now=Date.now();
for(let i=1;i<=13;i++){
  const instant=new Date(now-(14-i)*1000).toISOString();
  const item:Observation={schemaVersion:'1.0',observationId:`log-${String(i).padStart(2,'0')}`,sourceId,sourceVersion:'1',
    environmentId,resourceId,observedAt:instant,receivedAt:instant,category:'log',classification:'synthetic_api_log',
    confidence:'observed',evidenceRef:`fixture://34/log-${i}`,coverage:'covered',
    fields:{severity:i===13?'high':'info',message:i===13?'LAB #34 SINTÉTICO · '+ 'linha longa '.repeat(350)+' token=synthetic-canary':
      `LAB #34 SINTÉTICO · linha ${String(i).padStart(2,'0')} · token=synthetic-canary`},
    ...(i===13?{correlation:{requestId:'req-34-lab'}}:{})};
  store.operations.record(item);
}
const seed=JSON.parse(readFileSync(new URL('../../contracts/fixtures/m1/session-observed.v1.json',import.meta.url),'utf8')) as NormalizedEvent;
for(let i=1;i<=13;i++){
  const instant=new Date(now-(14-i)*1000).toISOString();
  const event:NormalizedEvent={...seed,eventId:`event-34-${i}`,sourceId:'lab-34-session',sourceEventId:`record-${i}`,
    type:i===2?'agent.observed':'session.observed',
    projectId,sessionKey:'session-34',agentKey:'agent-34',observedAt:instant,receivedAt:instant,
    evidenceRefs:[`evidence-34-${i}`]};
  store.applyBatch([event],{sourceId:event.sourceId,fileKey:'fixture',generation:1,offset:i});
}
const {server,url}=await startReadOnlyServer(store,token,0);
mkdirSync(proofPath,{recursive:true});
const child=spawn(player,['-screen-width','1280','-screen-height','720','-screen-fullscreen','0','-logFile',path.join(directory,'player.log')],{
  env:{...process.env,WR3D_SERVICE_URL:url,WR3D_SERVICE_TOKEN:token,WR3D_34_PROOF_DIR:proofPath,
    WR3D_34_LAB_CONTROL:directory,WR3D_COMMAND_TOKEN:''},windowsHide:false,stdio:'ignore'});
let closed=false;
const timer=setInterval(()=>{
  if(existsSync(path.join(directory,'source-unavailable'))){
    rmSync(path.join(directory,'source-unavailable'));store.operations.setSourceStatus(sourceId,'unavailable');
    writeFileSync(path.join(directory,'source-unavailable-done'),'1');
  }
},100);
async function finish(code:number){
  if(closed)return;closed=true;clearInterval(timer);server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();
  const resultPath=path.join(proofPath,'issue-34-result.json');
  process.stdout.write(JSON.stringify({status:existsSync(resultPath)?JSON.parse(readFileSync(resultPath,'utf8')).status:'missing',
    playerExit:code,synthetic:true,proofDirectory})+'\n');
  const resolved=path.resolve(directory),temporary=path.resolve(os.tmpdir())+path.sep;
  if(!resolved.startsWith(temporary))throw new Error('Diretório temporário fora do alvo');
  rmSync(resolved,{recursive:true,force:true});
}
child.once('exit',code=>void finish(code??1));child.once('error',()=>void finish(1));
