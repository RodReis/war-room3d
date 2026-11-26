'use strict';
const { randomUUID } = require('node:crypto');
const { hash, readWorkspaceConfig, selectBindings, publishLease } = require('./model.cjs');

class WorkspaceObserver {
  constructor(api, report=()=>{}) {
    this.api=api;this.report=report;this.bindings=new Map();this.windowKey=hash(api.env.sessionId);
    this.publisherId=hash(randomUUID());this.stopped=false;
    this.state={enabled:false,state:'Desligado',authorizedProjects:0,vscodeVersion:api.version,source:'vscode-workspace'};
  }

  sync() {
    if(this.stopped) return;
    if(!this.api.workspace.isTrusted) return this.update(false,'Aguardando confiança do workspace',0);
    if(this.api.env.remoteName) return this.update(false,'Workspace remoto não suportado',0);
    // Nunca aceitar valor do workspace: uma pasta não autoriza a própria coleta.
    const filename=this.api.workspace.getConfiguration('warRoom3D.workspace').inspect('configPath')?.globalValue;
    if(!filename) {this.closeBindings();return this.update(false,'Desligado',0);}
    try {
      const config=readWorkspaceConfig(filename);
      if(config.vscodeVersion!==this.api.version) return this.update(false,'Versão do VS Code sem autorização',0);
      const next=selectBindings(config,this.api.workspace.workspaceFolders ?? []);
      for(const [id,binding] of this.bindings)
        if(!next.has(id) || next.get(id).directory!==binding.directory)
          publishLease(binding,this.windowKey,this.publisherId,this.api.version,'closed');
      let published=0;
      for(const binding of next.values()) {
        try {publishLease(binding,this.windowKey,this.publisherId,this.api.version,'opened');published++;} catch { /* Outro projeto continua sendo publicado. */ }
      }
      this.bindings=next;
      return this.update(published>0 || next.size===0,published===next.size ? 'Metadados de workspace · sem atividade de agente' :
        'Publicação parcial · verificar transporte local',published);
    } catch {return this.update(false,'Configuração ou publicação indisponível',0);}
  }

  update(enabled,state,count) {
    this.state={enabled,state,authorizedProjects:count,vscodeVersion:this.api.version,source:'vscode-workspace'};
    this.report(this.state);
    return this.state;
  }

  closeBindings() {
    let failed=false;
    for(const binding of this.bindings.values()) {
      try {publishLease(binding,this.windowKey,this.publisherId,this.api.version,'closed');} catch {failed=true;}
    }
    this.bindings.clear();
    return !failed;
  }

  stop() {if(this.stopped)return;this.closeBindings();this.stopped=true;}
}
module.exports={WorkspaceObserver};
