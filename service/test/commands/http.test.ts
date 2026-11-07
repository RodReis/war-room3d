import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventStore } from '../../src/store/event-store.ts';
import { startReadOnlyServer } from '../../src/http/server.ts';
import { CommandGateway } from '../../src/commands/gateway.ts';
import { CapabilityRegistry } from '../../src/commands/capability-registry.ts';
import type { CommandIntent, CommandAdapter } from '../../src/commands/types.ts';
const readToken='r'.repeat(32),commandToken='w'.repeat(32);
const headers={Authorization:`Bearer ${commandToken}`,'Content-Type':'application/json'};
test('HTTP separa leitura/comando, valida origem, prévia, escopo e idempotência',async t=>{
  const store=new EventStore(':memory:');const registry=new CapabilityRegistry();const now=Date.now();let calls=0;
  const target={sessionKey:'session-lab',projectId:'lab',provider:'codex' as const,providerVersion:'test-1',active:true};
  const adapter:CommandAdapter={provider:'codex',version:'fake-1',actions:['send_message'],async send(input){calls++;return {status:'confirmed',commandId:input.commandId,requestId:null};}};
  registry.prove({sessionKey:target.sessionKey,projectId:target.projectId,provider:target.provider,providerVersion:target.providerVersion,
    action:'send_message',adapterVersion:'fake-1',evidenceRef:'synthetic:proof',provenAt:new Date(now-1000).toISOString(),validUntil:new Date(now+60000).toISOString()});
  const gateway=new CommandGateway({audit:store.commands,registry,adapters:[adapter],resolveTarget:()=>target,mode:'live'});
  const {server,url}=await startReadOnlyServer(store,readToken,0,{gateway,token:commandToken,actor:{actorId:'operador',projectIds:['lab']},targets:()=>[target]});
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();});
  const value:CommandIntent={schemaVersion:'1.0',commandId:'command-1',idempotencyKey:'key-1',projectId:'lab',sessionKey:target.sessionKey,provider:'codex',
    providerVersion:'test-1',action:'send_message',mode:'live',deadlineAt:new Date(now+30000).toISOString(),requestId:null,payload:{text:'Mensagem privada sintética'},confirmationId:null};
  const post=(route:string,input:unknown,extra:Record<string,string>={})=>fetch(`${url}${route}`,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(input)});
  assert.equal((await fetch(`${url}/v1/commands`,{method:'POST'})).status,401);
  assert.equal((await post('/v1/commands',value,{Authorization:`Bearer ${readToken}`})).status,403);
  assert.equal((await post('/v1/commands',value,{Origin:'https://externo.invalid'})).status,403);
  assert.equal((await post('/v1/commands/preview',{...value,mode:'replay'})).status,403);
  assert.equal((await post('/v1/commands/preview',{...value,projectId:'outro'})).status,403);
  assert.equal((await post('/v1/commands/preview',{...value,shell:'whoami'})).status,400);
  assert.equal((await post('/v1/commands/preview',{...value,payload:{text:'x'.repeat(40000)}})).status,413);
  const capabilities=await (await fetch(`${url}/v1/capabilities`,{headers})).json() as any;
  assert.equal(capabilities.sessions[0].capabilities.find((x:any)=>x.action==='send_message').available,true);
  assert.equal(capabilities.sessions[0].capabilities.find((x:any)=>x.action==='decide_permission').available,false);
  const preview=await post('/v1/commands/preview',value);assert.equal(preview.status,200);
  const details=await preview.json() as any;assert.match(details.consequence,/sessão/);assert.equal(details.originalContext,value.payload.text);
  const confirmed={...value,confirmationId:details.confirmationId};
  const replies=await Promise.all([post('/v1/commands',confirmed),post('/v1/commands',confirmed)]);
  assert.deepEqual(replies.map(x=>x.status),[200,200]);assert.equal(calls,1);
  const record=await fetch(`${url}/v1/commands/command-1`,{headers});assert.equal(record.status,200);
  assert.doesNotMatch(await record.text(),/Mensagem privada/);
  const badHost=await new Promise<number>(resolve=>{const req=http.get(`${url}/v1/capabilities`,{headers:{Authorization:`Bearer ${readToken}`,Host:'externo.invalid'}},res=>{res.resume();resolve(res.statusCode!);});req.on('error',()=>resolve(0));});
  assert.equal(badHost,403);
});

test('produção não habilita capacidades sem provas e rejeita credencial compartilhada',async t=>{
  const store=new EventStore(':memory:');
  await assert.rejects(startReadOnlyServer(store,readToken,0,{token:readToken,actor:{actorId:'x',projectIds:['lab']}}),/distinta/);
  const {server,url}=await startReadOnlyServer(store,readToken);
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();});
  const result=await fetch(`${url}/v1/capabilities`,{headers:{Authorization:`Bearer ${readToken}`}});assert.equal(result.status,200);
  assert.deepEqual((await result.json() as any).sessions,[]);
  assert.equal((await fetch(`${url}/v1/commands`,{method:'POST',headers:{Authorization:`Bearer ${readToken}`}})).status,403);
});
