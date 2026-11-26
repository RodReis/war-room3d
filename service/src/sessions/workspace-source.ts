import { readdirSync } from 'node:fs';
import path from 'node:path';
import { EventStore, type NormalizedEvent } from '../store/event-store.ts';
import { hash, readLease, validateLease, type WorkspaceConfig, type WorkspaceSource } from '../../../integrations/vscode-workspaces/model.cjs';
export { parseWorkspaceConfig, readWorkspaceConfig } from '../../../integrations/vscode-workspaces/model.cjs';
export type { WorkspaceSource };

// Fonte exclusivamente de presença de workspace. Não adapta sessões nem conversa.
export class WorkspaceFileCollector {
  private readonly store:EventStore;
  private readonly config:WorkspaceConfig;
  constructor(store:EventStore, config:WorkspaceConfig) {this.store=store;this.config=config;}

  poll(now=Date.now()):void {
    for(const source of this.config.sources) {
      if(!this.store.isWorkspaceSourceAuthorized(source)) continue;
      let fresh=false, errorCode='stale';
      try {
        const files=readdirSync(source.directory,{withFileTypes:true}).filter(file=>file.isFile() && /^[a-f0-9]{64}\.json$/.test(file.name));
        if(files.length>256) throw new Error('Limite de janelas excedido');
        for(const file of files) {
          try {
            const key=file.name.slice(0,-5), record=readLease(path.join(source.directory,file.name));
            if(!validateLease(record,this.config,source,key,now)) {errorCode='invalid_scope';continue;}
            const fileKey='workspace-'+key;
            if((this.store.getCursor(source.sourceId,fileKey)?.offset ?? 0)>=record.sequence) {
              fresh ||= now-record.sequence<=source.staleAfterMs;
              continue;
            }
            const event:NormalizedEvent={schemaVersion:'1.0',eventId:'e-'+hash(source.sourceId+JSON.stringify(record)),
              sourceEventId:'lease-'+hash(JSON.stringify(record)),sourceId:source.sourceId,sourceVersion:source.sourceVersion,
              projectId:source.projectId,type:'workspace.'+record.state,observedAt:record.observedAt,receivedAt:new Date(now).toISOString(),
              provenance:'observed',ingestionMode:'live',payload:{workspaceKey:'window-'+key},evidenceRefs:[]};
            const result=this.store.apply(event,{sourceId:source.sourceId,fileKey,generation:0,offset:record.sequence});
            if(!result.applied && result.reason!=='duplicate') throw new Error('Registro fora do escopo');
            fresh ||= now-record.sequence<=source.staleAfterMs;
          } catch {errorCode='invalid_scope';}
        }
      } catch(error) {errorCode=(error as {code?:string}).code==='ENOENT'?'file_missing':'read_error';}
      for(const row of this.store.workspacePresence(source.sourceId))
        if(row.status==='open' && now-Date.parse(row.observedAt)>source.staleAfterMs)
          this.status(source,'workspace.unavailable',now,{workspaceKey:row.workspaceKey,reason:'source_lost',errorCode:'stale'});
      if(!fresh && !(this.store.snapshot().sources as {sourceId:string;status:string;errorCode?:string}[])
        .some(row=>row.sourceId===source.sourceId && row.status==='indisponivel' && row.errorCode===errorCode))
        this.status(source,'source.unavailable',now,{reason:'source_lost',errorCode});
    }
  }

  private status(source:WorkspaceSource,type:string,now:number,payload:NormalizedEvent['payload']):void {
    const fileKey='workspace-status',previous=this.store.getCursor(source.sourceId,fileKey),offset=(previous?.offset ?? 0)+1;
    this.store.apply({schemaVersion:'1.0',eventId:'e-'+hash(`${source.sourceId}:${fileKey}:${offset}`),sourceEventId:`workspace-status-${offset}`,
      sourceId:source.sourceId,sourceVersion:source.sourceVersion,projectId:source.projectId,type,observedAt:new Date(now).toISOString(),
      receivedAt:new Date(now).toISOString(),provenance:'observed',ingestionMode:'live',payload,evidenceRefs:[]},
      {sourceId:source.sourceId,fileKey,generation:0,offset});
  }
}
