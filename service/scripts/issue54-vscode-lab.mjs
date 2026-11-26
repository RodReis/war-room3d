import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EventStore} from '../src/store/event-store.ts';
import {startReadOnlyServer} from '../src/http/server.ts';
import {parseWorkspaceConfig,WorkspaceFileCollector} from '../src/sessions/workspace-source.ts';

const root=fileURLToPath(new URL('../../',import.meta.url)),output=process.argv[2],mode=process.argv[3] ?? 'lifecycle';
if(!output || !path.isAbsolute(output) || existsSync(output) || !['lifecycle','shutdown','untrusted'].includes(mode))throw new Error('Pasta nova absoluta e modo do laboratório obrigatórios');
const code=process.env.WR3D_VSCODE_EXE;
if(!code || !path.isAbsolute(code) || !statSync(code).isFile())throw new Error('WR3D_VSCODE_EXE absoluto obrigatório');
mkdirSync(output,{recursive:true});
const projects=['a','b'].map(id=>({projectId:'lab-'+id,name:'API · laboratório',canonicalPath:path.join(output,'projects',id,'api')}));
for(const project of projects)mkdirSync(project.canonicalPath,{recursive:true});
const authorization={schemaVersion:'1.0',vscodeVersion:'1.148.0',projects,
  sources:projects.map(project=>({sourceId:'vscode-'+project.projectId,projectId:project.projectId,directory:path.join(output,'spool',project.projectId)}))};
const config=parseWorkspaceConfig(authorization);
writeFileSync(path.join(output,'authorization.json'),JSON.stringify(authorization));
const workspace=path.join(output,'laboratorio.code-workspace');
writeFileSync(workspace,JSON.stringify({folders:projects.map(project=>({path:project.canonicalPath,name:'API'}))}));
const store=new EventStore(path.join(output,'state.sqlite'));
store.configureSessionSources(projects,[{sourceId:'synthetic-agent-source',sourceVersion:'fixture-54',provider:'claude',projectId:'lab-b',accountRef:'synthetic',filePath:path.join(output,'synthetic-unused.jsonl')}]);
store.configureWorkspaceSources(config.projects,config.sources);
const collector=new WorkspaceFileCollector(store,config),token=randomBytes(32).toString('hex');
const service=await startReadOnlyServer(store,token);
writeFileSync(path.join(output,'service.local.json'),JSON.stringify({url:service.url,token}),{mode:0o600});
const changes=[],delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let child,closed=false,childCode=null,agentSeq=0,slotA;
let playerProof;
const capturePlayer=async()=>{
  const player=process.env.WR3D_PLAYER_PATH;
  if(!player)return;
  const captures=path.join(output,'player');mkdirSync(captures);
  const playerEnv={...process.env,WR3D_SERVICE_URL:service.url,WR3D_SERVICE_TOKEN:token,WR3D_COMMAND_TOKEN:'',
    WR3D_VALIDATION_CAPTURE_DIR:captures,WR3D_VALIDATION_CAPTURE_NAME:'workspaces',WR3D_VALIDATION_VIEW:'project',WR3D_VALIDATION_DURATION_SECONDS:'5'};
  const app=spawn(player,['-screen-fullscreen','0','-screen-width','1920','-screen-height','1080','-force-d3d11','-logFile',path.join(captures,'player.log')],{env:playerEnv,stdio:'ignore'});
  const pollTimer=setInterval(()=>collector.poll(),200);
  let deadline;
  try {
    const code=await Promise.race([new Promise((resolve,reject)=>{app.once('error',reject);app.once('exit',resolve);}),
      new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Player excedeu prazo')),45000);})]);
    assert.equal(code,0);
    const report=JSON.parse(readFileSync(path.join(captures,'workspaces.json'),'utf8'));
    assert.equal(report.connected,true);assert.equal(report.sessionCount,0);assert.equal(report.agentCount,0);assert.equal(report.avatarCount,0);
    playerProof={connected:true,sessions:0,agents:0,avatars:0,width:report.imageWidth,height:report.imageHeight,
      playerSha256:createHash('sha256').update(readFileSync(player)).digest('hex'),
      runtimeSha256:createHash('sha256').update(readFileSync(path.join(path.dirname(player),'WarRoom3D_Data/Managed/WarRoom3D.Runtime.dll'))).digest('hex')};
  } finally {clearInterval(pollTimer);clearTimeout(deadline);if(app.exitCode===null)app.kill();}
};
const agent=type=>{
  const at=new Date().toISOString(),sequence=++agentSeq;
  store.apply({schemaVersion:'1.0',eventId:'synthetic-'+sequence,sourceEventId:'synthetic-'+sequence,sourceId:'synthetic-agent-source',sourceVersion:'fixture-54',
    type,projectId:'lab-b',provider:'claude',sessionKey:'synthetic-session',observedAt:at,receivedAt:at,provenance:'observed',ingestionMode:'live',payload:{},evidenceRefs:[]},
    {sourceId:'synthetic-agent-source',fileKey:'synthetic',generation:0,offset:sequence});
};
const snapshot=async()=>{collector.poll();const response=await fetch(service.url+'/v1/snapshot',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);return response.json();};
const withinLab=p=>{if(!path.resolve(p).startsWith(path.resolve(output)+path.sep))throw new Error('Alvo fora do laboratório');return p;};
try {
  const args=[workspace,'--new-window','--skip-welcome','--skip-release-notes','--user-data-dir='+path.join(output,'profile'),
    '--extensions-dir='+path.join(output,'extensions'),'--extensionDevelopmentPath='+path.join(root,'integrations/vscode-workspaces'),
    '--extensionTestsPath='+path.join(root,'integrations/vscode-workspaces/test/native.cjs')];
  // Cenário de teste oficial para trusted; perfil descartável. O negativo mantém trust habilitado.
  if(mode!=='untrusted')args.push('--disable-workspace-trust');
  const childEnv={...process.env,WR3D_WORKSPACE_LAB_DIR:output,WR3D_WORKSPACE_LAB_MODE:mode};
  delete childEnv.ELECTRON_RUN_AS_NODE;
  child=spawn(code,args,{env:childEnv,stdio:['ignore','pipe','pipe']});
  const stdout=[];child.stdout.on('data',chunk=>stdout.push(chunk));child.stderr.on('data',chunk=>stdout.push(chunk));
  child.on('exit',code=>{closed=true;childCode=code;});
  let previous='',waitingSince=Date.now(),paused=false;
  while(!closed && Date.now()-waitingSince<90000) {
    collector.poll();
    let point;try{point=JSON.parse(readFileSync(path.join(output,'checkpoint.json'),'utf8'));}catch{}
    if(point && point.phase!==previous) {
      const phase=point.phase;
      if(phase==='transport-loss' && !paused) {
        const spool=withinLab(config.sources[0].directory);
        renameSync(spool,withinLab(spool+'-paused'));writeFileSync(spool,'transporte bloqueado somente no laboratório');paused=true;
      }
      if(phase==='transport-recovered' && paused) {
        const spool=withinLab(config.sources[0].directory);
        unlinkSync(spool);renameSync(withinLab(spool+'-paused'),spool);paused=false;
      }
      const state=await snapshot(),rooms=state.roomPlacements;
      let ready=true;
      if(phase==='untrusted')assert.equal(rooms.length,0);
      if(phase==='opened') {
        assert.equal(rooms.length,2);assert.equal(state.sessions.length,0);assert.equal(state.agents.length,0);
        slotA=rooms.find(r=>r.projectId==='lab-a').slotId;
        await capturePlayer();
        if(mode==='lifecycle')agent('session.observed');
      }
      if(phase==='removed-b') {
        assert.equal(rooms.length,2,'outra fonte mantém o projeto b');
        assert.equal(store.workspacePresence('vscode-lab-b')[0].status,'closed');
        agent('session.ended');assert.equal((await snapshot()).roomPlacements.length,1);
      }
      if(phase==='restored-b')assert.equal(rooms.length,2);
      if(phase==='transport-loss')ready=rooms.find(r=>r.projectId==='lab-a')?.status==='uncertain' && rooms.find(r=>r.projectId==='lab-b')?.status==='active';
      if(phase==='transport-recovered')ready=rooms.find(r=>r.projectId==='lab-a')?.status==='active' && rooms.find(r=>r.projectId==='lab-a')?.slotId===slotA;
      if(phase==='revoked')assert.equal(rooms.length,0);
      if(ready) {
        changes.push({phase,vscodeVersion:point.vscodeVersion,trusted:point.trusted,projects:rooms.map(r=>({projectId:r.projectId,status:r.status,slotId:r.slotId})),sessions:state.sessions.length,agents:state.agents.length});
        writeFileSync(path.join(output,'ack.json'),JSON.stringify({phase}));previous=phase;waitingSince=Date.now();
      }
    }
    await delay(150);
  }
  writeFileSync(path.join(output,'native.log'),Buffer.concat(stdout));
  assert.equal(closed,true,'VS Code deve encerrar o ensaio');assert.equal(childCode,0,'ensaio nativo precisa de código zero');
  if(mode==='shutdown') {
    const final=await snapshot();assert.equal(final.roomPlacements.length,0,'desativação nativa deve publicar fechamento');
    changes.push({phase:'shutdown',projects:[]});
  }
  const native=JSON.parse(readFileSync(path.join(output,'native-result.json'),'utf8'));assert.equal(native.result,'pass');
  writeFileSync(path.join(output,'native.log'),Buffer.concat(stdout));
  writeFileSync(path.join(output,'result.json'),JSON.stringify({result:'pass',mode,native,changes,...(playerProof?{player:playerProof}:{})},null,2));
  console.log(JSON.stringify({result:'pass',mode,phases:changes.map(c=>c.phase)}));
} finally {
  if(child && !closed)child.kill();
  service.server.closeAllConnections();await new Promise(resolve=>service.server.close(resolve));store.close();
}
