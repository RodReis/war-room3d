// Uma thread nova e descartável. Apenas notificações sanitizadas são persistidas.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCodexOverrides } from './m4-codex-provider-lab.mjs';
import { sanitizeSourceRecord } from '../src/sessions/capture-source.ts';
import { EventStore } from '../src/store/event-store.ts';
import { SessionFileCollector } from '../src/sessions/file-source.ts';
import { sessionKey } from '../src/domain/identity.ts';

if (process.argv.length !== 3 || process.argv[2] !== '--run') {
  process.stdout.write(JSON.stringify({provider:'codex',sendsRealMessage:false,newSession:true,
    existingSessions:false,childAgents:1,syntheticChatOptIn:true,sessionTimeoutMs:60000,
    usage:'node service/scripts/issue-35-codex-lab.mjs --run'})+'\n');
  process.exit(0);
}

const root = fileURLToPath(new URL('../../',import.meta.url));
const project = mkdtempSync(path.join(tmpdir(),'wr3d-35-codex-'));
const output = path.join(root,'Logs',`issue-35-codex-${randomUUID()}`);
const spool = path.join(output,'codex.jsonl');
const binary = process.env.WR3D_CODEX_CLI_PATH ?? path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@openai',
  'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
mkdirSync(output,{recursive:true});
writeFileSync(spool,'');
const report = {provider:'codex',version:'0.166.0',project,output,spool,sessionNew:true,inspectionTimeoutMs:25000,
  sessionTimeoutMs:60000,inventoryCount:null,inspectionStages:[],inspectionTransport:null,inspectionStopped:null,configurationVerified:false,threadStarted:false,turnStarted:false,
  turnCompleted:false,timedOut:false,exitCode:null,notifications:{},childReceivers:0,childActivities:0,
  unhandledRequests:{},failureCode:null,sourceMessages:0,roles:[],roundTrip:false};
let child;
let timer;
let completionPoll;
let pending = new Map();
let mainThreadId = null;
let buffer = '';
let stdoutBytes = 0;
let stderrBytes = 0;
let stderrText = '';
const failPending = () => { for (const reject of pending.values()) reject(new Error('transport_closed')); pending.clear(); };
try {
  const version=spawnSync(binary,['--version'],{cwd:project,windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:8192});
  if(version.status!==0||version.stdout.trim()!==`codex-cli ${report.version}`)throw new Error('provider_version_unverified');
  const listing = spawnSync(binary,['mcp','list','--json'],{cwd:project,windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024});
  if(listing.status!==0||listing.error)throw new Error('inventory_unverified');
  const parsed=JSON.parse(listing.stdout);
  const inventory=(Array.isArray(parsed)?parsed:Object.entries(parsed).map(([name,value])=>({name,...value})))
    .map(item=>({name:item.name,type:item.transport?.type}));
  if(inventory.some(item=>typeof item.name!=='string'||!item.name||item.name.length>128||
    !['stdio','streamable_http'].includes(item.type)))throw new Error('inventory_unverified');
  report.inventoryCount = inventory.length;
  const overrides=[];
  const baseOverrides=buildCodexOverrides([],project);
  for(let index=0;index<baseOverrides.length;index+=2){
    const value=baseOverrides[index+1];
    if(value==='mcp_servers={}')continue;
    overrides.push('-c',value === 'features.multi_agent=false' || value === 'features.multi_agent_v2=false'
      ? value.replace('=false','=true') : value);
  }
  overrides.push('-c','mcp_servers={'+inventory.map(server=>`${JSON.stringify(server.name)}={enabled=false,${server.type==='stdio'
    ? 'command="wr3d-disabled-command"' : 'url="http://127.0.0.1:1"'}}`).join(',')+'}');
  child = spawn(binary,[...overrides,'app-server','--listen','stdio://'],{cwd:project,windowsHide:true,
    env:{...process.env,CODEX_SQLITE_HOME:path.join(project,'state')},stdio:['pipe','pipe','pipe']});
  child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;stderrText+=chunk.toString('utf8');});
  child.stdout.on('data',chunk=>{
    stdoutBytes+=chunk.length;
    buffer+=chunk.toString('utf8');
    let newline;
    while((newline=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
      let frame;
      try{frame=JSON.parse(line);}catch{report.failureCode='invalid_frame';continue;}
      if(typeof frame.method==='string'){
        if(Object.hasOwn(frame,'id')){
          const kind=['account/chatgptAuthTokens/refresh','attestation/generate'].includes(frame.method) ? frame.method : 'other';
          report.unhandledRequests[kind]=(report.unhandledRequests[kind]??0)+1;
        } else {
          report.notifications[frame.method]=(report.notifications[frame.method]??0)+1;
          const safe=sanitizeSourceRecord('codex',frame,true);
          if(safe){
            appendFileSync(spool,JSON.stringify({...safe,capturedAt:safe.capturedAt??new Date().toISOString()})+'\n');
            const receivers=safe.params?.item?.receiverThreadIds;
            if(Array.isArray(receivers)) report.childReceivers+=receivers.length;
            if(safe.params?.item?.type==='subAgentActivity') report.childActivities++;
          }
          if(frame.method==='turn/completed'&&frame.params?.threadId===mainThreadId) report.turnCompleted=true;
        }
      }else if(Object.hasOwn(frame,'id')){
        const resolve=pending.get(frame.id);
        if(resolve){pending.delete(frame.id);resolve(frame);}
      }
    }
  });
  const exited=new Promise(resolve=>{child.once('exit',code=>{failPending();resolve(code);});child.once('error',()=>{failPending();resolve(null);});});
  timer=setTimeout(()=>{report.timedOut=true;child.kill();failPending();},60000);
  let sequence=0;
  const rpc=async(method,params)=>{
    report.lastRpc=method;
    const id=`m1-${++sequence}`;
    const reply=await Promise.race([new Promise((resolve,reject)=>{
      pending.set(id,resolve);
      child.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error){pending.delete(id);reject(error);}});
    }),new Promise((_,reject)=>setTimeout(()=>reject(new Error('rpc_timeout')),25000))]);
    if(reply?.error||!reply?.result)throw new Error('rpc_rejected');
    return reply.result;
  };
  await rpc('initialize',{clientInfo:{name:'war-room3d-35-lab',version:'1.0.0'}});
  child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
  const {config}=await rpc('config/read',{cwd:project,includeLayers:false});
  const checks={approval:config?.approval_policy==='never',sandbox:config?.sandbox_mode==='read-only',
    multiAgent:config?.features?.multi_agent===true,multiAgentV2:config?.features?.multi_agent_v2===true,
    shell:config?.features?.shell_tool===false,projectDocs:config?.project_doc_max_bytes===0,
    developerInstructions:config?.developer_instructions==='',history:config?.history?.persistence==='none',
    mcp:config?.mcp_servers&&Object.values(config.mcp_servers).every(server=>server?.enabled===false)};
  report.failedIsolationChecks=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);
  if(report.failedIsolationChecks.length)throw new Error('isolation_unverified');
  report.configurationVerified=true;
  const thread=await rpc('thread/start',{cwd:project,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',
    developerInstructions:'Laboratório sintético #35 com conteúdo de chat autorizado. Não leia arquivos, não use shell nem rede. Inicie exatamente um subagente para responder WR3D_35_CHILD_ACK. O agente principal deve responder WR3D_35_MAIN_ACK.'});
  if(path.resolve(thread.cwd??'')!==path.resolve(project)||thread.approvalPolicy!=='never'||
    thread.sandbox?.type!=='readOnly'||!thread.thread?.id||!Array.isArray(thread.instructionSources)||
    thread.instructionSources.some(source=>!['AGENTS.md','AGENTS.override.md'].map(name=>
      path.resolve(process.env.CODEX_HOME??path.join(homedir(),'.codex'),name).toLowerCase()).includes(path.resolve(source).toLowerCase())))
    throw new Error('thread_scope_unverified');
  report.threadStarted=true;
  mainThreadId=thread.thread.id;
  const turn=await rpc('turn/start',{threadId:thread.thread.id,input:[{type:'text',text:
    'WR3D_35_CODEX_PERGUNTA. Ensaio sintético. Use spawn_agent exatamente uma vez com fork_turns="none" para criar um subagente real sem herdar o histórico. Peça WR3D_35_CHILD_ACK e aguarde o filho. Responda WR3D_35_MAIN_ACK. Não use outras ferramentas. Se spawn_agent falhar, informe a falha sem nova tentativa.'}],clientUserMessageId:randomUUID()});
  if(!turn.turn?.id)throw new Error('turn_unconfirmed');
  report.turnStarted=true;
  await Promise.race([new Promise(resolve=>{completionPoll=setInterval(()=>{if(report.turnCompleted){clearInterval(completionPoll);resolve();}},100);}),exited]);
  report.exitCode=child.exitCode;
  if(report.childActivities===0 && report.childReceivers===0) report.failureCode='child_not_observed';
  const source={sourceId:'issue-35-codex-lab',sourceVersion:report.version,provider:'codex',
    projectId:'issue-35-lab',accountRef:'disposable-35',filePath:spool,
    conversationContent:{consentRef:'issue-35-synthetic-authorization',retentionDays:1}};
  const store=new EventStore(path.join(output,'state.sqlite'));
  try{
    store.registerProject({projectId:source.projectId,name:'Laboratório sintético #35',canonicalPath:project});
    store.reconcileSessionSourceBindings([source]);
    new SessionFileCollector(store,[source]).poll();
    const page=store.conversations.page(source.projectId,sessionKey('codex',source.accountRef,mainThreadId),null,50);
    report.sourceMessages=page?.items.length??0;
    report.roles=page?.items.map(item=>item.role)??[];
    report.roundTrip=!!page?.items.some(item=>item.role==='user'&&item.content.includes('WR3D_35_CODEX_PERGUNTA'))&&
      !!page?.items.some(item=>item.role==='assistant'&&item.content.includes('WR3D_35_MAIN_ACK'));
  }finally{store.close();}
}catch(error){report.failureCode=error?.message??'lab_failed';}
finally{
  if(timer)clearTimeout(timer);
  if(completionPoll)clearInterval(completionPoll);
  if(child){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{child.once('exit',resolve);setTimeout(resolve,5000);}});}
  report.stdoutBytes=stdoutBytes;report.stderrBytes=stderrBytes;
  report.stderrCode=/invalid transport/i.test(stderrText)?'invalid_transport':
    /unrecognized configuration/i.test(stderrText)?'unrecognized_configuration':stderrBytes?'diagnostic':'none';
  writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
  process.stdout.write(JSON.stringify(report)+'\n');
  if(!report.configurationVerified||!report.turnCompleted||!report.roundTrip||
    report.childActivities===0&&report.childReceivers===0)process.exitCode=1;
}
