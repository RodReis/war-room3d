// Executar apenas após autorização específica para criar o contêiner descartável.
// O contêiner não expõe porta, rede, volume ou dado pessoal. O proxy usa GET no Engine.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventStore } from '../src/store/event-store.ts';
import { dockerEngineReader, startDockerSnapshotProxy } from '../src/infra/connectors/docker-proxy.ts';
import { createDockerLogsCollector } from '../src/operations/operation-collector.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const player=process.env.WR3D_34_PLAYER,proofDirectory=process.env.WR3D_34_PROOF_DIR;
if(!player||!proofDirectory||!existsSync(player))throw new Error('Informe Player e diretório de prova do laboratório Docker #34');
const proofPath=proofDirectory;
const directory=mkdtempSync(path.join(os.tmpdir(),'wr3d-34-docker-'));
const composeProject='wr3d34'+randomBytes(4).toString('hex');
const composeFile=path.join(directory,'compose.yml');
const projectId='lab-34-docker',environmentId='env-34-docker',resourceId='api-34-docker';
writeFileSync(composeFile,`services:\n  api:\n    image: node:24-alpine\n    network_mode: "none"\n    read_only: true\n    command: ["node", "-e", "console.log('WR3D34_DOCKER_SOURCE requestId=req-34-docker token=synthetic-secret'); setInterval(() => {}, 1000)"]\n`);
const args=['compose','-p',composeProject,'-f',composeFile];
const docker=(more:string[],timeout=20000)=>execFileSync('docker',[...args,...more],{cwd:directory,encoding:'utf8',timeout,windowsHide:true});
let up=false,store:EventStore|null=null,proxy:Awaited<ReturnType<typeof startDockerSnapshotProxy>>|null=null;
let api:Awaited<ReturnType<typeof startReadOnlyServer>>|null=null;
try{
  execFileSync('docker',['image','inspect','node:24-alpine'],{stdio:'ignore',timeout:10000,windowsHide:true});
  up=true;docker(['up','-d','--no-build','--pull','never'],30000);
  const containerId=docker(['ps','-q','api']).trim();
  if(!/^[a-f0-9]{12,64}$/.test(containerId))throw new Error('Contêiner do laboratório não identificado');
  const inspected=JSON.parse(execFileSync('docker',['inspect',containerId],{encoding:'utf8',timeout:10000,windowsHide:true}))[0];
  const labels=inspected?.Config?.Labels;
  const actualDir=labels?.['com.docker.compose.project.working_dir'];
  if(labels?.['com.docker.compose.project']!==composeProject||labels?.['com.docker.compose.service']!=='api'||
      typeof actualDir!=='string'||path.resolve(actualDir).toLowerCase()!==path.resolve(directory).toLowerCase()||
      inspected?.HostConfig?.NetworkMode!=='none'||inspected?.HostConfig?.ReadonlyRootfs!==true||
      !Array.isArray(inspected?.Mounts)||inspected.Mounts.length!==0||!inspected?.State?.Running||
      Object.values(inspected?.NetworkSettings?.Ports??{}).some(value=>value!==null))
    throw new Error('Contêiner fora do escopo sem rede, volume e escrita solicitado');
  store=new EventStore(path.join(directory,'state.sqlite'));
  store.registerProject({projectId,name:'LAB #34 · DOCKER DESCARTÁVEL',canonicalPath:directory});
  store.infrastructure.replaceInventory({schemaVersion:'1.0',environments:[{environmentId,name:'Docker local descartável'}],
    resources:[{resourceId,environmentId,kind:'api',name:'API de laboratório',sourceId:'probe-34-docker',staleAfterMs:600000}],
    projectResources:[{projectId,resourceId,origin:'configured',confidence:'confirmed'}],dependencies:[]});
  const proxyToken=randomBytes(32).toString('hex'),readToken=randomBytes(32).toString('hex');
  proxy=await startDockerSnapshotProxy(dockerEngineReader(),{composeProject,composeWorkingDir:actualDir},proxyToken,0,true);
  const collector=createDockerLogsCollector(store.operations,{composeProject,composeWorkingDir:actualDir,environmentId,resourceId,
    retentionDays:1,initialLookbackMinutes:5},{url:proxy.url.replace('/v1/snapshot','/v1/logs'),token:proxyToken});
  const collected=await collector.collectOnce();
  if(collected.recorded<1||collected.state!=='running')throw new Error('Fonte Docker não entregou log novo');
  const page=store.operations.query({environmentId,projectId,category:'log',requestId:'req-34-docker'});
  if(page.items.length!==1||page.items[0]?.fields.message!=='WR3D34_DOCKER_SOURCE requestId=req-34-docker token=[REDACTED]'||
      page.coverage!=='covered')throw new Error('Redação, correlação ou cobertura do log Docker não comprovada');
  api=await startReadOnlyServer(store,readToken,0);
  mkdirSync(proofPath,{recursive:true});
  const child=spawn(player,['-screen-width','1280','-screen-height','720','-screen-fullscreen','0','-logFile',path.join(directory,'player.log')],{
    env:{...process.env,WR3D_SERVICE_URL:api.url,WR3D_SERVICE_TOKEN:readToken,WR3D_COMMAND_TOKEN:'',
      WR3D_34_PROOF_DIR:proofPath,WR3D_34_PROOF_MODE:'docker',WR3D_34_EXPECTED_PROJECT:projectId},windowsHide:false,stdio:'ignore'});
  const exit=await new Promise<number>((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('Player excedeu 60 s'))},60000);
    child.once('error',error=>{clearTimeout(timer);reject(error)});
    child.once('exit',code=>{clearTimeout(timer);resolve(code??1)});
  });
  const proofFile=path.join(proofPath,'issue-34-docker-result.json');
  if(exit!==0||!existsSync(proofFile)||JSON.parse(readFileSync(proofFile,'utf8')).status!=='pass')
    throw new Error('Player não confirmou a fonte Docker real');
  writeFileSync(path.join(proofPath,'issue-34-docker-receipt.json'),JSON.stringify({status:'pass',source:'docker-engine-local',
    composeProject,projectId,environmentId,resourceId,sourceId:collector.sourceId,recorded:collected.recorded,
    requestId:'req-34-docker',coverage:page.coverage,playerExit:exit,content:'synthetic',ports:0,volumes:0,network:'none'}));
  process.stdout.write(JSON.stringify({status:'pass',source:'docker-engine-local',recorded:collected.recorded,
    playerExit:exit,proofDirectory:proofPath})+'\n');
}finally{
  if(api){api.server.closeAllConnections();await new Promise<void>(resolve=>api!.server.close(()=>resolve()));}
  if(proxy){proxy.server.closeAllConnections();await new Promise<void>(resolve=>proxy!.server.close(()=>resolve()));}
  store?.close();
  let removed=false;
  try{if(up)docker(['down','--timeout','5'],30000);removed=true;}
  finally{
    if(removed){
      const resolved=path.resolve(directory),temporary=path.resolve(os.tmpdir())+path.sep;
      if(!resolved.startsWith(temporary))throw new Error('Diretório temporário fora do alvo');
      rmSync(resolved,{recursive:true,force:true});
    }
  }
}
