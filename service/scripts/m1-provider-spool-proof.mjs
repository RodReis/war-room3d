// Reproduz o trajeto de dois spools reais autorizados, sem reler transcrições.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { SessionFileCollector } from '../src/sessions/file-source.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const expectChild=process.argv.includes('--expect-child');
const [claudePath,codexPath,playerPath] = process.argv.slice(2).filter(arg=>arg!=='--expect-child');
if(!claudePath||!codexPath)throw new Error('Informe os dois result.json do laboratório');
const claude=JSON.parse(readFileSync(claudePath,'utf8'));
const codex=JSON.parse(readFileSync(codexPath,'utf8'));
if(claude.provider!=='claude'||codex.provider!=='codex'||!claude.project||!codex.project||
  !existsSync(claude.spool)||!existsSync(codex.spool))throw new Error('Spool real autorizado não encontrado');
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'Logs',`issue-31-spool-proof-${randomUUID()}`);
mkdirSync(output,{recursive:true});
const store=new EventStore(path.join(output,'events.sqlite'));
const projects=[{projectId:'lab-claude',name:'Laboratório',canonicalPath:claude.project},
  {projectId:'lab-codex',name:'Laboratório',canonicalPath:codex.project}];
const sources=[{sourceId:'claude-lab',sourceVersion:claude.version,provider:'claude',projectId:'lab-claude',
  accountRef:'lab-claude',filePath:claude.spool,staleAfterMs:900000},
  {sourceId:'codex-lab',sourceVersion:codex.version,provider:'codex',projectId:'lab-codex',
  accountRef:'lab-codex',filePath:codex.spool,staleAfterMs:900000}];
let server;
let player;
try{
  store.configureSessionSources(projects,sources);
  const collector=new SessionFileCollector(store,sources);
  collector.poll();
  const token=randomBytes(32).toString('hex');
  const started=await startReadOnlyServer(store,token);
  server=started.server;
  const response=await fetch(`${started.url}/v1/snapshot`,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(response.status,200);
  const snapshot=await response.json();
  assert.equal(snapshot.sessions.length,expectChild?3:2);
  assert.deepEqual(new Set(snapshot.sessions.map(session=>session.projectId)),new Set(['lab-claude','lab-codex']));
  const children=snapshot.agents.filter(agent=>agent.parentAgentKey);
  if(expectChild){
    assert.equal(snapshot.agents.length,3);
    assert.equal(children.length,1);
    const child=children[0];
    const parent=snapshot.agents.find(agent=>agent.agentKey===child.parentAgentKey);
    assert.ok(parent);
    assert.notEqual(parent.sessionKey,child.sessionKey);
    assert.equal(child.parentStatus,'vinculado');
    assert.equal(child.presence,'encerrada');
    assert.equal(snapshot.sessions.find(session=>session.sessionKey===parent.sessionKey)?.projectId,'lab-codex');
    assert.equal(snapshot.sessions.find(session=>session.sessionKey===child.sessionKey)?.projectId,'lab-codex');
  }
  const stream=await fetch(`${started.url}/v1/events`,{headers:{Authorization:`Bearer ${token}`,'Last-Event-ID':'0'}});
  assert.equal(stream.status,200);
  const reader=stream.body.getReader();
  const first=new TextDecoder().decode((await reader.read()).value);
  assert.match(first,/event: event\.changed/);
  await reader.cancel().catch(()=>{});
  const summary={output,providers:['claude','codex'],projectNames:snapshot.projects.map(project=>project.name),
    sessionCount:snapshot.sessions.length,agentCount:snapshot.agents.length,linkedChildCount:children.filter(agent=>agent.parentStatus==='vinculado').length,
    endedChildCount:children.filter(agent=>agent.presence==='encerrada').length,taskCount:snapshot.tasks.length,
    invocationCount:snapshot.invocations.length,sourceStatus:snapshot.sources.map(source=>({sourceId:source.sourceId,
      status:source.status,errorCode:source.errorCode??null,lastEvidenceAt:source.lastEvidenceAt})),
    streamSequence:snapshot.streamSequence,httpStatus:response.status,sseEvent:true};
  if(playerPath){
    if(!existsSync(playerPath))throw new Error('Player Windows não encontrado');
    const captureDir=path.join(output,'player');
    mkdirSync(captureDir,{recursive:true});
    const status=await new Promise(resolve=>{
      player=spawn(playerPath,['-screen-width','1280','-screen-height','720','-logFile',path.join(output,'player.log')],{
        stdio:'ignore',env:{...process.env,WR3D_SERVICE_URL:started.url,WR3D_SERVICE_TOKEN:token,
          WR3D_VALIDATION_CAPTURE_DIR:captureDir,WR3D_VALIDATION_CAPTURE_NAME:'issue31-real',WR3D_VALIDATION_VIEW:'project'}});
      const timer=setTimeout(()=>{player.kill();resolve({event:'timeout'});},60000);
      player.once('exit',(code,signal)=>{clearTimeout(timer);resolve({event:'exit',code,signal});});
      player.once('error',error=>{clearTimeout(timer);resolve({event:'spawn_error',code:error.code});});
    });
    const reportPath=path.join(captureDir,'issue31-real.json');
    summary.player={status,report:existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):null,
      imageExists:existsSync(path.join(captureDir,'issue31-real.png'))};
    writeFileSync(path.join(output,'result.json'),JSON.stringify(summary,null,2));
    assert.equal(status.event,'exit');
    assert.equal(status.code,0);
    assert.equal(summary.player.report?.connected,true);
    assert.equal(summary.player.report?.sessionCount,expectChild?3:2);
    if(expectChild){
      assert.equal(summary.player.report?.agentCount,3);
      assert.equal(summary.player.report?.linkedChildCount,1);
    }
    assert.equal(summary.player.imageExists,true);
  }
  writeFileSync(path.join(output,'result.json'),JSON.stringify(summary,null,2));
  process.stdout.write(JSON.stringify(summary)+'\n');
}finally{
  if(player&&player.exitCode===null)player.kill();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  store.close();
}
