import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { EventStore } from '../../src/store/event-store.ts';
import { CapabilityRegistry } from '../../src/commands/capability-registry.ts';
import { CommandGateway } from '../../src/commands/gateway.ts';
import { sessionKey } from '../../src/domain/identity.ts';
import { JsonlChannel } from '../../src/commands/providers/jsonl-channel.ts';
import { createCodexMessageAdapter, codexCommands } from '../../src/commands/providers/codex.ts';
import { createClaudeMessageAdapter, claudeCommands } from '../../src/commands/providers/claude.ts';
import type { OwnedSession } from '../../src/commands/providers/owned-session.ts';
import type { CommandIntent } from '../../src/commands/types.ts';

const binding=(provider:'codex'|'claude'):OwnedSession=>({provider,providerVersion:provider==='codex'?'0.166.0':'2.1.319',
  projectId:'lab',accountRef:'synthetic-account',providerSessionId:provider==='codex'?'thread-lab':'claude-lab',connectionId:'owned-connection'});
const intent=(owner:OwnedSession):CommandIntent=>({schemaVersion:'1.0',commandId:'command-1',idempotencyKey:'key-1',mode:'live',
  projectId:owner.projectId,sessionKey:sessionKey(owner.provider,owner.accountRef,owner.providerSessionId),provider:owner.provider,
  providerVersion:owner.providerVersion,action:'send_message',requestId:null,deadlineAt:new Date(Date.now()+60000).toISOString(),
  payload:{text:'Mensagem sintética de laboratório'},confirmationId:null});
function transport(t:{after(fn:()=>void):void},respond:(input:any,output:PassThrough)=>void){
  const output=new PassThrough();const sent:any[]=[];
  const input=new Writable({write(chunk,_encoding,done){const frame=JSON.parse(chunk.toString());sent.push(frame);respond(frame,output);done();}});
  const channel=new JsonlChannel({input,output,connectionId:'owned-connection',timeoutMs:20});
  t.after(()=>{channel.close();input.destroy();output.destroy();});return {channel,sent};
}
const send=(output:PassThrough,frame:unknown)=>output.write(JSON.stringify(frame)+'\n');

test('Codex usa thread vinculada e resposta RPC correlacionada; não inicia nem retoma thread',async t=>{
  const owner=binding('codex');
  const lab=transport(t,(frame,out)=>send(out,{id:frame.id,result:{turn:{id:'turn-1',status:'inProgress',items:[]}}}));
  const adapter=createCodexMessageAdapter(owner,lab.channel,()=>null);
  const result=await adapter.send(intent(owner),new AbortController().signal);
  assert.equal(result.status,'confirmed');assert.equal(result.commandId,'command-1');
  assert.deepEqual(lab.sent.map(x=>x.method),['turn/start']);assert.equal(lab.sent[0].params.threadId,'thread-lab');
  assert.equal(lab.sent[0].params.input[0].text,intent(owner).payload.text);
  assert.equal(lab.sent[0].params.approvalPolicy,undefined);assert.equal(lab.sent[0].params.sandboxPolicy,undefined);
});

test('Codex direciona turno ativo por expectedTurnId sem fallback para novo turno',async t=>{
  const owner=binding('codex');
  const lab=transport(t,(frame,out)=>send(out,{id:frame.id,result:{turnId:'active-1'}}));
  const adapter=createCodexMessageAdapter(owner,lab.channel,()=>'active-1');
  assert.equal((await adapter.send(intent(owner),new AbortController().signal)).status,'confirmed');
  assert.equal(lab.sent[0].method,'turn/steer');assert.equal(lab.sent[0].params.expectedTurnId,'active-1');
});

test('erro RPC de parâmetros recusa; erro interno e ack incompatível não viram sucesso',async t=>{
  const owner=binding('codex');
  const denied=transport(t,(frame,out)=>send(out,{id:frame.id,error:{code:-32602,message:'texto privado do provedor'}}));
  assert.equal((await createCodexMessageAdapter(owner,denied.channel,()=>null).send(intent(owner),new AbortController().signal)).status,'rejected');
  for(const reply of [{error:{code:-32603,message:'segredo'}},{result:{turn:{id:'t'}}},
    {result:{turn:{id:'t',status:'inProgress'}}},{result:{turn:{id:'t',status:'inProgress'}},method:'request'}]){
    const lab=transport(t,(frame,out)=>send(out,{id:frame.id,...reply}));
    await assert.rejects(createCodexMessageAdapter(owner,lab.channel,()=>null).send(intent(owner),new AbortController().signal),/delivery_unconfirmed/);
    assert.equal(lab.sent.length,1);
  }
});

test('Claude só confirma eco de UUID/sessão/conteúdo, nunca resposta do assistente',async t=>{
  const owner=binding('claude');
  const lab=transport(t,(frame,out)=>{
    send(out,{type:'assistant',session_id:owner.providerSessionId,message:{content:'OK'}});
    send(out,{...frame,isReplay:true,uuid:'outro'});
    send(out,{...frame,isReplay:true,session_id:'outra'});
    send(out,{...frame,isReplay:true,message:{role:'user',content:'conteúdo diferente'}});
    send(out,{...frame,isReplay:true});
  });
  const result=await createClaudeMessageAdapter(owner,lab.channel).send(intent(owner),new AbortController().signal);
  assert.equal(result.status,'confirmed');assert.equal(lab.sent.length,1);
  assert.match(lab.sent[0].uuid,/^[0-9a-f-]{36}$/);assert.equal(lab.sent[0].session_id,'claude-lab');
});

test('sem eco confirmado Claude fica incerto e não repete',async t=>{
  const owner=binding('claude');
  const lab=transport(t,(frame,out)=>send(out,{type:'result',session_id:owner.providerSessionId,user_message_uuid:frame.uuid,result:'OK'}));
  await assert.rejects(createClaudeMessageAdapter(owner,lab.channel).send(intent(owner),new AbortController().signal),/delivery_unconfirmed/);
  assert.equal(lab.sent.length,1);
});

test('versão não ensaiada, outra conta/projeto e demo/replay não chegam ao canal',async t=>{
  for(const provider of ['claude','codex'] as const){
    const owner=binding(provider),lab=transport(t,()=>{});
    const create=(bound:OwnedSession)=>provider==='codex'?createCodexMessageAdapter(bound,lab.channel,()=>null):createClaudeMessageAdapter(bound,lab.channel);
    assert.throws(()=>create({...owner,providerVersion:'versão-futura'}),/unsupported_provider_binding/);
    const adapter=create(owner);
    for(const changes of [{projectId:'outro'},{sessionKey:sessionKey(provider,'outra-conta',owner.providerSessionId)},
      {mode:'replay'},{mode:'demo'},{action:'decide_permission',requestId:'r1',payload:{decision:'allow'}}]){
      await assert.rejects(adapter.send({...intent(owner),...changes} as CommandIntent,new AbortController().signal),/provider_target_unavailable/);
    }
    lab.channel.close();await assert.rejects(adapter.send(intent(owner),new AbortController().signal),/provider_target_unavailable/);
    assert.equal(lab.sent.length,0);
  }
  assert.deepEqual(codexCommands.actions,[]);assert.deepEqual(claudeCommands.actions,[]);
});

test('gateway persiste prova do adaptador de protocolo e deduplica dois cliques',async t=>{
  const owner=binding('codex'),lab=transport(t,(frame,out)=>send(out,{id:frame.id,result:{turn:{id:'turn-1',status:'inProgress',items:[]}}}));
  const adapter=createCodexMessageAdapter(owner,lab.channel,()=>null),store=new EventStore(':memory:');t.after(()=>store.close());
  const registry=new CapabilityRegistry(),value=intent(owner),now=Date.now();
  registry.prove({provider:owner.provider,providerVersion:owner.providerVersion,projectId:owner.projectId,sessionKey:value.sessionKey,
    action:'send_message',adapterVersion:adapter.version,evidenceRef:'synthetic:protocol-only',provenAt:new Date(now-1000).toISOString(),validUntil:new Date(now+60000).toISOString()});
  const gateway=new CommandGateway({audit:store.commands,registry,adapters:[adapter],mode:'live',resolveTarget:()=>({projectId:owner.projectId,sessionKey:value.sessionKey,provider:owner.provider,providerVersion:owner.providerVersion,active:true})});
  const actor={actorId:'operador-sintetico',projectIds:['lab']};value.confirmationId=gateway.preview(value,actor).confirmationId;
  await Promise.all([gateway.submit(value,actor),gateway.submit(value,actor)]);
  assert.equal(lab.sent.length,1);assert.equal(store.commands.get(value.commandId)?.state,'confirmed');
  assert.doesNotMatch(JSON.stringify(store.commands.get(value.commandId)),/Mensagem sintética/);
});
