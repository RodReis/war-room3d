import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventStore } from '../../src/store/event-store.ts';
import { CapabilityRegistry } from '../../src/commands/capability-registry.ts';
import { CommandGateway } from '../../src/commands/gateway.ts';
import type { CommandIntent, CommandAdapter, CapabilityProof } from '../../src/commands/types.ts';

const at = Date.parse('2026-11-07T16:00:00Z');
const actor = { actorId: 'operador-lab', projectIds: ['lab'] };
const resultSchema=JSON.parse(readFileSync(new URL('../../../contracts/schemas/command.v1.schema.json',import.meta.url),'utf8')).$defs.result;
const validateResult=new Ajv2020({strict:true}).compile(resultSchema);
const proof: CapabilityProof = { provider: 'codex', providerVersion: 'lab-1', adapterVersion: 'fake-1', projectId: 'lab',
  sessionKey: 'session-lab', action: 'send_message', evidenceRef: 'synthetic:windows-1', provenAt: new Date(at-1000).toISOString(),
  validUntil: new Date(at+60000).toISOString() };
const intent = (changes: Partial<CommandIntent> = {}): CommandIntent => ({ schemaVersion: '1.0', commandId: 'command-1', idempotencyKey: 'key-1',
  mode: 'live', projectId: 'lab', sessionKey: 'session-lab', provider: 'codex', providerVersion: 'lab-1', action: 'send_message',
  requestId: null, deadlineAt: new Date(at+30000).toISOString(), payload: { text: 'mensagem sintética privada' }, confirmationId: null, ...changes });

function setup(t: {after(fn:()=>void):void}, delivery?: CommandAdapter['send']) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wr3d-m4-'));
  const databasePath = path.join(dir, 'state.db');
  const store = new EventStore(databasePath);
  t.after(() => { try {store.close();} catch {} rmSync(dir,{recursive:true,force:true}); });
  let now = at;
  let calls = 0;
  const registry = new CapabilityRegistry();
  const target = {projectId:'lab',sessionKey:'session-lab',provider:'codex' as const,providerVersion:'lab-1',active:true};
  const adapter: CommandAdapter = {provider:'codex',version:'fake-1',actions:['send_message','answer_question','decide_permission'],
    async send(input, signal) { calls++; return delivery ? delivery(input,signal) : {status:'confirmed',commandId:input.commandId,requestId:input.requestId}; }};
  const gateway = new CommandGateway({audit:store.commands,registry,adapters:[adapter],resolveTarget:key=>key===target.sessionKey?target:null,
    now:()=>now,timeoutMs:20,mode:'live'});
  registry.prove(proof);
  function confirm(value = intent()) { return {...value,confirmationId:gateway.preview(value,actor).confirmationId}; }
  return {store,registry,gateway,target,confirm,databasePath,adapter,get calls(){return calls;},setNow(value:number){now=value;}};
}

test('clique duplo concorrente e reinício preservam uma emissão e auditoria redigida',async t=>{
  const lab=setup(t);
  const value=lab.confirm();
  await Promise.all([lab.gateway.submit(value,actor),lab.gateway.submit(value,actor)]);
  assert.equal(lab.calls,1);
  assert.equal(lab.store.commands.get('command-1')?.state,'confirmed');
  assert.equal(validateResult(lab.store.commands.get('command-1')),true,JSON.stringify(validateResult.errors));
  assert.deepEqual(lab.store.commands.get('command-1')?.audit.map(x=>x.state),['requested','validated','sending','confirmed']);
  assert.equal(lab.store.commands.get('command-1')?.capabilityProof?.evidenceRef,'synthetic:windows-1');
  assert.doesNotMatch(JSON.stringify(lab.store.commands.get('command-1')),/mensagem sintética privada/);
  lab.store.close();
  const restarted=new EventStore(lab.databasePath);
  assert.equal(restarted.commands.get('command-1')?.state,'confirmed');
  const gateway=new CommandGateway({audit:restarted.commands,registry:lab.registry,adapters:[lab.adapter],resolveTarget:()=>lab.target,now:()=>at,mode:'live'});
  assert.equal((await gateway.submit(value,actor)).commandId,'command-1');assert.equal(lab.calls,1);
  restarted.close();
});

test('chave reaproveitada com conteúdo ou ator diferente é conflito',async t=>{
  const lab=setup(t);await lab.gateway.submit(lab.confirm(),actor);
  await assert.rejects(lab.gateway.submit({...intent(),confirmationId:'x',payload:{text:'outro conteúdo'}},actor),/idempotency_conflict/);
  await assert.rejects(lab.gateway.submit(lab.confirm(intent({commandId:'c2',idempotencyKey:'k2'})),{...actor,actorId:'outro'}),/confirmation_invalid/);
  assert.equal(lab.calls,1);
});

test('demo, replay, escopo, prazo, alvo encerrado e prova ausente impedem envio',async t=>{
  for(const mode of ['demo','replay'] as const){const lab=setup(t);await assert.rejects(lab.gateway.submit(intent({mode}),actor),/mode_forbidden/);assert.equal(lab.calls,0);}
  const lab=setup(t);
  await assert.rejects(lab.gateway.submit(intent(),{...actor,projectIds:['outro']}),/project_forbidden/);
  await assert.rejects(lab.gateway.submit(intent({deadlineAt:new Date(at).toISOString()}),actor),/deadline_expired/);
  assert.equal(lab.store.commands.get('command-1')?.state,'expired');
  lab.target.active=false;assert.throws(()=>lab.gateway.preview(intent(),actor),/target_unavailable/);
  lab.target.active=true;lab.registry.revoke('session-lab','send_message');assert.throws(()=>lab.gateway.preview(intent(),actor),/capability_unavailable/);
  assert.equal(lab.calls,0);
});

test('revogação, versão trocada e expiração após prévia são revalidadas',async t=>{
  const lab=setup(t);const value=lab.confirm();lab.registry.revoke('session-lab','send_message');
  await assert.rejects(lab.gateway.submit(value,actor),/capability_unavailable/);
  lab.registry.prove(proof);lab.target.providerVersion='lab-2';assert.throws(()=>lab.confirm(),/target_unavailable/);
  lab.target.providerVersion='lab-1';const next=lab.confirm(intent({commandId:'command-2',idempotencyKey:'key-2'}));
  lab.setNow(at+31000);await assert.rejects(lab.gateway.submit(next,actor),/deadline_expired/);assert.equal(lab.calls,0);
});

test('timeout ou resposta sem correlação fica incerto sem retry, mesmo com resposta tardia',async t=>{
  let finish: (value:any)=>void=()=>{};
  const lab=setup(t,()=>new Promise(resolve=>{finish=resolve;}));const value=lab.confirm();
  assert.equal((await lab.gateway.submit(value,actor)).state,'unknown');
  finish({status:'confirmed',commandId:value.commandId,requestId:null});await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await lab.gateway.submit(value,actor)).state,'unknown');assert.equal(lab.calls,1);
  const other=setup(t,async()=>({status:'confirmed',commandId:'outro',requestId:null}));
  assert.equal((await other.gateway.submit(other.confirm(),actor)).state,'unknown');
});

test('negação correlacionada é rejeitada e erro após envio é incerto',async t=>{
  const denied=setup(t,async input=>({status:'rejected',commandId:input.commandId,requestId:null}));
  assert.equal((await denied.gateway.submit(denied.confirm(),actor)).state,'rejected');
  const broken=setup(t,async()=>{throw new Error('segredo-do-provedor');});
  assert.equal((await broken.gateway.submit(broken.confirm(),actor)).state,'unknown');
  assert.doesNotMatch(JSON.stringify(broken.store.commands.get('command-1')),/segredo-do-provedor/);
});

test('pedido de permissão exige contexto original e só pode ter uma tentativa',async t=>{
  const lab=setup(t);lab.registry.prove({...proof,action:'decide_permission'});
  const permission=intent({action:'decide_permission',requestId:'request-1',deadlineAt:new Date(at+10000).toISOString(),payload:{decision:'deny'}});
  assert.throws(()=>lab.confirm(permission),/request_unavailable/);
  lab.registry.observeRequest({requestId:'request-1',sessionKey:'session-lab',projectId:'lab',action:'decide_permission',
    originalContext:'Ferramenta sintética solicita leitura de arquivo de teste',consequence:'Recusar impede a ferramenta solicitada',
    sourceRef:'synthetic:request-1',deadlineAt:new Date(at+10000).toISOString()});
  const value=lab.confirm(permission);assert.equal((await lab.gateway.submit(value,actor)).state,'confirmed');
  const again=permission;again.commandId='command-2';again.idempotencyKey='key-2';
  assert.throws(()=>lab.confirm(again),/request_unavailable/);assert.equal(lab.calls,1);
});

test('auditoria indisponível impede emissão e recuperação não reenvia sending',async t=>{
  const lab=setup(t);const value=lab.confirm();
  const reserve=lab.store.commands.reserve.bind(lab.store.commands);
  lab.store.commands.reserve=()=>{throw new Error('disco cheio');};
  await assert.rejects(lab.gateway.submit(value,actor),/audit_unavailable/);assert.equal(lab.calls,0);
  lab.store.commands.reserve=reserve;
  const pending=lab.store.commands.reserve(value,actor.actorId,'fake-1',at).record;
  lab.store.commands.transition(pending.commandId,'validated','validated',at);
  lab.store.commands.transition(pending.commandId,'sending','sending',at);
  lab.store.commands.recover(at+1000);
  assert.equal(lab.store.commands.get(pending.commandId)?.state,'unknown');
  assert.equal((await lab.gateway.submit(value,actor)).state,'unknown');assert.equal(lab.calls,0);
});

test('prova expirada, prévia adulterada e pedido substituído não autorizam envio',async t=>{
  const lab=setup(t);const value=lab.confirm();
  await assert.rejects(lab.gateway.submit({...value,payload:{text:'texto alterado'}},actor),/confirmation_invalid/);assert.equal(lab.calls,0);
  lab.setNow(at+61000);assert.throws(()=>lab.gateway.preview(intent({deadlineAt:new Date(at+120000).toISOString()}),actor),/capability_unavailable/);
  lab.setNow(at);lab.registry.prove({...proof,action:'answer_question'});
  const request={requestId:'question-1',sessionKey:'session-lab',projectId:'lab',action:'answer_question' as const,originalContext:'Primeira pergunta',
    consequence:'Enviar a resposta ao fluxo nativo',sourceRef:'synthetic:question',deadlineAt:new Date(at+30000).toISOString()};
  lab.registry.observeRequest(request);
  const question=lab.confirm(intent({commandId:'question-c',idempotencyKey:'question-k',action:'answer_question',requestId:'question-1'}));
  lab.registry.observeRequest({...request,originalContext:'Pergunta substituída'});
  await assert.rejects(lab.gateway.submit(question,actor),/confirmation_invalid/);assert.equal(lab.calls,0);
});

test('modo do servidor prevalece sobre corpo live e prova é invalidada pela versão do adaptador',async t=>{
  const lab=setup(t);
  for(const mode of ['demo','replay'] as const){
    const gateway=new CommandGateway({audit:lab.store.commands,registry:lab.registry,adapters:[lab.adapter],resolveTarget:()=>lab.target,now:()=>at,mode});
    await assert.rejects(gateway.submit(intent(),actor),/mode_forbidden/);
  }
  lab.adapter.version='fake-2';assert.throws(()=>lab.confirm(),/capability_unavailable/);assert.equal(lab.calls,0);
});

test('prazo ou revogação após gravação de sending ainda impedem chamada externa',async t=>{
  for(const reason of ['deadline','revoked']){
    const lab=setup(t);const input=lab.confirm();const transition=lab.store.commands.transition.bind(lab.store.commands);
    lab.store.commands.transition=(id,state,detail,now)=>{
      const record=transition(id,state,detail,now);
      if(state==='sending'){
        if(reason==='deadline')lab.setNow(at+31000);
        else lab.registry.revoke('session-lab','send_message');
      }
      return record;
    };
    await assert.rejects(lab.gateway.submit(input,actor),reason==='deadline'?/deadline_expired/:/capability_unavailable/);
    assert.equal(lab.calls,0);assert.equal(lab.store.commands.get(input.commandId)?.state,reason==='deadline'?'expired':'rejected');
  }
});

test('prévia expirada durante espera SQLite não vale mesmo com intenção e prova vigentes',async t=>{
  const lab=setup(t);
  lab.registry.prove({...proof,validUntil:new Date(at+300000).toISOString()});
  const value=lab.confirm(intent({deadlineAt:new Date(at+120000).toISOString()}));
  const transition=lab.store.commands.transition.bind(lab.store.commands);
  lab.store.commands.transition=(id,state,reason,now)=>{
    const record=transition(id,state,reason,now);
    if(state==='sending')lab.setNow(at+61000);
    return record;
  };
  await assert.rejects(lab.gateway.submit(value,actor),/confirmation_invalid/);
  assert.equal(lab.calls,0);assert.equal(lab.store.commands.get(value.commandId)?.state,'rejected');
});
