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
  syntheticPrompt:'/wr3d-35:synthetic WR3D_35_CLAUDE_PERGUNTA',
  maxBudgetUsd:0.10,timeoutMs:60000,hookScope:'temporary_project_only',
  tools:['Skill'],mcpServers:[],automaticRetry:false,skillInvocation:'temporary-plugin-slash',
  sendsRealMessage:process.argv[2]==='--run'};
if (process.argv[2]!=='--run') {
  process.stdout.write(JSON.stringify(plan)+'\n');
} else {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const binary=process.env.WR3D_CLAUDE_CLI_PATH??'claude';
  const version=spawnSync(binary,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:8192});
  if(version.status!==0 || !version.stdout.startsWith(plan.version+' '))throw new Error('provider_version_unverified');
  const project=mkdtempSync(path.join(tmpdir(),'wr3d-35-claude-'));
  const output=path.join(root,'Logs',`issue-35-claude-${randomUUID()}`);
  const spool=path.join(output,'source.jsonl');
  const settingsDir=path.join(project,'.claude');
  const settingsPath=path.join(settingsDir,'settings.local.json');
  const pluginDir=path.join(project,'plugin');
  const skillDir=path.join(pluginDir,'skills','synthetic');
  const manifestDir=path.join(pluginDir,'.claude-plugin');
  const capture=path.join(root,'service','src','sessions','capture-source.ts');
  mkdirSync(output,{recursive:true});mkdirSync(settingsDir,{recursive:true});
  mkdirSync(skillDir,{recursive:true});mkdirSync(manifestDir,{recursive:true});writeFileSync(spool,'');
  writeFileSync(path.join(manifestDir,'plugin.json'),JSON.stringify({name:'wr3d-35',
    description:'Laboratório sintético descartável da issue 35',version:'1.0.0'}));
  const skillMarker=`WR3D_35_SKILL_${randomUUID().replaceAll('-','').toUpperCase()}`;
  writeFileSync(path.join(skillDir,'SKILL.md'),'---\nname: synthetic\ndescription: Skill de laboratório sintético da issue 35\ndisable-model-invocation: true\n---\nResponda WR3D_35_CLAUDE_RESPOSTA e '+skillMarker+'. Não leia arquivos nem use ferramentas.\n');
  const validation=spawnSync(binary,['plugin','validate',pluginDir],
    {encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:16384});
  if(validation.status!==0 || !validation.stdout.includes('Validation passed')){
    if(!path.resolve(project).startsWith(path.resolve(tmpdir())+path.sep))throw new Error('temporary_target_invalid');
    rmSync(project,{recursive:true,force:true});
    throw new Error('temporary_plugin_validation_failed: '+validation.stdout+' '+validation.stderr);
  }
  const hookCommand=`node "${capture}" claude "${spool}" --content`;
  writeFileSync(settingsPath,JSON.stringify({hooks:Object.fromEntries(['SessionStart','UserPromptSubmit','UserPromptExpansion','PreToolUse','PostToolUse','Stop']
    .map(event=>[event,[{hooks:[{type:'command',command:hookCommand,timeout:5}]}]]))}));
  const nativeSessionId=randomUUID();
  const report={provider:'claude',version:plan.version,project,output,spool,sessionNew:true,hookProjectOnly:true,
    timeoutMs:plan.timeoutMs,budgetUsd:plan.maxBudgetUsd,exitCode:null,timedOut:false,costUsd:null,
    errorKind:null,outputKinds:{},spoolEvents:{},sourceMessages:0,roles:[],roundTrip:false,
    skillHookObserved:false,skillExpansionObserved:false,skillEventInService:false,
    skillBodyObserved:false,skillObserved:false,pluginValidated:true,
    revoked:false,stderrBytes:0};
  const args=['--restricted','--print','--tools','Skill','--plugin-dir',pluginDir,
    '--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
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
    rmSync(settingsPath,{force:true});rmSync(pluginDir,{recursive:true,force:true});report.revoked=true;
    const source={sourceId:'issue-35-claude-lab',sourceVersion:plan.version,provider:'claude',
      projectId:'issue-35-lab',accountRef:'disposable-35',filePath:spool,
      skillCommands:['wr3d-35:synthetic'],
      conversationContent:{consentRef:'issue-35-synthetic-authorization',retentionDays:1}};
    const store=new EventStore(path.join(output,'state.sqlite'));
    try{
      store.registerProject({projectId:source.projectId,name:'Laboratório sintético #35',canonicalPath:project});
      store.reconcileSessionSourceBindings([source]);
      new SessionFileCollector(store,[source]).poll();
      const page=store.conversations.page(source.projectId,sessionKey('claude',source.accountRef,nativeSessionId),null,50);
      report.sourceMessages=page?.items.length??0;
      report.roles=page?.items.map(item=>item.role)??[];
      report.roundTrip=!!page?.items.some(item=>item.role==='user'&&item.content.includes('WR3D_35_CLAUDE_PERGUNTA')) &&
        !!page?.items.some(item=>item.role==='assistant'&&item.content.includes('WR3D_35_CLAUDE_RESPOSTA'));
      report.skillBodyObserved=!!page?.items.some(item=>item.role==='assistant'&&item.content.includes(skillMarker));
      report.skillEventInService=store.snapshot().invocations.some(item=>item.kind==='skill'&&item.name==='wr3d-35:synthetic');
      for(const line of readFileSync(spool,'utf8').split(/\r?\n/).filter(Boolean)){
        const entry=JSON.parse(line);
        const event=entry.hook_event_name;
        report.spoolEvents[event]=(report.spoolEvents[event]??0)+1;
        if(event==='PreToolUse'&&entry.tool_name==='Skill')report.skillHookObserved=true;
        if(event==='UserPromptExpansion'&&entry.expansion_type==='slash_command'&&entry.command_name==='wr3d-35:synthetic')report.skillExpansionObserved=true;
      }
      report.skillObserved=report.skillEventInService&&report.skillBodyObserved;
    }catch(error){report.proofError=error instanceof Error?error.message:'proof_failed';}
    finally{store.close();}
    writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
    process.stdout.write(JSON.stringify({...report,output})+'\n');
    if(!path.resolve(project).startsWith(path.resolve(tmpdir())+path.sep))throw new Error('temporary_target_invalid');
    rmSync(project,{recursive:true,force:true});
    if(!report.roundTrip||!report.skillObserved)process.exitCode=1;
  }
}
