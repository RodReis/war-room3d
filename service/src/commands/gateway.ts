import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { CommandAudit, fingerprint, type CommandRecord } from './audit.ts';
import { CapabilityRegistry } from './capability-registry.ts';
import { CommandError, type CommandActor, type CommandAdapter, type CommandIntent, type CommandTarget } from './types.ts';

const schema=JSON.parse(readFileSync(new URL('../../../contracts/schemas/command.v1.schema.json',import.meta.url),'utf8'));
const validate=new Ajv2020({strict:true,strictRequired:false}).compile(schema);
export interface GatewayOptions {
  audit:CommandAudit;registry:CapabilityRegistry;adapters:readonly CommandAdapter[];
  resolveTarget:(sessionKey:string)=>CommandTarget|null;mode:'live'|'demo'|'replay';now?:()=>number;timeoutMs?:number;
}
type Confirmation={fingerprint:string;actorId:string;generation:string;request:string;expires:number};
export class CommandGateway {
  private readonly options:GatewayOptions;
  private confirmations=new Map<string,Confirmation>();
  constructor(options:GatewayOptions){this.options=options;}
  private now(){return (this.options.now??Date.now)();}
  private parse(input:unknown):CommandIntent {
    if(!validate(input))throw new CommandError('invalid_command',400);
    const intent=structuredClone(input) as CommandIntent;
    if(!Number.isFinite(Date.parse(intent.deadlineAt)) || new Date(intent.deadlineAt).toISOString()!==intent.deadlineAt)throw new CommandError('invalid_deadline',400);
    return intent;
  }
  private authorize(input:CommandIntent,actor:CommandActor) {
    if(this.options.mode!=='live' || input.mode!=='live')throw new CommandError('mode_forbidden',403);
    if(!actor.actorId || !actor.projectIds.includes(input.projectId))throw new CommandError('project_forbidden',403);
  }
  private check(input:CommandIntent,actor:CommandActor,ownClaim=false) {
    this.authorize(input,actor);
    const now=this.now();
    if(Date.parse(input.deadlineAt)<=now)throw new CommandError('deadline_expired');
    const target=this.options.resolveTarget(input.sessionKey);
    if(!target?.active || target.sessionKey!==input.sessionKey || target.projectId!==input.projectId ||
      target.provider!==input.provider || target.providerVersion!==input.providerVersion)throw new CommandError('target_unavailable');
    const adapter=this.options.adapters.find(x=>x.provider===input.provider && x.actions.includes(input.action));
    const proof=adapter?this.options.registry.get(target,input.action,adapter.version,now):null;
    if(!adapter || !proof)throw new CommandError('capability_unavailable');
    const request=input.requestId?this.options.registry.request(input.sessionKey,input.requestId):null;
    if(input.action!=='send_message' && (!request || request.projectId!==input.projectId || request.action!==input.action ||
      Date.parse(request.deadlineAt)<=now || Date.parse(input.deadlineAt)>Date.parse(request.deadlineAt) ||
      this.options.audit.requestClaimed(input.sessionKey,input.requestId!,ownClaim?input.commandId:undefined)))throw new CommandError('request_unavailable');
    return {adapter,proof,request};
  }
  capabilities(targets:readonly CommandTarget[]) {
    return {schemaVersion:'1.0',sessions:targets.map(target=>{
      const adapter=this.options.adapters.find(x=>x.provider===target.provider);
      return {...target,capabilities:this.options.registry.list(target,adapter?.version??'',this.options.mode==='live'?adapter?.actions??[]:[],this.now()),
        requests:this.options.registry.activeRequests(target.sessionKey,this.now()).filter(x=>!this.options.audit.requestClaimed(x.sessionKey,x.requestId))};
    })};
  }
  preview(raw:unknown,actor:CommandActor) {
    const input=this.parse(raw);const {proof,request}=this.check(input,actor);const now=this.now();
    for(const [key,value] of this.confirmations)if(value.expires<=now)this.confirmations.delete(key);
    if(this.confirmations.size>=256)throw new CommandError('too_many_previews',429);
    const confirmationId=randomUUID();const expires=Math.min(now+60000,Date.parse(input.deadlineAt),Date.parse(proof.proof.validUntil));
    this.confirmations.set(confirmationId,{fingerprint:fingerprint(input),actorId:actor.actorId,generation:proof.generation,request:JSON.stringify(request),expires});
    return {confirmationId,commandId:input.commandId,projectId:input.projectId,sessionKey:input.sessionKey,provider:input.provider,
      providerVersion:input.providerVersion,action:input.action,requestId:input.requestId,deadlineAt:input.deadlineAt,
      originalContext:request?.originalContext??input.payload.text,consequence:request?.consequence??'Enviar esta mensagem à sessão indicada. A confirmação de recebimento não comprova conclusão da tarefa.',
      sourceRef:request?.sourceRef??proof.proof.evidenceRef,decision:input.payload.decision??null,expiresAt:new Date(expires).toISOString()};
  }
  get(commandId:string,actor:CommandActor):CommandRecord|null {
    const record=this.options.audit.get(commandId);if(record && !actor.projectIds.includes(record.projectId))throw new CommandError('project_forbidden',403);return record;
  }
  async submit(raw:unknown,actor:CommandActor):Promise<CommandRecord> {
    const input=this.parse(raw);this.authorize(input,actor);
    let existing:CommandRecord|null;
    try {existing=this.options.audit.existing(input,actor.actorId);}catch(error){if(error instanceof CommandError)throw error;throw new CommandError('audit_unavailable',503);}
    if(existing)return existing;
    let reserved=false;
    let checked:ReturnType<CommandGateway['check']>;
    try {
      checked=this.check(input,actor);
      const confirmation=input.confirmationId?this.confirmations.get(input.confirmationId):null;
      if(!confirmation || confirmation.fingerprint!==fingerprint(input) || confirmation.actorId!==actor.actorId || confirmation.expires<=this.now() ||
        confirmation.generation!==checked.proof.generation || confirmation.request!==JSON.stringify(checked.request))throw new CommandError('confirmation_invalid');
      const reservation=this.options.audit.reserve(input,actor.actorId,checked.adapter.version,this.now(),checked.proof.proof);
      if(!reservation.created)return reservation.record;
      reserved=true;
      this.options.audit.transition(input.commandId,'validated','validated',this.now());
      // Nenhum await entre revalidação, reserva persistida e início da emissão.
      checked=this.check(input,actor);
      this.options.audit.transition(input.commandId,'sending','sending',this.now());
      // Uma gravação SQLite pode esperar pelo lock; conferir prazo/alvo/prova após essa espera.
      checked=this.check(input,actor,true);
      if(confirmation.generation!==checked.proof.generation || confirmation.request!==JSON.stringify(checked.request))throw new CommandError('confirmation_invalid');
      this.confirmations.delete(input.confirmationId!);
    } catch(error) {
      const reason=error instanceof CommandError?error.code:'audit_unavailable';
      try {
        if(!reserved){const reservation=this.options.audit.reserve(input,actor.actorId,'unavailable',this.now());if(!reservation.created)return reservation.record;}
        this.options.audit.transition(input.commandId,reason==='deadline_expired'?'expired':'rejected',reason,this.now());
      } catch {throw new CommandError('audit_unavailable',503);}
      throw error instanceof CommandError?error:new CommandError('audit_unavailable',503);
    }
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    let state:'confirmed'|'rejected'|'unknown'='unknown';let reason='delivery_unknown';
    try {
      const result=await Promise.race([
        checked.adapter.send(structuredClone(input),controller.signal),
        new Promise<null>(resolve=>{timer=setTimeout(()=>{resolve(null);controller.abort();},this.options.timeoutMs??10000);})
      ]);
      if(result && result.commandId===input.commandId && result.requestId===input.requestId && ['confirmed','rejected'].includes(result.status)){
        state=result.status;reason=state==='confirmed'?'receipt_confirmed':'provider_rejected';
      }
    } catch { /* Erro após sending não comprova ausência de efeito no provedor. */ }
    finally {if(timer)clearTimeout(timer);}
    try{return this.options.audit.transition(input.commandId,state,reason,this.now());}
    catch{throw new CommandError('audit_unavailable',503);}
  }
}
