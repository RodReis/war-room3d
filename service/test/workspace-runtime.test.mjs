import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {parseWorkspaceConfig,publishLease,hash,normalize}=require('../../integrations/vscode-workspaces/model.cjs');

test('entrypoint HTTP carrega autorização de workspaces sem ativar fontes de sessão',async t=>{
  const root=mkdtempSync(path.join(tmpdir(),'wr3d-workspace-runtime-'));
  const config={schemaVersion:'1.0',vscodeVersion:'1.148.0',projects:[{projectId:'lab',name:'API · laboratório',canonicalPath:path.join(root,'project')}],
    sources:[{sourceId:'vscode-lab',projectId:'lab',directory:path.join(root,'spool')}]};
  const parsed=parseWorkspaceConfig(config),filename=path.join(root,'authorization.json');
  mkdirSync(config.projects[0].canonicalPath);writeFileSync(filename,JSON.stringify(config));
  publishLease({...parsed.sources[0],cwdHash:hash(normalize(config.projects[0].canonicalPath))},hash('window'),hash('publisher'),'1.148.0','opened');
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const token=randomBytes(32).toString('hex');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('WR3D_')));
  Object.assign(env,{WR3D_DATABASE_PATH:path.join(root,'db.sqlite'),WR3D_SERVICE_TOKEN:token,WR3D_SERVICE_PORT:String(port),WR3D_WORKSPACES_CONFIG_PATH:filename});
  const child=spawn(process.execPath,[fileURLToPath(new URL('../src/http/main.ts',import.meta.url))],{env,stdio:'ignore'});
  let exited=false;child.once('exit',()=>exited=true);
  t.after(async()=>{
    if(!exited){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
    rmSync(root,{recursive:true,force:true});
  });
  let snapshot;
  const deadline=Date.now()+15000;
  while(Date.now()<deadline && !exited) {
    try {
      const response=await fetch(`http://127.0.0.1:${port}/v1/snapshot`,{headers:{Authorization:'Bearer '+token}});
      if(response.ok){snapshot=await response.json();if(snapshot.roomPlacements.length)break;}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(snapshot?.roomPlacements[0]?.projectId,'lab');
  assert.deepEqual(snapshot.sessions,[]);assert.deepEqual(snapshot.agents,[]);
  assert.equal(snapshot.sources.find(s=>s.sourceId==='vscode-lab').status,'atual');
});
