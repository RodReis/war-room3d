import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';

const schema=JSON.parse(readFileSync(new URL('../schemas/conversation-page.v1.schema.json',import.meta.url),'utf8'));
const validate=new Ajv2020({strict:true}).compile(schema);
const at='2026-11-08T12:00:00.000Z';
const item={sequence:1,messageId:'m-1',projectId:'p',sessionKey:'s',provider:'codex',role:'assistant',content:'Resposta sintética',
  observedAt:at,nativeRef:'native-1',turnRef:'turn-1',sourceId:'source-1',consentRef:'lab-33',expiresAt:at,truncated:false};

test('página distingue resposta observada de recibo e recusa campos sem escopo',()=>{
  const page={schemaVersion:'1.0',projectId:'p',sessionKey:'s',items:[item],nextBefore:null,provenance:'observed',receiptIsResponse:false};
  assert.equal(validate(page),true,JSON.stringify(validate.errors));
  assert.equal(validate({...page,receiptIsResponse:true}),false);
  assert.equal(validate({...page,items:[{...item,commandId:'inventado'}]}),false);
  assert.equal(validate({...page,items:[{...item,role:'tool'}]}),false);
  assert.equal(validate({...page,items:[{...item,content:'x'.repeat(8001)}]}),false);
});
