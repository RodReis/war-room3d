// Uma sessão nova por --run. Sem a opção, não inicia CLI nem lê sessões.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { SessionFileCollector } from '../src/sessions/file-source.ts';
import { sessionKey } from '../src/domain/identity.ts';

const plan = {provider:'claude',version:'2.1.319',newSession:true,existingSessions:false,
  syntheticPrompt:'WR3D_33_CLAUDE_PERGUNTA. Responda somente WR3D_33_CLAUDE_RESPOSTA.',
  maxBudgetUsd:0.10,timeoutMs:60000,hookScope:'temporary_project_only',
  tools:[],mcpServers:[],automaticRetry:false,sendsRealMessage:process.argv[2]==='--run'};
if (process.argv[2]!=='--run') {
  process.stdout.write(JSON.stringify(plan)+'\n');
} else {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const binary=process.env.WR3D_CLAUDE_CLI_PATH??'claude';
  const version=spawnSync(binary,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:8192});
  if(version.status!==0 || !version.stdout.startsWith(plan.version+' '))throw new Error('provider_version_unverified');
  const project=mkdtempSync(path.join(tmpdir(),'wr3d-33-claude-'));
  const output=path.join(root,'Logs',`issue-33-claude-${randomUUID()}`);
  const spool=path.join(output,'source.jsonl');
  const settingsDir=path.join(project,'.claude');
  const settingsPath=path.join(settingsDir,'settings.local.json');
  const capture=path.join(root,'service','src','sessions','capture-source.ts');
  mkdirSync(output,{recursive:true});mkdirSync(settingsDir,{recursive:true});writeFileSync(spool,'');
  const hookCommand=`node "${capture}" claude "${spool}" --content`;
  writeFileSync(settingsPath,JSON.stringify({hooks:Object.fromEntries(['SessionStart','UserPromptSubmit','Stop']
    .map(event=>[event,[{hooks:[{type:'command',command:hookCommand,timeout:5}]}]]))}));
  const nativeSessionId=randomUUID();
  const report={provider:'claude',version:plan.version,sessionNew:true,hookProjectOnly:true,
    timeoutMs:plan.timeoutMs,budgetUsd:plan.maxBudgetUsd,exitCode:null,timedOut:false,costUsd:null,
    errorKind:null,outputKinds:{},spoolEvents:{},sourceMessages:0,roles:[],roundTrip:false,
    revoked:false,stderrBytes:0};
  const args=['--restricted','--print','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
    '--permission-mode','dontAsk','--permission-prompts','none','--no-session-persistence','--session-id',nativeSessionId,
    '--settings',settingsPath,'--output-format','stream-json','--verbose','--max-budget-usd','0.10',plan.syntheticPrompt];
  let child;
  try {
    child=spawn(binary,args,{cwd:project,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let pending='';
    child.stdout.on('data',chunk=>{
      pending+=chunk.toString('utf8');
      let end;
      while((end=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,end);pending=pending.slice(end+1);
        try{
          const frame=JSON.parse(line);const kind=typeof frame.type==='string'?frame.type:'unknown';
          report.outputKinds[kind]=(report.outputKinds[kind]??0)+1;
          if(kind==='result'){
            report.costUsd=typeof frame.total_cost_usd==='number'?frame.total_cost_usd:null;
            report.errorKind=frame.is_error?(frame.subtype??'result_error'):null;
          }
        }catch{report.outputKinds.invalid=(report.outputKinds.invalid??0)+1;}
      }
    });
    child.stderr.on('data',chunk=>{report.stderrBytes+=chunk.length;});
    const timer=setTimeout(()=>{report.timedOut=true;child.kill();},plan.timeoutMs);
    try{report.exitCode=await new Promise(resolve=>{child.once('exit',resolve);child.once('error',()=>resolve(null));});}
    finally{clearTimeout(timer);}
  } finally {
    rmSync(settingsPath,{force:true});report.revoked=true;
    const source={sourceId:'issue-33-claude-lab',sourceVersion:plan.version,provider:'claude',
      projectId:'issue-33-lab',accountRef:'disposable-33',filePath:spool,
      conversationContent:{consentRef:'issue-33-synthetic-authorization',retentionDays:1}};
    const store=new EventStore(path.join(output,'state.sqlite'));
    try{
      store.registerProject({projectId:source.projectId,name:'Laboratório sintético #33',canonicalPath:project});
      store.reconcileSessionSourceBindings([source]);
      new SessionFileCollector(store,[source]).poll();
      const page=store.conversations.page(source.projectId,sessionKey('claude',source.accountRef,nativeSessionId),null,50);
      report.sourceMessages=page?.items.length??0;
      report.roles=page?.items.map(item=>item.role)??[];
      report.roundTrip=!!page?.items.some(item=>item.role==='user'&&item.content.includes('WR3D_33_CLAUDE_PERGUNTA')) &&
        !!page?.items.some(item=>item.role==='assistant'&&item.content.includes('WR3D_33_CLAUDE_RESPOSTA'));
      for(const line of readFileSync(spool,'utf8').split(/\r?\n/).filter(Boolean)){
        const event=JSON.parse(line).hook_event_name;
        report.spoolEvents[event]=(report.spoolEvents[event]??0)+1;
      }
    }catch(error){report.proofError=error instanceof Error?error.message:'proof_failed';}
    finally{store.close();}
    writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
    process.stdout.write(JSON.stringify({...report,output})+'\n');
    if(!report.roundTrip)process.exitCode=1;
  }
}
