import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {normalizeProjectPath} from '../src/domain/identity.ts';
const require=createRequire(import.meta.url);
const {parseWorkspaceConfig,normalize,hash,readLease,selectBindings,publishLease}=require('../../integrations/vscode-workspaces/model.cjs');
const {WorkspaceObserver}=require('../../integrations/vscode-workspaces/observer.cjs');

function setup(t) {
  const root=mkdtempSync(path.join(tmpdir(),'wr3d-vscode-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const config={schemaVersion:'1.0',vscodeVersion:'1.148.0',projects:[
    {projectId:'a',name:'API',canonicalPath:'C:\\a\\api',aliases:['C:\\alias\\api']},
    {projectId:'b',name:'API',canonicalPath:'C:\\b\\api'}],
    sources:[{sourceId:'vscode-a',projectId:'a',directory:path.join(root,'a')},{sourceId:'vscode-b',projectId:'b',directory:path.join(root,'b')}]};
  const filename=path.join(root,'authorization.json');writeFileSync(filename,JSON.stringify(config));
  let globalValue=filename;
  const api={version:'1.148.0',env:{sessionId:'window-a'},workspace:{isTrusted:true,
    workspaceFolders:[{uri:{scheme:'file',fsPath:'C:\\a\\api'}},{uri:{scheme:'file',fsPath:'C:\\b\\api'}}],
    getConfiguration:()=>({inspect:()=>({globalValue,workspaceValue:'C:\\untrusted\\authorization.json'})})}};
  return {root,config,api,filename,setGlobal:value=>globalValue=value};
}

test('normalização da extensão conserva o algoritmo canônico do serviço',()=>{
  for(const p of ['C:/Projetos/API/../api','c:\\Projetos\\API','/lab/a/../api','\\\\host\\share\\api'])assert.equal(normalize(p),normalizeProjectPath(p));
  assert.throws(()=>normalize('relativo'));
});

test('configuração rejeita campos estranhos, IDs/diretórios ambíguos e raízes sem vínculo',t=>{
  const {config}=setup(t);
  assert.throws(()=>parseWorkspaceConfig({...config,content:true}));
  assert.throws(()=>parseWorkspaceConfig({...config,sources:[config.sources[0],config.sources[0]]}));
  assert.throws(()=>parseWorkspaceConfig({...config,sources:[config.sources[0],{...config.sources[1],directory:config.sources[0].directory+path.sep}]}));
  assert.throws(()=>parseWorkspaceConfig({...config,projects:[config.projects[0],{...config.projects[1],canonicalPath:config.projects[0].canonicalPath}]}));
  const parsed=parseWorkspaceConfig(config);
  assert.equal(selectBindings(parsed,[{uri:{scheme:'vscode-remote',fsPath:'C:\\a\\api'}},{uri:{scheme:'file',fsPath:'C:\\a\\api\\child'}}]).size,0);
  assert.equal(selectBindings(parsed,[{uri:{scheme:'file',fsPath:'C:\\alias\\api'}}]).size,1);
});

test('multi-root publica só metadados autorizados e remove apenas vínculos da própria janela',t=>{
  const {config,api,setGlobal}=setup(t),a=new WorkspaceObserver(api),b=new WorkspaceObserver({...api,env:{sessionId:'window-b'}});
  assert.equal(a.sync().authorizedProjects,2);b.sync();
  const filename=path.join(config.sources[0].directory,hash('window-a')+'.json');
  const record=readLease(filename);
  assert.equal(record.state,'opened');assert.equal('canonicalPath' in record,false);assert.equal('name' in record,false);
  api.workspace.workspaceFolders.splice(1,1);a.sync();
  assert.equal(readLease(path.join(config.sources[1].directory,hash('window-a')+'.json')).state,'closed');
  assert.equal(readLease(path.join(config.sources[1].directory,hash('window-b')+'.json')).state,'opened');
  setGlobal('');a.sync();assert.equal(readLease(filename).state,'closed');
  b.stop();a.stop();
});

test('trust e versão bloqueiam captura; valor de workspace não autoriza coleta',t=>{
  const {api,setGlobal,config}=setup(t),observer=new WorkspaceObserver(api);
  api.workspace.isTrusted=false;assert.equal(observer.sync().enabled,false);
  api.workspace.isTrusted=true;api.version='1.149.0';assert.equal(observer.sync().enabled,false);
  api.version='1.148.0';api.env.remoteName='ssh-remote';assert.equal(observer.sync().enabled,false);delete api.env.remoteName;
  api.version='1.148.0';setGlobal(undefined);assert.equal(observer.sync().enabled,false);
  assert.throws(()=>readFileSync(path.join(config.sources[0].directory,hash('window-a')+'.json')),/ENOENT/);
  observer.stop();
});

test('host antigo não encerra lease republicado pelo host novo',t=>{
  const {config}=setup(t),binding={...parseWorkspaceConfig(config).sources[0],cwdHash:hash(normalize(config.projects[0].canonicalPath))},key=hash('window');
  publishLease(binding,key,hash('old'),'1.148.0','opened');
  publishLease(binding,key,hash('new'),'1.148.0','opened');
  publishLease(binding,key,hash('old'),'1.148.0','closed');
  assert.equal(readLease(path.join(binding.directory,key+'.json')).state,'opened');
});
