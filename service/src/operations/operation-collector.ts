import { createHash, randomUUID } from 'node:crypto';
import type { Reading } from '../infra/health-reducer.ts';
import type { OperationsStore } from './operations-store.ts';

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
