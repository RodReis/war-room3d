import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
const compile=name=>new Ajv2020({strict:true,strictRequired:false}).compile(JSON.parse(readFileSync(new URL(`../schemas/${name}.v1.schema.json`,import.meta.url),'utf8')));
const validateCommand=compile('command');const validateProof=compile('capability');
const commandSchema=JSON.parse(readFileSync(new URL('../schemas/command.v1.schema.json',import.meta.url),'utf8'));
const validateResult=new Ajv2020({strict:true}).compile(commandSchema.$defs.result);
const proof={provider:'claude',providerVersion:'synthetic-1',adapterVersion:'test-1',projectId:'lab',sessionKey:'session-lab',action:'send_message',
  evidenceRef:'synthetic:proof',provenAt:'2026-11-07T16:00:00.000Z',validUntil:'2026-11-07T17:00:00.000Z'};
const command={schemaVersion:'1.0',commandId:'command-1',idempotencyKey:'key-1',mode:'live',projectId:'lab',sessionKey:'session-lab',provider:'claude',
  providerVersion:'test-1',action:'send_message',requestId:null,deadlineAt:'2026-11-07T17:00:00.000Z',payload:{text:'Mensagem sintética'},confirmationId:null};
test('prova exige versão, origem, sessão, ação e validade explícitas',()=>{
  assert.equal(validateProof(proof),true);
  for(const key of Object.keys(proof)){const invalid={...proof};delete invalid[key];assert.equal(validateProof(invalid),false,key);}
  assert.equal(validateProof({...proof,action:'exec_shell'}),false);
  assert.equal(validateProof({...proof,evidenceRef:''}),false);
});
test('intenção tipada não aceita shell, campo arbitrário ou decisão implícita',()=>{
  assert.equal(validateCommand(command),true);
  assert.equal(validateCommand({...command,payload:{shell:'whoami'}}),false);
  assert.equal(validateCommand({...command,actorId:'admin'}),false);
  assert.equal(validateCommand({...command,action:'decide_permission',requestId:'r1',payload:{decision:'allow'}}),true);
  assert.equal(validateCommand({...command,action:'decide_permission',requestId:'r1',payload:{}}),false);
  assert.equal(validateCommand({...command,action:'answer_question',requestId:'r1'}),true);
  assert.equal(validateCommand({...command,action:'answer_question'}),false);
});
test('resultado tem estados explícitos, ator e auditoria sem conteúdo bruto',()=>{
  const result={commandId:'command-1',actorId:'operador',projectId:'lab',sessionKey:'session-lab',provider:'claude',providerVersion:'test-1',
    action:'send_message',requestId:null,deadlineAt:command.deadlineAt,payloadRef:`sha256:${'a'.repeat(64)}`,adapterVersion:'fake-1',state:'unknown',reason:'delivery_unknown',
    updatedAt:command.deadlineAt,audit:[{state:'unknown',reason:'delivery_unknown',at:command.deadlineAt}]};
  assert.equal(validateResult(result),true);
  assert.equal(validateResult({...result,state:'completed'}),false);
  assert.equal(validateResult({...result,rawResponse:'conteúdo privado'}),false);
  assert.equal(validateResult({...result,audit:[]}),false);
});
