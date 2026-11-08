import { createHash, randomUUID } from 'node:crypto';
import type { Reading } from '../infra/health-reducer.ts';
import type { Observation, OperationsStore } from './operations-store.ts';
import type { DockerLogsSnapshot } from '../infra/connectors/docker-proxy.ts';

export interface OperationReadingSink { record(reading:Reading,receivedAt:string):void; unavailable(resourceId:string):void }

export function createHttpNetworkSink(store:OperationsStore,resources:ReadonlyMap<string,{environmentId:string}>,intervalMs:number,retentionDays:number):OperationReadingSink {
  const sourceId=(resourceId:string)=>`m5n-${createHash('sha256').update(resourceId).digest('hex').slice(0,24)}`;
  for (const [resourceId,resource] of resources) store.registerSource({sourceId:sourceId(resourceId),sourceVersion:'http-get-1',environmentId:resource.environmentId,
    enabled:true,permissions:['network'],staleAfterMs:Math.min(Math.max(intervalMs*3,1000),31_536_000_000),retentionDays});
  return {
    record(reading,receivedAt) {
      if (!resources.has(reading.resourceId)) return;
      if (!reading.evidenceRef) throw new Error('Sonda HTTP sem referência de evidência');
      const source=sourceId(reading.resourceId);
      store.setSourceStatus(source,'active');
      store.record({schemaVersion:'1.0',observationId:randomUUID(),sourceId:source,sourceVersion:reading.sourceVersion,environmentId:resources.get(reading.resourceId)!.environmentId,
        resourceId:reading.resourceId,observedAt:reading.observedAt,receivedAt,category:'network',classification:'http_probe',confidence:'observed',coverage:'covered',
        evidenceRef:reading.evidenceRef,fields:{health:reading.health,latencyMs:reading.value??null,unit:reading.unit??null,probeSourceId:reading.sourceId}});
    },
    unavailable(resourceId) { if (resources.has(resourceId)) store.setSourceStatus(sourceId(resourceId),'unavailable'); }
  };
}

export interface DockerLogsCollectorConfig {
  composeProject: string;
  composeWorkingDir: string;
  environmentId: string;
  resourceId: string;
  retentionDays: number;
  initialLookbackMinutes: number;
}

export interface DockerLogsProxyAuth { url: string; token: string }

export function validateDockerLogsProxyAuth(auth:DockerLogsProxyAuth):URL {
  const base=new URL(auth.url);
  if (base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.pathname!=='/v1/logs'||base.search||base.hash||base.username||base.password||Buffer.byteLength(auth.token)<32)
    throw new Error('Proxy de logs Docker deve usar loopback e token válido');
  return base;
}

export function createDockerLogsCollector(store:OperationsStore,config:DockerLogsCollectorConfig,auth:DockerLogsProxyAuth,
  fetcher:typeof fetch=fetch,now:()=>Date=()=>new Date()) {
  const base=validateDockerLogsProxyAuth(auth);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(config.environmentId)||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(config.resourceId)||
      !Number.isSafeInteger(config.retentionDays)||config.retentionDays<1||config.retentionDays>3650||
      !Number.isSafeInteger(config.initialLookbackMinutes)||config.initialLookbackMinutes<1||config.initialLookbackMinutes>10080||
      !config.composeProject||config.composeProject.length>128||!config.composeWorkingDir||config.composeWorkingDir.length>1024)
    throw new Error('Configuração da fonte de logs Docker inválida');
  const sourceId=`docker-${createHash('sha256').update(`${config.composeProject}\0${config.composeWorkingDir}\0api`).digest('hex').slice(0,32)}`;
  const sourceVersion='docker-api-logs-v1';
  store.registerSource({sourceId,sourceVersion,environmentId:config.environmentId,enabled:true,permissions:['log'],staleAfterMs:120_000,retentionDays:config.retentionDays});
  let since=new Date(now().getTime()-config.initialLookbackMinutes*60_000);
  let running=false;
  let scheduled=false;
  let timer:NodeJS.Timeout|null=null;
  let pending:Promise<void>|null=null;

  const collectOnce=async():Promise<{recorded:number;state:'running'|'unavailable'}>=>{
    if (running) throw new Error('Coleta de logs Docker simultânea não permitida');
    running=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),7000);
    try {
      const query=new URLSearchParams({service:'api',since:since.toISOString()});
      const response=await fetcher(`${base.origin}${base.pathname}?${query}`,{method:'GET',headers:{Authorization:`Bearer ${auth.token}`},redirect:'manual',cache:'no-store',signal:controller.signal});
      try {
        if(response.status!==200) throw new Error('Fonte de logs Docker indisponível');
        const snapshot=await response.json() as DockerLogsSnapshot;
        if(snapshot.version!==1||snapshot.service!=='api'||!['created','running','paused','restarting','exited','removing','dead'].includes(snapshot.containerState)||
            typeof snapshot.containerName!=='string'||!Array.isArray(snapshot.entries)||snapshot.entries.length>1000||!Number.isFinite(Date.parse(snapshot.observedAt)))
          throw new Error('Resposta de logs Docker inválida');
        const receivedAt=now().toISOString();
        store.setSourceStatus(sourceId,'active');
        let recorded=0;
        let latest=since;
        for(const entry of snapshot.entries){
          if(!Number.isFinite(Date.parse(entry.observedAt))||Date.parse(entry.observedAt)>Date.parse(receivedAt)||!['stdout','stderr'].includes(entry.stream)||typeof entry.message!=='string'||entry.message.length>4096)
            throw new Error('Linha de log Docker inválida');
          const observationId=`docker-${createHash('sha256').update(`${snapshot.containerName}\0${entry.observedAt}\0${entry.stream}\0${entry.message}`).digest('hex').slice(0,40)}`;
          const observation:Observation={schemaVersion:'1.0',observationId,sourceId,sourceVersion,environmentId:config.environmentId,resourceId:config.resourceId,
            observedAt:entry.observedAt,receivedAt,category:'log',classification:`docker_${entry.stream}`,confidence:'observed',coverage:'covered',evidenceRef:`docker://${snapshot.containerName}/${entry.observedAt}`,
            ...(entry.requestId?{correlation:{requestId:entry.requestId}}:{}),fields:{service:'api',stream:entry.stream,message:entry.message}};
          if(store.record(observation))recorded++;
          if(Date.parse(entry.observedAt)>latest.getTime())latest=new Date(entry.observedAt);
        }
        if(snapshot.containerState!=='running') store.setSourceStatus(sourceId,'unavailable');
        else since=new Date(Math.max(latest.getTime(),Date.parse(snapshot.observedAt))-1000);
        return {recorded,state:snapshot.containerState==='running'?'running':'unavailable'};
      }finally{if(response.body&&!response.bodyUsed)await response.body.cancel();}
    }catch(error){
      store.setSourceStatus(sourceId,'unavailable');
      throw error;
    }finally{clearTimeout(timeout);running=false;}
  };

  return {
    sourceId,
    collectOnce,
    start(intervalMs:number):void{
      if(!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>3600000||scheduled)throw new Error('Agendamento de logs Docker inválido');
      scheduled=true;
      const tick=async():Promise<void>=>{
        try{await collectOnce();}catch{/* Coverage stays unavailable; no incident is inferred from collection failure. */}
        if(scheduled){timer=setTimeout(()=>{pending=tick();},intervalMs);timer.unref();}
      };
      pending=tick();
    },
    async stop():Promise<void>{scheduled=false;if(timer)clearTimeout(timer);timer=null;await pending;pending=null;}
  };
}
