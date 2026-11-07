// Compatibilidade estrutural offline. Não abre o app-server nem faz inferência.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv from 'ajv';
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'Logs', 'm4-protocol-codex-0.166.0');
const samples = [
  ['v2/TurnStartParams', {threadId:'synthetic-thread',input:[{type:'text',text:'Mensagem sintética M4'}],clientUserMessageId:'00000000-0000-4000-8000-000000000001'}],
  ['v2/TurnStartResponse', {turn:{id:'synthetic-turn',status:'inProgress',items:[]}}],
  ['v2/TurnSteerParams', {threadId:'synthetic-thread',expectedTurnId:'synthetic-turn',input:[{type:'text',text:'Mensagem sintética M4'}]}],
  ['v2/TurnSteerResponse', {turnId:'synthetic-turn'}]
];
const cases = samples.map(([name, sample]) => {
  const raw = readFileSync(path.join(directory, name + '.json'), 'utf8');
  const validate = new Ajv({strict:false,validateFormats:false}).compile(JSON.parse(raw));
  const valid = validate(sample);
  if (!valid) throw new Error('protocol_fixture_invalid:' + name);
  return {schema:name,sha256:createHash('sha256').update(raw).digest('hex'),valid};
});
const negativeRaw = readFileSync(path.join(directory, 'v2/TurnSteerParams.json'), 'utf8');
const checkNegative = new Ajv({strict:false,validateFormats:false}).compile(JSON.parse(negativeRaw));
if (checkNegative({threadId:'synthetic-thread',input:[{type:'text',text:'teste'}]})) throw new Error('negative_gate_failed');
const result = {providerVersion:'0.166.0',structuralOnly:true,providerDelivery:'not_run',cases,missingExpectedTurnRejected:true};
mkdirSync(path.join(root,'Logs'), {recursive:true});
writeFileSync(path.join(root,'Logs','m4-codex-schema-result.json'),JSON.stringify(result,null,2));
process.stdout.write(JSON.stringify(result)+'\n');
