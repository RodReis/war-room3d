'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const SOURCE_VERSION = 'vscode-workspace-1';
const hash = text => createHash('sha256').update(text).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));

// Mesmo algoritmo da identidade canônica do serviço; compatibilidade exercitada nos testes.
function normalize(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Caminho inválido');
  if (/^[a-zA-Z]:[\\/]/.test(input) || input.startsWith('\\\\'))
    return path.win32.normalize(input).replaceAll('/', '\\').toLowerCase();
  if (input.startsWith('/')) return path.posix.normalize(input);
  throw new Error('Caminho absoluto obrigatório');
}

function parseWorkspaceConfig(input) {
  if (!keys(input, ['schemaVersion','vscodeVersion','projects','sources']) || input.schemaVersion !== '1.0' ||
      typeof input.vscodeVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(input.vscodeVersion) ||
      !Array.isArray(input.projects) || !Array.isArray(input.sources) || input.projects.length > 128 || input.sources.length > 128)
    throw new Error('Configuração de workspaces inválida');
  const projectIds = new Set(), paths = new Set(), sourceIds = new Set(), directories = new Set(), bindings = new Set();
  const projects = input.projects.map(project => {
    if (!keys(project,['projectId','name','canonicalPath','aliases']) || !id(project.projectId) ||
        typeof project.name !== 'string' || !project.name.trim() || project.name.length > 80 ||
        (project.aliases !== undefined && (!Array.isArray(project.aliases) || project.aliases.length > 16)) || projectIds.has(project.projectId))
      throw new Error('Projeto de workspace inválido');
    projectIds.add(project.projectId);
    for (const p of [project.canonicalPath,...(project.aliases ?? [])]) {
      const canonical=normalize(p);
      if(paths.has(canonical)) throw new Error('Vínculo canônico duplicado');
      paths.add(canonical);
    }
    return {projectId:project.projectId,name:project.name,canonicalPath:project.canonicalPath,...(project.aliases ? {aliases:[...project.aliases]} : {})};
  });
  const sources = input.sources.map(source => {
    if (!keys(source,['sourceId','projectId','directory','staleAfterMs']) || !id(source.sourceId) || !projectIds.has(source.projectId) ||
        typeof source.directory !== 'string' || !path.isAbsolute(source.directory) ||
        (source.staleAfterMs !== undefined && (!Number.isSafeInteger(source.staleAfterMs) || source.staleAfterMs < 15000 || source.staleAfterMs > 300000)) ||
        sourceIds.has(source.sourceId) || directories.has(normalize(path.resolve(source.directory))) || bindings.has(source.projectId))
      throw new Error('Fonte de workspace inválida');
    const directory=path.resolve(source.directory);
    sourceIds.add(source.sourceId);directories.add(normalize(directory));bindings.add(source.projectId);
    return {sourceId:source.sourceId,projectId:source.projectId,directory,sourceVersion:SOURCE_VERSION,staleAfterMs:source.staleAfterMs ?? 15000};
  });
  // Não permitir diretórios de spool aninhados: cada fonte tem um domínio de arquivos próprio.
  for(const a of sources) for(const b of sources)
    if(a!==b && normalize(a.directory).startsWith(normalize(b.directory)+path.sep)) throw new Error('Diretórios de fontes sobrepostos');
  return {schemaVersion:'1.0',vscodeVersion:input.vscodeVersion,projects,sources};
}

function readWorkspaceConfig(filename) {
  if(typeof filename!=='string' || !path.isAbsolute(filename))throw new Error('Arquivo absoluto de autorização obrigatório');
  const stat=fs.lstatSync(filename);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>65536)throw new Error('Arquivo de autorização inválido');
  return parseWorkspaceConfig(JSON.parse(fs.readFileSync(filename,'utf8')));
}

function selectBindings(config, folders) {
  const selected = new Map();
  for(const folder of folders) {
    if(folder.uri?.scheme !== 'file' || folder.uri.authority) continue;
    const folderPath=normalize(folder.uri.fsPath);
    const project=config.projects.find(p=>[p.canonicalPath,...(p.aliases ?? [])].some(p=>normalize(p)===folderPath));
    const source=project && config.sources.find(s=>s.projectId===project.projectId);
    if(source) selected.set(source.sourceId,{...source,cwdHash:hash(normalize(project.canonicalPath))});
  }
  return selected;
}

function readLease(filename) {
  const fd=fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat=fs.fstatSync(fd);
    if(!stat.isFile() || stat.size > 4096) throw new Error('Lease inválido');
    return JSON.parse(fs.readFileSync(fd,'utf8'));
  } finally {fs.closeSync(fd);}
}

function validateLease(record, config, source, windowKey, now) {
  const project=config.projects.find(p=>p.projectId===source.projectId);
  return keys(record,['schemaVersion','sourceVersion','vscodeVersion','windowKey','publisherId','cwdHash','state','sequence','observedAt']) &&
    record.schemaVersion==='1.0' && record.sourceVersion===SOURCE_VERSION && record.vscodeVersion===config.vscodeVersion &&
    /^[a-f0-9]{64}$/.test(windowKey) && record.windowKey===windowKey && /^[a-f0-9]{64}$/.test(record.publisherId) &&
    record.cwdHash===hash(normalize(project.canonicalPath)) && ['opened','closed'].includes(record.state) &&
    Number.isSafeInteger(record.sequence) && record.sequence>0 && record.sequence<=now+5000 &&
    typeof record.observedAt==='string' && Date.parse(record.observedAt)===record.sequence &&
    new Date(record.sequence).toISOString()===record.observedAt;
}

function publishLease(binding, windowKey, publisherId, vscodeVersion, state, now=Date.now()) {
  fs.mkdirSync(binding.directory,{recursive:true,mode:0o700});
  const filename=path.join(binding.directory,windowKey+'.json');
  let prior;
  try { prior=readLease(filename); } catch(error) { if(error.code!=='ENOENT') throw error; }
  // Um host antigo não encerra a janela já recuperada por outro host.
  if(state==='closed' && prior && prior.publisherId!==publisherId) return;
  const sequence=Math.max(now,Number.isSafeInteger(prior?.sequence)?prior.sequence+1:0);
  const record={schemaVersion:'1.0',sourceVersion:SOURCE_VERSION,vscodeVersion,windowKey,publisherId,
    cwdHash:binding.cwdHash,state,sequence,observedAt:new Date(sequence).toISOString()};
  const temp=filename+'.'+publisherId+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(record),{encoding:'utf8',mode:0o600});
  fs.renameSync(temp,filename);
}

module.exports={SOURCE_VERSION,hash,normalize,parseWorkspaceConfig,readWorkspaceConfig,selectBindings,readLease,validateLease,publishLease};
