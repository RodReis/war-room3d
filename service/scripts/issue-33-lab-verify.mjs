// Lê apenas o banco do laboratório informado e imprime contagens, sem texto ou IDs nativos.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const [provider,output]=process.argv.slice(2);
if(!['claude','codex'].includes(provider)||!output||!path.isAbsolute(output))throw new Error('laboratorio_invalido');
const result=JSON.parse(readFileSync(path.join(output,'result.json'),'utf8'));
if(result.provider!==provider||!result.roundTrip)throw new Error('prova_sem_ida_e_volta');
const store=new EventStore(path.join(output,'state.sqlite'));
let server;
try{
  const sessions=store.snapshot().sessions.filter(session=>session.projectId==='issue-33-lab'&&session.provider===provider);
  if(sessions.length!==1)throw new Error('sessao_inesperada');
  const token='issue-33-read-token-'+('x'.repeat(32));
  const started=await startReadOnlyServer(store,token,0);
  server=started.server;
  const route='/v1/conversations?projectId=issue-33-lab&sessionKey='+encodeURIComponent(sessions[0].sessionKey)+'&limit=50';
  const response=await fetch(started.url+route,{headers:{Authorization:'Bearer '+token}});
  const page=await response.json();
  const marker=provider==='claude'?'WR3D_33_CLAUDE_RESPOSTA':'WR3D_M4_ACK';
  const roles=page.items?.map(item=>item.role)??[];
  const matched=response.status===200&&page.projectId==='issue-33-lab'&&page.sessionKey===sessions[0].sessionKey&&
    page.receiptIsResponse===false&&roles.length===2&&roles[0]==='user'&&roles[1]==='assistant'&&
    page.items.every(item=>item.provider===provider&&item.sourceId===`issue-33-${provider}-lab`&&item.consentRef==='issue-33-synthetic-authorization')&&
    page.items[1].content.includes(marker);
  process.stdout.write(JSON.stringify({provider,httpStatus:response.status,sessions:sessions.length,messages:roles.length,roles,
    scopeMatched:matched,receiptIsResponse:page.receiptIsResponse,contentLengths:page.items?.map(item=>item.content.length)??[]})+'\n');
  if(!matched)process.exitCode=1;
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  store.close();
}
