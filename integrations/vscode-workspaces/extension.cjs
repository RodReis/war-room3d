'use strict';
const vscode = require('vscode');
const { WorkspaceObserver } = require('./observer.cjs');
let observer, timer;

function activate(context) {
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,20);
  status.command='warRoom3D.workspace.status';
  observer=new WorkspaceObserver(vscode,state=>{
    status.text=state.enabled ? `$(eye) Quartel · ${state.authorizedProjects} workspace(s)` : '$(circle-slash) Quartel · captura desligada';
    status.tooltip=state.state;status.show();
  });
  context.subscriptions.push(status,
    vscode.commands.registerCommand('warRoom3D.workspace.status',()=>({...observer.state})),
    vscode.commands.registerCommand('warRoom3D.workspace.refresh',()=>observer.sync()),
    vscode.workspace.onDidChangeWorkspaceFolders(()=>observer.sync()),
    vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('warRoom3D.workspace.configPath'))observer.sync();}),
    vscode.workspace.onDidGrantWorkspaceTrust(()=>observer.sync()),
    {dispose:()=>deactivate()});
  timer=setInterval(()=>observer.sync(),5000);
  observer.sync();
}

function deactivate() {if(timer)clearInterval(timer);observer?.stop();return Promise.resolve();}
module.exports={activate,deactivate};
