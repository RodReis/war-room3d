import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const captureDir=process.argv[2] ?? fileURLToPath(new URL('../../Logs/issue-33-player-proof/',import.meta.url));
const player=process.env.WR3D_PLAYER_PATH ?? fileURLToPath(new URL('../../unity/Builds/WarRoom3D-M2-Live/WarRoom3D.exe',import.meta.url));
const name='issue-33-chat';
const imagePath=path.join(captureDir,`${name}.png`),reportPath=path.join(captureDir,`${name}.json`);
if(existsSync(imagePath)||existsSync(reportPath))throw new Error('Prova anterior existe; escolha outro diretório');
mkdirSync(captureDir,{recursive:true});
const store=new EventStore(':memory:');
let server,child,timer;
try {
  for(let i=1;i<=3;i++)store.registerProject({projectId:`p${i}`,name:i===3?'Sala sintética':`Projeto sintético ${i}`,
    canonicalPath:`C:/synthetic/p${i}`});
  let serial=0;
  const apply=(type,provider,sessionKey,agentKey,payload={})=>{
    serial++;
    const at=new Date(Date.now()+serial).toISOString();
    const event={schemaVersion:'1.0',eventId:`synthetic-${serial}`,sourceId:`source-${provider}`,sourceEventId:`synthetic-${serial}`,
      sourceVersion:'fixture-33',type,observedAt:at,receivedAt:at,projectId:'p3',provider,sessionKey,
      ...(agentKey?{agentKey}:{}),provenance:'observed',ingestionMode:'live',payload,evidenceRefs:[]};
    store.apply(event,{sourceId:event.sourceId,fileKey:'synthetic.jsonl',generation:0,offset:serial});
  };
  apply('session.observed','codex','session-parent');
  apply('agent.observed','codex','session-parent','agent-parent');
  apply('session.working','codex','session-parent');
  apply('session.observed','codex','session-child');
  apply('agent.observed','codex','session-child','agent-child',{parentAgentKey:'agent-parent'});
  apply('session.working','codex','session-child');
  apply('session.observed','claude','session-claude');
  apply('agent.observed','claude','session-claude','agent-claude');
  apply('session.waiting','claude','session-claude');
  const at=new Date().toISOString();
  const record=(messageId,sessionKey,provider,role,content,turnRef)=>store.conversations.record({messageId,projectId:'p3',
    sessionKey,sourceId:`source-${provider}`,provider,role,content,observedAt:at,receivedAt:at,nativeRef:messageId,
    turnRef,consentRef:'synthetic-proof-33',retentionDays:1,truncated:false});
  record('msg-child-user','session-child','codex','user','Pergunta sintética: qual é o estado da sala?','turn-synthetic-1');
  record('msg-child-assistant','session-child','codex','assistant','Resposta sintética: três agentes observados.','turn-synthetic-1');
  record('msg-other','session-claude','claude','assistant','Esta mensagem pertence a outra sessão.','turn-other');
  const token=randomBytes(32).toString('hex');
  const started=await startReadOnlyServer(store,token);server=started.server;
  const page=await (await fetch(started.url+'/v1/conversations?projectId=p3&sessionKey=session-child&limit=20',
    {headers:{Authorization:`Bearer ${token}`}})).json();
  if(page.items.length!==2 || page.items.some(item=>item.sessionKey!=='session-child'))throw new Error('Isolamento de chat sintético falhou');
  const outcome=new Promise(resolve=>{
    child=spawn(player,['-screen-width','1280','-screen-height','720','-logFile','-'],{
      env:{...process.env,WR3D_SERVICE_URL:started.url,WR3D_SERVICE_TOKEN:token,
        WR3D_VALIDATION_CAPTURE_DIR:captureDir,WR3D_VALIDATION_CAPTURE_NAME:name,WR3D_VALIDATION_VIEW:'chat',
        WR3D_VALIDATION_PROJECT_ID:'p3',WR3D_VALIDATION_AGENT_KEY:'agent-child'},stdio:'ignore'});
    child.on('error',error=>resolve({kind:'spawn_error',code:error.code}));
    child.on('exit',(code,signal)=>resolve({kind:'exit',code,signal}));
    timer=setTimeout(()=>resolve({kind:'timeout'}),45000);
  });
  const status=await outcome;
  const report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):null;
  const result={status,imageExists:existsSync(imagePath),sourceMessages:3,pageMessages:page.items.length,report};
  console.log(JSON.stringify(result));
  if(status.kind!=='exit'||status.code!==0||!result.imageExists||!report?.connected||report.view!=='chat'||
    report.selectedAgentKey!=='agent-child'||report.chatSessionKey!=='session-child'||report.chatMessageCount!==2||report.avatarCount!==3)
    process.exitCode=1;
} finally {
  if(timer)clearTimeout(timer);
  if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,3000);});}
  if(server)await new Promise(resolve=>server.close(resolve));
  store.close();
}
