import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { EventStore } from '../src/store/event-store.ts';
import { parseSessionSources, SessionFileCollector } from '../src/sessions/file-source.ts';
import { sanitizeSourceRecord } from '../src/sessions/capture-source.ts';
import { adaptSessionRecord } from '../src/sessions/adapters.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

test('captura descarta conteúdo e caminhos privados', () => {
  const claude = sanitizeSourceRecord('claude',{hook_event_name:'UserPromptSubmit',session_id:'s',cwd:'C:\\segredo',prompt:'token privado'});
  const codex = sanitizeSourceRecord('codex',{method:'item/completed',params:{threadId:'t',item:{type:'commandExecution',id:'i',command:'echo segredo',status:'completed'}}});
  assert.equal(claude?.hook_event_name,'UserPromptSubmit');
  assert.equal(typeof claude?.cwdHash,'string');
  assert.equal(JSON.stringify(claude).includes('token privado'),false);
  assert.deepEqual(codex,{method:'item/completed',params:{threadId:'t',item:{type:'commandExecution',id:'i',status:'completed'}}});
});

test('hook Claude renova presença do agente principal após recuperação da fonte', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-claude-presence-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  const filePath = path.join(directory,'claude.jsonl');
  const source = {sourceId:'claude-vscode',sourceVersion:'2.1.322',provider:'claude' as const,
    projectId:'arena',accountRef:'vscode-local',filePath};
  store.registerProject({projectId:'arena',name:'ArenaHub',canonicalPath:'C:\\lab\\arena'});
  const collector = new SessionFileCollector(store,[source]);
  const line = (hook_event_name:string, capturedAt:string) =>
    `${JSON.stringify({...sanitizeSourceRecord('claude',{
      hook_event_name,session_id:'session-1',cwd:'C:\\lab\\arena',prompt_id:'reused-prompt-id'
    }),capturedAt})}\n`;
  writeFileSync(filePath,line('SessionStart','2026-11-11T20:00:00.000Z')+
    line('UserPromptSubmit','2026-11-11T20:00:01.000Z')+
    line('Stop','2026-11-11T20:00:02.000Z'));
  collector.poll();
  assert.equal((store.snapshot().agents as {presence:string}[])[0].presence,'aguardando');
  renameSync(filePath,`${filePath}.hold`);
  collector.poll();
  assert.equal((store.snapshot().agents as {presence:string}[])[0].presence,'desconhecida');
  renameSync(`${filePath}.hold`,filePath);
  const renewedPrompt = line('UserPromptSubmit',new Date(Date.now()+1000).toISOString());
  appendFileSync(filePath,renewedPrompt);
  collector.poll();
  assert.equal((store.snapshot().sessions as {presence:string;freshness:string}[])[0].presence,'trabalhando');
  assert.equal((store.snapshot().sessions as {presence:string;freshness:string}[])[0].freshness,'atual');
  assert.equal((store.snapshot().agents as {presence:string}[])[0].presence,'trabalhando');
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'atual');
  const beforeReplay = store.snapshot().streamSequence;
  appendFileSync(filePath,renewedPrompt);
  collector.poll();
  assert.equal(store.snapshot().streamSequence,beforeReplay);
});

test('ferramenta Claude com agent_id observa subagente mesmo sem SubagentStart', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-claude-tool-agent-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  const filePath = path.join(directory,'claude.jsonl');
  const source = {sourceId:'claude-vscode',sourceVersion:'2.1.322',provider:'claude' as const,
    projectId:'arena',accountRef:'vscode-local',filePath};
  store.registerProject({projectId:'arena',name:'ArenaHub',canonicalPath:'C:\\lab\\arena'});
  const collector = new SessionFileCollector(store,[source]);
  const line = (value:object) => `${JSON.stringify({...sanitizeSourceRecord('claude',{
    session_id:'session-1',cwd:'C:\\lab\\arena',...value
  }),capturedAt:'2026-11-11T20:00:00.000Z'})}\n`;
  writeFileSync(filePath,line({hook_event_name:'SessionStart',source:'startup'})+
    line({hook_event_name:'PreToolUse',agent_id:'subagent-1',tool_use_id:'tool-1',tool_name:'Read'}));
  collector.poll();
  const agents = store.snapshot().agents as {agentKey:string;parentStatus:string}[];
  const invocation = (store.snapshot().invocations as {agentKey:string;name:string}[])[0];
  assert.equal(agents.length,2);
  assert.equal(agents.find(agent => agent.agentKey === invocation.agentKey)?.parentStatus,'vinculo_pendente');
  assert.equal(invocation.name,'Read');
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'atual');
});

test('expansão de skill guarda só metadados e exige cadastro explícito', () => {
  const raw={hook_event_name:'UserPromptExpansion',session_id:'session-a',cwd:'C:\\privado',
    expansion_type:'slash_command',command_name:'wr3d-35:synthetic',command_source:'plugin',
    command_args:'segredo-sintetico',prompt:'/wr3d-35:synthetic segredo-sintetico',transcript_path:'C:\\privado\\history.jsonl'};
  const captured=sanitizeSourceRecord('claude',raw,true)!;
  assert.equal(captured.command_name,'wr3d-35:synthetic');
  assert.equal(captured.command_source,'plugin');
  assert.equal(JSON.stringify(captured).includes('segredo-sintetico'),false);
  assert.equal(JSON.stringify(captured).includes('history.jsonl'),false);
  const suspicious=sanitizeSourceRecord('claude',{...raw,command_name:'C:\\privado',command_source:'C:\\privado'});
  assert.equal(suspicious?.command_name,undefined);
  assert.equal(suspicious?.command_source,undefined);
  const source={sourceId:'lab',sourceVersion:'2.1.319',provider:'claude' as const,projectId:'p',accountRef:'lab',
    filePath:path.join(tmpdir(),'wr3d-claude-events.jsonl'),skillCommands:['wr3d-35:synthetic']};
  const event=adaptSessionRecord(source,captured,'file:100','2026-11-08T11:00:00.000Z');
  assert.equal(event.length,1);
  assert.equal(event[0].type,'skill.observed');
  assert.equal(event[0].payload.name,'wr3d-35:synthetic');
  assert.deepEqual(adaptSessionRecord({...source,skillCommands:[]},captured,'file:100','2026-11-08T11:00:00.000Z'),[]);
  assert.deepEqual(adaptSessionRecord(source,{...captured,command_name:'plugin:custom-command'},'file:100','2026-11-08T11:00:00.000Z'),[]);
  assert.deepEqual(adaptSessionRecord(source,{...captured,expansion_type:'mcp_prompt'},'file:100','2026-11-08T11:00:00.000Z'),[]);
});

test('configuração restringe comandos de skill à fonte Claude', () => {
  const base={schemaVersion:'1.0',projects:[{projectId:'p',name:'Projeto',canonicalPath:'C:\\lab'}],sources:[
    {sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p',accountRef:'lab',
      filePath:path.join(tmpdir(),'wr3d-claude-events.jsonl'),skillCommands:['wr3d-35:synthetic']}]};
  assert.deepEqual(parseSessionSources(base).sources[0].skillCommands,['wr3d-35:synthetic']);
  assert.throws(()=>parseSessionSources({...base,sources:[{...base.sources[0],provider:'codex'}]}));
  assert.throws(()=>parseSessionSources({...base,sources:[{...base.sources[0],skillCommands:['wr3d-35:synthetic','wr3d-35:synthetic']}]}));
  assert.throws(()=>parseSessionSources({...base,sources:[{...base.sources[0],skillCommands:['/segredo']}] }));
});

test('expansão de skill cadastrada atravessa spool e aparece na atividade sem conteúdo', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'wr3d-slash-skill-'));
  const store=new EventStore(path.join(directory,'events.db'));
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\lab'});
  const filePath=path.join(directory,'claude.jsonl');
  const source={sourceId:'lab',sourceVersion:'2.1.319',provider:'claude' as const,projectId:'p',accountRef:'lab',
    filePath,skillCommands:['wr3d-35:synthetic']};
  const collector=new SessionFileCollector(store,[source]);
  const line=(value:unknown)=>`${JSON.stringify(sanitizeSourceRecord('claude',value))}\n`;
  writeFileSync(filePath,line({hook_event_name:'SessionStart',session_id:'s',cwd:'C:\\lab'})+
    line({hook_event_name:'UserPromptExpansion',session_id:'s',cwd:'C:\\lab',expansion_type:'slash_command',
      command_name:'wr3d-35:synthetic',command_source:'plugin',command_args:'segredo',prompt:'segredo'}));
  collector.poll();
  const snapshot=store.snapshot();
  assert.deepEqual((snapshot.invocations as {kind:string;name:string;status:string}[])
    .map(item=>[item.kind,item.name,item.status]),
    [['skill','wr3d-35:synthetic','observada']]);
  assert.equal(JSON.stringify(snapshot).includes('segredo'),false);
});

test('comando de hook grava somente campos permitidos', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-capture-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const filePath = path.join(directory,'claude.jsonl');
  const script = new URL('../src/sessions/capture-source.ts',import.meta.url);
  const result = spawnSync(process.execPath,[script.pathname.startsWith('/') && process.platform==='win32' ? decodeURIComponent(script.pathname.slice(1)) : decodeURIComponent(script.pathname),'claude',filePath],{
    input:JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'s',prompt:'segredo-sintetico',cwd:'C:\\privado'}),encoding:'utf8'
  });
  assert.equal(result.status,0,result.stderr);
  const saved = readFileSync(filePath,'utf8');
  assert.equal(JSON.parse(saved).session_id,'s');
  assert.equal(typeof JSON.parse(saved).cwdHash,'string');
  assert.equal(saved.includes('segredo-sintetico'),false);
});

test('captura delimitada aceita apenas sessões iniciadas após a ativação', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-new-sessions-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const filePath = path.join(directory,'claude.jsonl');
  const script = new URL('../src/sessions/capture-source.ts',import.meta.url);
  const scriptPath = process.platform === 'win32' ? decodeURIComponent(script.pathname.slice(1)) : decodeURIComponent(script.pathname);
  const send = (event: object) => {
    const result = spawnSync(process.execPath,[scriptPath,'claude',filePath,'--new-sessions'],{
      input:JSON.stringify(event),encoding:'utf8'
    });
    assert.equal(result.status,0,result.stderr);
  };
  const base = {cwd:'C:\\projeto',prompt:'conteúdo privado',tool_input:{command:'segredo'}};
  send({...base,hook_event_name:'UserPromptSubmit',session_id:'antiga'});
  send({...base,hook_event_name:'SessionStart',session_id:'antiga',source:'resume'});
  send({...base,hook_event_name:'SessionStart',session_id:'nova',source:'startup'});
  send({...base,hook_event_name:'UserPromptSubmit',session_id:'antiga'});
  send({...base,hook_event_name:'UserPromptSubmit',session_id:'nova'});
  const saved = readFileSync(filePath,'utf8');
  const records = saved.trim().split('\n').map(line => JSON.parse(line) as {session_id:string;hook_event_name:string});
  assert.deepEqual(records.map(record => [record.session_id,record.hook_event_name]),
    [['nova','SessionStart'],['nova','UserPromptSubmit']]);
  assert.equal(saved.includes('conteúdo privado'),false);
  assert.equal(saved.includes('segredo'),false);
});

test('hooks Codex repetidos no mesmo turn_id renovam presença após perda da fonte', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-codex-hook-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  const filePath = path.join(directory,'codex.jsonl');
  const projectPath = 'D:\\projetos\\forjaOS';
  const source = {sourceId:'codex-vscode',sourceVersion:'0.164.0-alpha.11.1',provider:'codex' as const,
    projectId:'forjaOS',accountRef:'vscode-local',filePath};
  store.registerProject({projectId:'forjaOS',name:'ForjaOS',canonicalPath:projectPath});
  const collector = new SessionFileCollector(store,[source]);
  const script = new URL('../src/sessions/capture-source.ts',import.meta.url);
  const scriptPath = process.platform === 'win32' ? decodeURIComponent(script.pathname.slice(1)) : decodeURIComponent(script.pathname);
  const send = (event: object) => {
    const result = spawnSync(process.execPath,[scriptPath,'codex',filePath,'--new-sessions'],{
      input:JSON.stringify(event),encoding:'utf8'
    });
    assert.equal(result.status,0,result.stderr);
  };
  const base = {session_id:'thread-1',cwd:projectPath,transcript_path:'D:\\privado\\history.jsonl'};
  send({...base,hook_event_name:'UserPromptSubmit',turn_id:'old',prompt:'não coletar'});
  send({...base,hook_event_name:'SessionStart',source:'startup'});
  send({...base,hook_event_name:'UserPromptSubmit',turn_id:'turn-1',prompt:'não coletar'});
  send({...base,hook_event_name:'PreToolUse',turn_id:'turn-1',tool_name:'Bash',tool_use_id:'tool-1',tool_input:{command:'segredo'}});
  send({...base,hook_event_name:'PostToolUse',turn_id:'turn-1',tool_name:'Bash',tool_use_id:'tool-1',tool_response:{text:'segredo'}});
  send({...base,hook_event_name:'Stop',turn_id:'turn-1',last_assistant_message:'não coletar'});
  send({...base,hook_event_name:'UserPromptSubmit',turn_id:'turn-1',prompt:'não coletar de novo'});
  const saved = readFileSync(filePath,'utf8');
  assert.equal(saved.trim().split('\n').length,6);
  assert.equal(saved.includes('não coletar') || saved.includes('segredo') || saved.includes('history.jsonl'),false);
  collector.poll();
  const snapshot = store.snapshot();
  assert.equal((snapshot.sources as {status:string}[])[0].status,'atual');
  assert.equal((snapshot.sessions as {projectId:string;presence:string}[])[0].projectId,'forjaOS');
  assert.equal((snapshot.sessions as {projectId:string;presence:string}[])[0].presence,'trabalhando');
  assert.equal((snapshot.agents as {presence:string}[])[0].presence,'trabalhando');
  assert.deepEqual((snapshot.invocations as {name:string;status:string}[]).map(item=>[item.name,item.status]),[['Bash','resultado_observado']]);
  renameSync(filePath,`${filePath}.hold`);
  collector.poll();
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'desconhecida');
  renameSync(`${filePath}.hold`,filePath);
  send({...base,hook_event_name:'UserPromptSubmit',turn_id:'turn-1',prompt:'continuar sem conteúdo'});
  collector.poll();
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'trabalhando');
  assert.equal((store.snapshot().agents as {presence:string}[])[0].presence,'trabalhando');
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'atual');
});

test('hook Codex preserva identidade na releitura e distingue sinais no mesmo turno', () => {
  const source = {sourceId:'codex-vscode',sourceVersion:'1',provider:'codex' as const,
    projectId:'forjaOS',accountRef:'vscode-local',filePath:path.join(tmpdir(),'codex-fixture.jsonl')};
  const raw = {hook_event_name:'UserPromptSubmit',session_id:'thread-1',turn_id:'turn-1',
    capturedAt:'2026-11-11T19:00:12.000Z'};
  const first = adaptSessionRecord(source,raw,'file-a:100','2026-11-11T19:00:13.000Z');
  const replay = adaptSessionRecord(source,raw,'file-b:200','2026-11-11T19:00:14.000Z');
  const next = adaptSessionRecord(source,{...raw,capturedAt:'2026-11-11T19:25:37.000Z'},
    'file-a:300','2026-11-11T19:25:38.000Z');
  assert.equal(first[0].eventId,replay[0].eventId);
  assert.notEqual(first[0].eventId,next[0].eventId);
});

test('captura Codex em fluxo não persiste conteúdo nem resposta RPC', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-codex-capture-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const filePath = path.join(directory,'codex.jsonl');
  const script = new URL('../src/sessions/capture-source.ts',import.meta.url);
  const scriptPath = process.platform==='win32' ? decodeURIComponent(script.pathname.slice(1)) : decodeURIComponent(script.pathname);
  const result = spawnSync(process.execPath,[scriptPath,'codex',filePath,'--stream'],{input:
    `${JSON.stringify({id:1,result:{token:'segredo'}})}\n${JSON.stringify({method:'item/completed',params:{threadId:'thread',item:{type:'commandExecution',id:'item',command:'segredo',status:'completed'}}})}\n`,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const saved = readFileSync(filePath,'utf8');
  assert.equal(saved.split('\n').filter(Boolean).length,1);
  assert.equal(saved.includes('segredo'),false);
});

test('captura subAgentActivity v2 guarda thread filha e descarta caminho e texto', () => {
  const safe=sanitizeSourceRecord('codex',{method:'item/completed',params:{threadId:'parent',
    item:{type:'subAgentActivity',id:'activity-1',kind:'started',agentThreadId:'child',agentPath:'privado/agente',prompt:'segredo'}}});
  assert.deepEqual(safe,{method:'item/completed',params:{threadId:'parent',
    item:{type:'subAgentActivity',id:'activity-1',agentThreadId:'child',kind:'started'}}});
});

test('backfill preserva horário da fonte distinto do recebimento', () => {
  const source = {sourceId:'lab',sourceVersion:'2.1.319',provider:'claude' as const,projectId:'p',accountRef:'lab',filePath:path.join(tmpdir(),'wr3d-claude-events.jsonl')};
  const raw = {...sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'s',cwd:'C:\\repo\\p'}),capturedAt:'2026-11-08T10:00:00.000Z'};
  const events = adaptSessionRecord(source,raw,'file:100','2026-11-08T11:00:00.000Z');
  assert.equal(events[0].observedAt,'2026-11-08T10:00:00.000Z');
  assert.equal(events[0].receivedAt,'2026-11-08T11:00:00.000Z');
});

test('subAgentActivity v2 vincula filho antes do turn/started sem thread/started própria', t => {
  const directory=mkdtempSync(path.join(tmpdir(),'wr3d-codex-v2-'));
  const store=new EventStore(path.join(directory,'events.db'));
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\p'});
  const filePath=path.join(directory,'codex.jsonl');
  const collector=new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'0.166.0',provider:'codex',projectId:'p',accountRef:'lab',filePath}]);
  const line=(value:unknown)=>`${JSON.stringify(sanitizeSourceRecord('codex',value))}\n`;
  writeFileSync(filePath,line({method:'thread/started',params:{thread:{id:'parent',cwd:'C:\\repo\\p'}}})+
    line({method:'item/started',params:{threadId:'parent',item:{type:'subAgentActivity',id:'spawn',kind:'started',agentThreadId:'child',agentPath:'privado'}}})+
    line({method:'item/completed',params:{threadId:'parent',item:{type:'subAgentActivity',id:'spawn',kind:'started',agentThreadId:'child',agentPath:'privado'}}})+
    line({method:'turn/started',params:{threadId:'child',turn:{id:'turn-child'}}}));
  collector.poll();
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'atual');
  assert.equal((store.snapshot().sessions as unknown[]).length,2);
  const agents=store.snapshot().agents as {agentKey:string;sessionKey:string;parentAgentKey?:string;parentStatus:string}[];
  assert.equal(agents.length,2);
  const child=agents.find(agent=>agent.parentStatus==='vinculado')!;
  assert.ok(agents.some(agent=>agent.agentKey===child.parentAgentKey&&agent.sessionKey!==child.sessionKey));
  assert.equal((store.snapshot().sessions as {sessionKey:string;presence:string}[]).find(session=>session.sessionKey===child.sessionKey)?.presence,'trabalhando');
});

test('duas fontes, filho, linha parcial, reinício, rotação e perda mantêm identidades', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-sources-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const db = path.join(directory,'events.db');
  const claudeFile = path.join(directory,'claude.jsonl');
  const codexFile = path.join(directory,'codex.jsonl');
  const config = parseSessionSources({schemaVersion:'1.0',projects:[
    {projectId:'p-claude',name:'api',canonicalPath:'C:\\repo\\api'},
    {projectId:'p-codex',name:'api',canonicalPath:'D:\\repo\\api'}
  ],sources:[
    {sourceId:'claude-lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p-claude',accountRef:'lab-claude',filePath:claudeFile},
    {sourceId:'codex-lab',sourceVersion:'0.166.0',provider:'codex',projectId:'p-codex',accountRef:'lab-codex',filePath:codexFile}
  ]});
  let store = new EventStore(db);
  for (const project of config.projects) store.registerProject(project);
  const collector = new SessionFileCollector(store,config.sources);
  const line = (value: object) => `${JSON.stringify(value)}\n`;
  writeFileSync(claudeFile,line(sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'claude-1',cwd:'C:\\repo\\api'})!));
  writeFileSync(codexFile,line(sanitizeSourceRecord('codex',{method:'thread/started',params:{thread:{id:'codex-1',cwd:'D:\\repo\\api'}}})!));
  collector.poll();
  assert.equal((store.snapshot().sessions as unknown[]).length,2);
  appendFileSync(codexFile,line(sanitizeSourceRecord('codex',{method:'thread/started',params:{thread:{id:'codex-1',cwd:'D:\\repo\\api'}}})!));
  collector.poll();
  assert.equal((store.snapshot().sessions as unknown[]).length,2);
  assert.equal((store.snapshot().agents as unknown[]).length,2);
  appendFileSync(codexFile,JSON.stringify({method:'item/completed',params:{threadId:'codex-1',item:{type:'collabAgentToolCall',id:'spawn-1',receiverThreadIds:['child-1']}}}));
  collector.poll();
  assert.equal((store.snapshot().agents as unknown[]).length,2);
  appendFileSync(codexFile,'\n');
  collector.poll();
  const agents = store.snapshot().agents as {agentKey:string;sessionKey:string;parentAgentKey?:string;parentStatus:string}[];
  assert.equal(agents.length,3);
  assert.equal(agents.filter(agent => agent.parentStatus==='vinculado').length,1);
  const child = agents.find(agent => agent.parentStatus==='vinculado')!;
  assert.ok(agents.some(agent => agent.agentKey === child.parentAgentKey && agent.sessionKey !== child.sessionKey));
  appendFileSync(codexFile,line(sanitizeSourceRecord('codex',{method:'thread/started',params:{thread:{id:'child-1',cwd:'D:\\repo\\api'}}})!));
  appendFileSync(codexFile,line(sanitizeSourceRecord('codex',{method:'item/started',params:{threadId:'child-1',item:{type:'commandExecution',id:'child-tool'}}})!));
  collector.poll();
  assert.equal((store.snapshot().agents as unknown[]).length,3);
  assert.equal((store.snapshot().sessions as unknown[]).length,3);
  assert.equal((store.snapshot().invocations as {agentKey:string}[])[0].agentKey,child.agentKey);
  const beforeDuplicateChild = store.snapshot().streamSequence;
  appendFileSync(codexFile,line({method:'item/completed',params:{threadId:'codex-1',item:{type:'collabAgentToolCall',id:'spawn-1',receiverThreadIds:['child-1']}}}));
  collector.poll();
  assert.equal(store.snapshot().streamSequence,beforeDuplicateChild);
  const before = store.snapshot().streamSequence;
  store.close();
  store = new EventStore(db);
  const resumed = new SessionFileCollector(store,config.sources);
  resumed.poll();
  assert.equal(store.snapshot().streamSequence,before);
  renameSync(codexFile,path.join(directory,'codex.old'));
  resumed.poll();
  assert.equal((store.snapshot().sources as {sourceId:string;status:string;errorCode?:string}[]).find(x=>x.sourceId==='codex-lab')?.errorCode,'file_missing');
  assert.equal((store.snapshot().sessions as {projectId:string;presence:string}[]).find(x=>x.projectId==='p-codex')?.presence,'desconhecida');
  writeFileSync(codexFile,line({method:'turn/started',params:{threadId:'codex-1'}}));
  resumed.poll();
  assert.equal((store.snapshot().sources as {sourceId:string;status:string}[]).find(x=>x.sourceId==='codex-lab')?.status,'atual');
  assert.ok((store.snapshot().sessions as {projectId:string;presence:string}[]).some(x=>x.projectId==='p-codex' && x.presence==='trabalhando'));
  store.reconcileSessionSourceBindings(config.sources);
  store.reconcileSessionSourceBindings([config.sources[0]]);
  assert.equal((store.snapshot().sources as {sourceId:string;status:string;errorCode?:string}[]).find(x=>x.sourceId==='codex-lab')?.errorCode,'revoked');
  assert.equal((store.snapshot().sessions as {projectId:string;presence:string}[]).find(x=>x.projectId==='p-codex')?.presence,'desconhecida');
  store.close();
});

test('atividade redigida atravessa arquivo, SQLite, HTTP e sequência SSE', async t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-session-http-'));
  const filePath = path.join(directory,'source.jsonl');
  const store = new EventStore(path.join(directory,'events.db'));
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\projeto'});
  const collector = new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p',accountRef:'lab',filePath}]);
  const token = randomBytes(32).toString('hex');
  const {server,url} = await startReadOnlyServer(store,token);
  t.after(() => { server.closeAllConnections(); server.close(); store.close(); rmSync(directory,{recursive:true,force:true}); });
  writeFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'s',cwd:'C:\\repo\\projeto',prompt:'privado'}))}\n`);
  collector.poll();
  const baseline = store.snapshot().streamSequence as number;
  appendFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'PreToolUse',session_id:'s',cwd:'C:\\repo\\projeto',tool_name:'Skill',tool_use_id:'skill-use',tool_input:{skill:'review',secret:'privado'}}))}\n`);
  collector.poll();
  const headers = {Authorization:`Bearer ${token}`};
  const response = await fetch(`${url}/v1/snapshot`,{headers});
  assert.equal(response.status,200);
  const snapshot = await response.json() as {invocations:{kind:string;name:string;status:string}[];streamSequence:number};
  assert.deepEqual(snapshot.invocations.map(item=>[item.kind,item.name,item.status]),[['skill','review','observada']]);
  assert.equal((store.snapshot().capabilities as string[]).includes('skills'),true);
  assert.equal(snapshot.streamSequence,baseline+1);
  const controller = new AbortController();
  const stream = await fetch(`${url}/v1/events`,{headers:{...headers,'Last-Event-ID':String(baseline)},signal:controller.signal});
  assert.equal(stream.status,200);
  const reader = stream.body!.getReader();
  const frame = new TextDecoder().decode((await reader.read()).value);
  assert.match(frame,/event: event\.changed/);
  assert.match(frame,new RegExp(`id: ${baseline+1}`));
  controller.abort();
  await reader.cancel().catch(()=>{});
});

test('janela de frescor expirada sinaliza incerteza até novo evento', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-stale-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\p'});
  const filePath = path.join(directory,'events.jsonl');
  const collector = new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p',accountRef:'lab',filePath,staleAfterMs:1000}]);
  writeFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'s',cwd:'C:\\repo\\p'}))}\n`);
  collector.poll();
  const observed = store.snapshot().sources as {lastApplied:string}[];
  collector.poll(Date.parse(observed[0].lastApplied)+1001);
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'desconhecida');
  collector.poll();
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'indisponivel');
  assert.equal((store.snapshot().sources as {errorCode:string}[])[0].errorCode,'stale');
  appendFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'UserPromptSubmit',session_id:'s',cwd:'C:\\repo\\p',prompt_id:'p1'}))}\n`);
  collector.poll();
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'trabalhando');
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'atual');
});

test('backfill antigo não renova o frescor pela hora de recebimento', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-backfill-stale-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\p'});
  const filePath = path.join(directory,'events.jsonl');
  const collector = new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p',accountRef:'lab',filePath,staleAfterMs:1000}]);
  const old = new Date(Date.now()-120000).toISOString();
  writeFileSync(filePath,`${JSON.stringify({...sanitizeSourceRecord('claude',{hook_event_name:'UserPromptSubmit',session_id:'s',cwd:'C:\\repo\\p'}),capturedAt:old})}\n`);
  collector.poll();
  const source = (store.snapshot().sources as {lastEvidenceAt:string;lastReceived:string;status:string;errorCode:string}[])[0];
  assert.equal(source.lastEvidenceAt,old);
  assert.ok(Date.parse(source.lastReceived)>Date.parse(old));
  assert.equal(source.status,'indisponivel');
  assert.equal(source.errorCode,'stale');
  assert.equal((store.snapshot().sessions as {presence:string}[])[0].presence,'desconhecida');
});

test('linha malformada após evidência válida mantém erro até evidência posterior', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-malformed-recovery-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'p',name:'Projeto',canonicalPath:'C:\\repo\\p'});
  const filePath = path.join(directory,'events.jsonl');
  const collector = new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'p',accountRef:'lab',filePath}]);
  const line = (hook:string) => `${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:hook,session_id:'s',cwd:'C:\\repo\\p'}))}\n`;
  writeFileSync(filePath,line('SessionStart')+'{inválido}\n');
  collector.poll();
  assert.equal((store.snapshot().sources as {status:string;errorCode:string}[])[0].errorCode,'malformed_json');
  collector.poll();
  assert.equal((store.snapshot().sources as {status:string;errorCode:string}[])[0].status,'indisponivel');
  appendFileSync(filePath,line('UserPromptSubmit'));
  collector.poll();
  assert.equal((store.snapshot().sources as {status:string;errorCode?:string}[])[0].status,'atual');
  assert.equal((store.snapshot().sources as {status:string;errorCode?:string}[])[0].errorCode,undefined);
});

test('hook de projeto homônimo diferente não entra no projeto configurado', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-wrong-project-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  store.registerProject({projectId:'a',name:'api',canonicalPath:'C:\\repo\\api'});
  store.registerProject({projectId:'b',name:'api',canonicalPath:'D:\\repo\\api'});
  const filePath = path.join(directory,'claude.jsonl');
  writeFileSync(filePath,`${JSON.stringify(sanitizeSourceRecord('claude',{hook_event_name:'SessionStart',session_id:'s',cwd:'D:\\repo\\api'}))}\n`);
  new SessionFileCollector(store,[{sourceId:'lab',sourceVersion:'2.1.319',provider:'claude',projectId:'a',accountRef:'lab',filePath}]).poll();
  assert.deepEqual(store.snapshot().sessions,[]);
  assert.equal((store.snapshot().sources as {status:string}[])[0].status,'indisponivel');
  assert.equal((store.snapshot().sources as {errorCode:string}[])[0].errorCode,'invalid_scope');
  const codexFile = path.join(directory,'codex.jsonl');
  writeFileSync(codexFile,`${JSON.stringify(sanitizeSourceRecord('codex',{method:'thread/started',params:{thread:{id:'t',cwd:'D:\\repo\\api'}}}))}\n`);
  new SessionFileCollector(store,[{sourceId:'codex-lab',sourceVersion:'0.166.0',provider:'codex',projectId:'a',accountRef:'lab',filePath:codexFile}]).poll();
  assert.deepEqual(store.snapshot().sessions,[]);
  assert.equal((store.snapshot().sources as {sourceId:string;errorCode?:string}[]).find(x=>x.sourceId==='codex-lab')?.errorCode,'invalid_scope');
});

test('configuração inválida reverte cadastro parcial de projetos', t => {
  const directory = mkdtempSync(path.join(tmpdir(),'wr3d-config-rollback-'));
  const store = new EventStore(path.join(directory,'events.db'));
  t.after(() => { store.close(); rmSync(directory,{recursive:true,force:true}); });
  assert.throws(() => store.configureSessionSources([
    {projectId:'a',name:'api',canonicalPath:'C:\\repo\\same'},
    {projectId:'b',name:'api',canonicalPath:'C:\\repo\\same'}
  ],[]));
  assert.deepEqual(store.snapshot().projects,[]);
});
