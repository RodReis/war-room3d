'use strict';
const vscode=require('vscode');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {hash}=require('../model.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function waitFor(check,label) {
  const deadline=Date.now()+60000;
  while(Date.now()<deadline) {if(await check())return;await delay(100);}
  throw new Error('Prazo do ensaio nativo: '+label);
}

async function run() {
  const output=process.env.WR3D_WORKSPACE_LAB_DIR;
  if(!output || !path.isAbsolute(output))throw new Error('Laboratório absoluto obrigatório');
  const mode=process.env.WR3D_WORKSPACE_LAB_MODE ?? 'lifecycle';
  const checkpoint=async phase=>{
    fs.writeFileSync(path.join(output,'checkpoint.json'),JSON.stringify({phase,mode,vscodeVersion:vscode.version,
      trusted:vscode.workspace.isTrusted,windowKey:hash(vscode.env.sessionId)}));
    await waitFor(()=>{try{return JSON.parse(fs.readFileSync(path.join(output,'ack.json'),'utf8')).phase===phase;}catch{return false;}},phase);
  };
  const extension=vscode.extensions.getExtension('rodreis.war-room3d-workspaces');
  assert.ok(extension,'extensão de desenvolvimento carregada');
  await extension.activate();
  const settings=vscode.workspace.getConfiguration('warRoom3D.workspace');
  await settings.update('configPath',path.join(output,'authorization.json'),vscode.ConfigurationTarget.Global);
  const refresh=()=>vscode.commands.executeCommand('warRoom3D.workspace.refresh');
  const state=()=>vscode.commands.executeCommand('warRoom3D.workspace.status');
  await refresh();
  if(mode==='untrusted') {
    assert.equal(vscode.workspace.isTrusted,false,'o ensaio negativo não desliga Workspace Trust');
    assert.equal((await state()).enabled,false);
    await checkpoint('untrusted');
  } else {
    assert.equal(vscode.workspace.isTrusted,true);
    assert.equal(vscode.workspace.workspaceFolders.length,2);
    assert.equal((await state()).authorizedProjects,2);
    await checkpoint('opened');
    if(mode==='lifecycle') {
      const second=vscode.workspace.workspaceFolders[1];
      const change=async operation=>{
        const changed=new Promise(resolve=>{const listener=vscode.workspace.onDidChangeWorkspaceFolders(()=>{listener.dispose();resolve();});});
        assert.equal(operation(),true);await changed;await refresh();
      };
      await change(()=>vscode.workspace.updateWorkspaceFolders(1,1));
      await checkpoint('removed-b');
      await change(()=>vscode.workspace.updateWorkspaceFolders(1,0,{uri:second.uri,name:'API'}));
      await checkpoint('restored-b');
      await checkpoint('transport-loss');
      await checkpoint('transport-recovered');
      await settings.update('configPath','',vscode.ConfigurationTarget.Global);await refresh();
      assert.equal((await state()).enabled,false);await checkpoint('revoked');
    }
  }
  fs.writeFileSync(path.join(output,'native-result.json'),JSON.stringify({result:'pass',mode,version:vscode.version,trusted:vscode.workspace.isTrusted}));
}
module.exports={run};
