import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { CommandError, type CommandIntent, type CommandState, type CapabilityProof } from './types.ts';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function fingerprint(input:CommandIntent):string {
  return hash(JSON.stringify([input.commandId,input.idempotencyKey,input.mode,input.projectId,input.sessionKey,input.provider,
    input.providerVersion,input.action,input.requestId,input.deadlineAt,input.payload.text??null,input.payload.decision??null]));
}
export interface CommandRecord {
  commandId:string; actorId:string; projectId:string; sessionKey:string; provider:string; providerVersion:string; action:string; requestId:string|null;
  deadlineAt:string; payloadRef:string; adapterVersion:string; state:CommandState; reason:string; updatedAt:string;
  audit:{state:CommandState;reason:string;at:string}[];
  capabilityProof?:CapabilityProof;
}
type Stored={command_id:string;idempotency_key:string;actor_id:string;fingerprint:string;metadata_json:string;state:CommandState;reason:string;updated_at:string};

export class CommandAudit {
  private readonly db:Database.Database;
  constructor(db:Database.Database){this.db=db;}
  get(commandId:string):CommandRecord|null {
    const row=this.db.prepare('SELECT * FROM commands WHERE command_id=?').get(commandId) as Stored|undefined;
    if(!row)return null;
    const audit=this.db.prepare('SELECT state,reason,at FROM command_audit WHERE command_id=? ORDER BY sequence').all(commandId) as CommandRecord['audit'];
    return {...JSON.parse(row.metadata_json),actorId:row.actor_id,state:row.state,reason:row.reason,updatedAt:row.updated_at,audit};
  }
  existing(input:CommandIntent,actorId:string):CommandRecord|null {
    const row=this.db.prepare('SELECT * FROM commands WHERE idempotency_key=? OR command_id=?').get(input.idempotencyKey,input.commandId) as Stored|undefined;
    if(!row)return null;
    if(row.idempotency_key!==input.idempotencyKey || row.fingerprint!==fingerprint(input) || row.actor_id!==actorId)throw new CommandError('idempotency_conflict');
    return this.get(row.command_id);
  }
  reserve(input:CommandIntent,actorId:string,adapterVersion:string,now:number,proof?:CapabilityProof):{record:CommandRecord;created:boolean} {
    return this.db.transaction(()=>{
      const prior=this.existing(input,actorId);if(prior)return {record:prior,created:false};
      const metadata={commandId:input.commandId,projectId:input.projectId,sessionKey:input.sessionKey,provider:input.provider,
        providerVersion:input.providerVersion,action:input.action,requestId:input.requestId,deadlineAt:input.deadlineAt,
        payloadRef:`sha256:${hash(JSON.stringify(input.payload))}`,adapterVersion,...(proof?{capabilityProof:proof}:{})};
      const at=new Date(now).toISOString();
      this.db.prepare("INSERT INTO commands VALUES (?,?,?,?,?,'requested','requested',?)")
        .run(input.commandId,input.idempotencyKey,fingerprint(input),actorId,JSON.stringify(metadata),at);
      this.db.prepare("INSERT INTO command_audit(command_id,state,reason,at) VALUES (?,'requested','requested',?)").run(input.commandId,at);
      return {record:this.get(input.commandId)!,created:true};
    }).immediate();
  }
  requestClaimed(sessionKey:string,requestId:string,exceptCommandId?:string):boolean {
    const row=this.db.prepare('SELECT command_id FROM command_request_claims WHERE session_key=? AND request_id=?').get(sessionKey,requestId) as {command_id:string}|undefined;
    return !!row && row.command_id!==exceptCommandId;
  }
  transition(commandId:string,state:CommandState,reason:string,now:number):CommandRecord {
    return this.db.transaction(()=>{
      const prior=this.get(commandId);if(!prior)throw new Error('Comando ausente');
      const allowed:Partial<Record<CommandState,CommandState[]>>={requested:['validated','rejected','expired'],validated:['sending','rejected','expired'],sending:['confirmed','rejected','expired','unknown']};
      if(!allowed[prior.state]?.includes(state))throw new Error('Transição inválida');
      if(state==='sending' && prior.requestId){
        if(this.requestClaimed(prior.sessionKey,prior.requestId))throw new CommandError('request_unavailable');
        this.db.prepare('INSERT INTO command_request_claims VALUES (?,?,?)').run(prior.sessionKey,prior.requestId,commandId);
      }
      const at=new Date(now).toISOString();
      this.db.prepare('UPDATE commands SET state=?,reason=?,updated_at=? WHERE command_id=?').run(state,reason,at,commandId);
      this.db.prepare('INSERT INTO command_audit(command_id,state,reason,at) VALUES (?,?,?,?)').run(commandId,state,reason,at);
      return this.get(commandId)!;
    }).immediate();
  }
  /** Chamar uma vez na inicialização do escritor, nunca ao abrir leitores. */
  recover(now=Date.now()):void {
    this.db.transaction(()=>{
      const pending=this.db.prepare("SELECT command_id,state FROM commands WHERE state IN ('requested','validated','sending')").all() as Stored[];
      for(const row of pending)this.transition(row.command_id,row.state==='sending'?'unknown':'rejected','service_restarted',now);
    }).immediate();
  }
}
