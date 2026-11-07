// Laboratório local explícito: nenhum hook, CLI de provedor ou comando real.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EventStore } from '../src/store/event-store.ts';
import { CapabilityRegistry } from '../src/commands/capability-registry.ts';
import { CommandGateway } from '../src/commands/gateway.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

if(!process.env.WR3D_M4_LAB_PLAYER)throw new Error('Informe o Player M4 do laboratório em WR3D_M4_LAB_PLAYER');
const directory=mkdtempSync(path.join(tmpdir(),'wr3d-m4-synthetic-'));
const store=new EventStore(path.join(directory,'lab.db'));
const now=Date.now();
const token=randomBytes(32).toString('hex'),commandToken=randomBytes(32).toString('hex');
const fixture=JSON.parse(readFileSync(new URL('../../contracts/fixtures/m1/session-observed.v1.json',import.meta.url),'utf8'));
fixture.provider='codex';fixture.projectId='m4-lab';fixture.sessionKey='session-m4-synthetic';
fixture.observedAt=fixture.receivedAt=new Date(now).toISOString();fixture.sourceVersion='synthetic-1';
store.registerProject({projectId:'m4-lab',name:'LABORATÓRIO SINTÉTICO M4',canonicalPath:directory});
store.apply(fixture,{sourceId:fixture.sourceId,fileKey:'synthetic.jsonl',generation:1,offset:1});
const target={projectId:'m4-lab',sessionKey:fixture.sessionKey,provider:'codex',providerVersion:'synthetic-1',active:true};
const registry=new CapabilityRegistry();
for(const action of ['send_message','answer_question','decide_permission'])registry.prove({
  projectId:target.projectId,sessionKey:target.sessionKey,provider:target.provider,providerVersion:target.providerVersion,action,
  adapterVersion:'synthetic-adapter-1',evidenceRef:'synthetic:windows-lab',provenAt:new Date(now-1000).toISOString(),validUntil:new Date(now+300000).toISOString()
});
for(const action of ['answer_question','decide_permission'])registry.observeRequest({requestId:`synthetic-${action}`,projectId:target.projectId,sessionKey:target.sessionKey,action,
  originalContext:action==='answer_question'?'Qual opção de teste usar?':'Ferramenta fictícia solicita acesso a um arquivo sintético.',
  consequence:'Somente registrar a resposta no adaptador falso. Nenhum efeito externo.',sourceRef:'synthetic:request',deadlineAt:new Date(now+300000).toISOString()});
let sends=0;
const adapter={provider:'codex',version:'synthetic-adapter-1',actions:['send_message','answer_question','decide_permission'],async send(input){
  sends++;process.stdout.write(`Laboratório sintético: tentativa ${sends}, ação ${input.action}; nenhum provedor real.\n`);
  return {status:process.env.WR3D_M4_LAB_REJECT==='1'?'rejected':'confirmed',commandId:input.commandId,requestId:input.requestId};
}};
const gateway=new CommandGateway({audit:store.commands,registry,adapters:[adapter],resolveTarget:key=>key===target.sessionKey?target:null,mode:'live'});
const {server,url}=await startReadOnlyServer(store,token,0,{gateway,targets:()=>[target],token:commandToken,actor:{actorId:'synthetic-operator',projectIds:['m4-lab']}});
process.stdout.write('Laboratório M4 ativo em loopback com tokens efêmeros não exibidos. Dados e adaptador sintéticos.\n');
let player=null;
const playerPath=process.env.WR3D_M4_LAB_PLAYER;
const proofDirectory=process.env.WR3D_M4_PROOF_DIR;
if(playerPath)player=spawn(playerPath,['-screen-width','1280','-screen-height','720','-screen-fullscreen','0','-logFile',path.join(directory,'player.log')],{
  env:{...process.env,WR3D_SERVICE_URL:url,WR3D_SERVICE_TOKEN:token,WR3D_COMMAND_TOKEN:commandToken,WR3D_VALIDATION_CAPTURE_DIR:''},windowsHide:false,stdio:'ignore'
});
let stopping=false;
async function stop(){
  if(stopping)return;stopping=true;
  player?.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const count=sends;store.close();
  if(!path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep))throw new Error('Temporário fora do alvo');
  rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  process.stdout.write(`Laboratório encerrado: ${count} emissão(ões) somente no fake; SQLite e tokens efêmeros removidos.\n`);
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void stop());
player?.once('error',()=>void stop());
player?.once('exit',code=>{
  if(proofDirectory){
    mkdirSync(proofDirectory,{recursive:true});
    copyFileSync(path.join(directory,'player.log'),path.join(proofDirectory,'player.log'));
    writeFileSync(path.join(proofDirectory,'backend-result.json'),JSON.stringify({synthetic:true,playerExitCode:code,sends,pass:code===0 && sends===1}));
    if(code!==0 || sends!==1)process.exitCode=1;
  }
  void stop();
});
const timer=setTimeout(()=>void stop(),300000);timer.unref();
