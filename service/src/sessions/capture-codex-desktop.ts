import { appendFileSync, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeProjectPath } from '../domain/identity.ts';
import { parseSessionSources } from './file-source.ts';
import { sanitizeSourceRecord } from './capture-source.ts';
import { matchesSourceOrigin, describeSourceOrigin } from './source-origin.ts';

export function readDesktopCaptureConfig(filename:string,sourceId:string) {
  if(!path.isAbsolute(filename) || !sourceId) throw new Error('Configuração absoluta e fonte obrigatórias');
  if(lstatSync(filename).isSymbolicLink()) throw new Error('Configuração precisa ser arquivo regular');
  const fd=openSync(filename,'r');
  try {
    const stat=fstatSync(fd);
    if(!stat.isFile() || stat.size>64*1024) throw new Error('Configuração inválida ou excede limite');
    const config=parseSessionSources(JSON.parse(readFileSync(fd,'utf8')));
    const source=config.sources.find(s=>s.sourceId===sourceId);
    if(!source || source.provider!=='codex' || source.origin?.surface!=='desktop' || source.origin.transport!=='hooks' ||
      source.conversationContent || path.resolve(source.filePath).toLowerCase()===path.resolve(filename).toLowerCase())
      throw new Error('Fonte Desktop/hooks de metadados obrigatória');
    const project=config.projects.find(p=>p.projectId===source.projectId)!;
    return {source,cwdHash:createHash('sha256').update(normalizeProjectPath(project.canonicalPath)).digest('hex')};
  } finally {closeSync(fd);}
}

async function capture():Promise<void> {
  const [filename,sourceId,mode,...extra]=process.argv.slice(2);
  if(extra.length || mode!==undefined && mode!=='--diagnostic') throw new Error('Argumentos inválidos');
  const {source,cwdHash}=readDesktopCaptureConfig(filename,sourceId);
  if(mode==='--diagnostic') {
    // Sem leitura de spools, sessões ou conteúdo pessoal; caminho absoluto omitido.
    process.stdout.write(JSON.stringify({sourceId:source.sourceId,projectId:source.projectId,sourceVersion:source.sourceVersion,
      ...describeSourceOrigin(source.origin),contentCapture:false})+'\n');
    return;
  }
  const chunks:Buffer[]=[];let length=0;
  for await(const chunk of process.stdin) {
    length+=(chunk as Buffer).length;
    if(length>64*1024) throw new Error('Evento excede limite');
    chunks.push(chunk as Buffer);
  }
  const raw:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!matchesSourceOrigin(source.origin,raw)) throw new Error('Transporte incompatível com Desktop/hooks');
  const safe=sanitizeSourceRecord('codex',raw);
  if(!safe || safe.cwdHash!==cwdHash) throw new Error('Evento fora do projeto autorizado');
  try {
    const stat=lstatSync(source.filePath);
    if(!stat.isFile() || stat.isSymbolicLink()) throw new Error('Destino precisa ser arquivo regular');
  } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
  appendFileSync(source.filePath,JSON.stringify({...safe,capturedAt:new Date().toISOString()})+'\n',{encoding:'utf8',mode:0o600});
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  capture().catch(()=>{process.stderr.write('Captura Desktop indisponível: configuração, escopo ou evento inválido.\n');process.exitCode=1;});
}
