// Uma thread nova por --run. Sem a opção, não inicia CLI nem lê sessões.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCodexOverrides, inspectCodexConfig, runCodexLabSession, usingCodexAppServer } from './m4-codex-provider-lab.mjs';
import { sanitizeSourceRecord } from '../src/sessions/capture-source.ts';
import { EventStore } from '../src/store/event-store.ts';
import { SessionFileCollector } from '../src/sessions/file-source.ts';

const plan={provider:'codex',version:'0.166.0',newSession:true,existingSessions:false,
  syntheticPrompt:'Teste sintético War-Room3D M4. Não use ferramentas. Responda somente WR3D_M4_ACK.',
  inspectionTimeoutMs:30000,sessionTimeoutMs:45000,mcpServers:'disabled_after_inventory',
  sandbox:'read-only',approvalPolicy:'never',automaticRetry:false,
  monetaryCap:'unverified_uses_current_quota',sendsRealMessage:process.argv[2]==='--run'};
if(process.argv[2]!=='--run'){
  process.stdout.write(JSON.stringify(plan)+'\n');
}else{
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const binary=process.env.WR3D_CODEX_CLI_PATH??path.join(process.env.APPDATA??'','npm','node_modules','@openai',
    'codex','node_modules','@openai','codex-win32-x64','vendor','x86_64-pc-windows-msvc','bin','codex.exe');
  const project=mkdtempSync(path.join(tmpdir(),'wr3d-33-codex-'));
  const output=path.join(root,'Logs',`issue-33-codex-${randomUUID()}`);
  const spool=path.join(output,'source.jsonl');
  mkdirSync(output,{recursive:true});writeFileSync(spool,'');
  const report={provider:'codex',version:plan.version,sessionNew:true,inspectionStopped:null,
    sessionStopped:null,inventoryCount:null,configVerified:false,receipt:'not_sent',turnCompleted:false,
    sourceMessages:0,roles:[],roundTrip:false,notifications:{},stdoutBytes:0,stderrBytes:0,failureCode:null};
  let completed,resolveCompleted;
  let buffer='';
  const observer=(command,args,options)=>{
    const child=spawn(command,args,options);
    child.stdout.on('data',chunk=>{
      buffer+=chunk.toString('utf8');
      if(buffer.length>2*1024*1024){report.failureCode='frame_limit';buffer='';return;}
      let end;
      while((end=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
        try{
          const frame=JSON.parse(line);
          if(typeof frame.method!=='string'||Object.hasOwn(frame,'id'))continue;
          report.notifications[frame.method]=(report.notifications[frame.method]??0)+1;
          const safe=sanitizeSourceRecord('codex',frame,true);
          if(safe)appendFileSync(spool,JSON.stringify({...safe,capturedAt:safe.capturedAt??new Date().toISOString()})+'\n');
          if(frame.method==='turn/completed'){
            report.turnCompleted=true;
            resolveCompleted?.();
          }
        }catch{report.failureCode='invalid_frame';}
      }
    });
    return child;
  };
  try{
    const version=spawnSync(binary,['--version'],{cwd:project,windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:8192});
    if(version.status!==0 || version.stdout.trim()!=='codex-cli '+plan.version)throw new Error('provider_version_unverified');
    const inventory=await usingCodexAppServer({binary,overrides:buildCodexOverrides([],project),cwd:project,
      timeoutMs:plan.inspectionTimeoutMs,onStopped:value=>{report.inspectionStopped=value;},
      onDiagnostics:value=>{report.stdoutBytes+=value.stdoutBytes;report.stderrBytes+=value.stderrBytes;}},
      options=>inspectCodexConfig(options));
    report.inventoryCount=inventory.length;
    completed=new Promise(resolve=>{resolveCompleted=resolve;});
    const nativeHome=process.env.CODEX_HOME??path.join(homedir(),'.codex');
    const trustedInstructionSources=['AGENTS.md','AGENTS.override.md'].map(name=>path.resolve(nativeHome,name));
    const result=await usingCodexAppServer({binary,overrides:buildCodexOverrides(inventory,project),cwd:project,
      timeoutMs:plan.sessionTimeoutMs,onStopped:value=>{report.sessionStopped=value;},
      onDiagnostics:value=>{report.stdoutBytes+=value.stdoutBytes;report.stderrBytes+=value.stderrBytes;}},async options=>{
      const sent=await runCodexLabSession({...options,audit:()=>{},trustedInstructionSources});
      if(sent.state==='confirmed')await Promise.race([completed,new Promise(resolve=>{
        if(options.signal.aborted)resolve();
        else options.signal.addEventListener('abort',resolve,{once:true});
      })]);
      return sent;
    },observer);
    report.configVerified=true;
    report.receipt=result.state;
    const source={sourceId:'issue-33-codex-lab',sourceVersion:plan.version,provider:'codex',
      projectId:'issue-33-lab',accountRef:'authorized-local-cli',filePath:spool,
      conversationContent:{consentRef:'issue-33-synthetic-authorization',retentionDays:1}};
    const store=new EventStore(path.join(output,'state.sqlite'));
    try{
      store.registerProject({projectId:source.projectId,name:'Laboratório sintético #33',canonicalPath:project});
      store.reconcileSessionSourceBindings([source]);
      new SessionFileCollector(store,[source]).poll();
      const page=store.conversations.page(source.projectId,result.sessionKey,null,50);
      report.sourceMessages=page?.items.length??0;
      report.roles=page?.items.map(item=>item.role)??[];
      report.roundTrip=!!page?.items.some(item=>item.role==='user'&&item.content.includes('WR3D_M4_ACK')) &&
        !!page?.items.some(item=>item.role==='assistant'&&item.content.includes('WR3D_M4_ACK'));
    }finally{store.close();}
  }catch(error){report.failureCode=error instanceof Error?error.message:'lab_failed';}
  writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
  process.stdout.write(JSON.stringify({...report,output})+'\n');
  if(!report.roundTrip)process.exitCode=1;
}
