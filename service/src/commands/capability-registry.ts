import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { actions, type ActiveRequest, type CapabilityProof, type CommandAction, type CommandTarget } from './types.ts';

const schema = JSON.parse(readFileSync(new URL('../../../contracts/schemas/capability.v1.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({strict:true}).compile(schema);

/** Somente integrações confiáveis alimentam provas/pedidos. Não há rota de cadastro HTTP. */
export class CapabilityRegistry {
  private proofs = new Map<string, {proof:CapabilityProof; generation:string}>();
  private requests = new Map<string, ActiveRequest>();
  private key(sessionKey:string,action:string):string { return JSON.stringify([sessionKey,action]); }
  prove(proof:CapabilityProof):void {
    if(!validate(proof) || !Number.isFinite(Date.parse(proof.provenAt)) || !Number.isFinite(Date.parse(proof.validUntil)) ||
      Date.parse(proof.validUntil)<=Date.parse(proof.provenAt)) throw new Error('Prova de capacidade inválida');
    this.proofs.set(this.key(proof.sessionKey,proof.action),{proof:structuredClone(proof),generation:randomUUID()});
  }
  revoke(sessionKey:string,action:CommandAction):void {this.proofs.delete(this.key(sessionKey,action));}
  get(target:CommandTarget,action:CommandAction,adapterVersion:string,now:number) {
    const entry=this.proofs.get(this.key(target.sessionKey,action));
    if(!entry || !target.active || entry.proof.projectId!==target.projectId || entry.proof.provider!==target.provider ||
      entry.proof.providerVersion!==target.providerVersion || entry.proof.adapterVersion!==adapterVersion ||
      Date.parse(entry.proof.provenAt)>now || Date.parse(entry.proof.validUntil)<=now) return null;
    return structuredClone(entry);
  }
  observeRequest(request:ActiveRequest):void {
    if(!request.requestId || !request.sessionKey || !request.projectId || !['answer_question','decide_permission'].includes(request.action) ||
      !request.originalContext?.trim() || request.originalContext.length>8000 || !request.consequence?.trim() || request.consequence.length>2000 ||
      !request.sourceRef?.trim() || request.sourceRef.length>500 || !Number.isFinite(Date.parse(request.deadlineAt))) throw new Error('Pedido ativo inválido');
    this.requests.set(this.key(request.sessionKey,request.requestId),structuredClone(request));
  }
  request(sessionKey:string,requestId:string):ActiveRequest|null {const value=this.requests.get(this.key(sessionKey,requestId));return value?structuredClone(value):null;}
  revokeRequest(sessionKey:string,requestId:string):void {this.requests.delete(this.key(sessionKey,requestId));}
  list(target:CommandTarget,adapterVersion:string,enabled:readonly CommandAction[],now:number) {
    return actions.map(action=>{const entry=enabled.includes(action)?this.get(target,action,adapterVersion,now):null;
      return {action,available:!!entry,reason:entry?'proven':'capability_unavailable',proof:entry?.proof??null};});
  }
  activeRequests(sessionKey:string,now:number):ActiveRequest[] {
    return [...this.requests.values()].filter(x=>x.sessionKey===sessionKey && Date.parse(x.deadlineAt)>now).map(x=>structuredClone(x));
  }
}
