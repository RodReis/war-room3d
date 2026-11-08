import { createHash } from 'node:crypto';
import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import path from 'node:path';
import type { EventStore, Cursor, NormalizedEvent } from '../store/event-store.ts';
import { adaptSessionRecord, type SessionSource } from './adapters.ts';
import { normalizeProjectPath, type ProjectRecord } from '../domain/identity.ts';
import { sessionKey } from '../domain/identity.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_READ = 1024 * 1024;
const MAX_LINE = 64 * 1024;
type SourceErrorCode = 'file_missing'|'invalid_scope'|'malformed_json'|'stale'|'read_error'|'revoked';
class SourceInputError extends Error {
  readonly code: SourceErrorCode;
  constructor(code: SourceErrorCode) { super(code); this.code = code; }
}

export function parseSessionSources(input: unknown): {projects:ProjectRecord[];sources:SessionSource[]} {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray((input as {sources?:unknown}).sources) || !Array.isArray((input as {projects?:unknown}).projects)) throw new Error('Configuração de sessões inválida');
  const root = input as {schemaVersion?:unknown;projects:unknown[];sources:unknown[]};
  if (root.schemaVersion !== '1.0' || Object.keys(root).some(key => !['schemaVersion','projects','sources'].includes(key))) throw new Error('Versão de configuração de sessões inválida');
  const projects = root.projects.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Projeto de sessões inválido');
    const project = value as Record<string,unknown>;
    if (Object.keys(project).some(key => !['projectId','name','canonicalPath'].includes(key)) ||
      typeof project.projectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(project.projectId) ||
      typeof project.name !== 'string' || !project.name || project.name.length > 80 || typeof project.canonicalPath !== 'string') throw new Error('Projeto de sessões inválido');
    normalizeProjectPath(project.canonicalPath);
    return project as unknown as ProjectRecord;
  });
  if (new Set(projects.map(project => project.projectId)).size !== projects.length) throw new Error('Projeto de sessões duplicado');
  const ids = new Set<string>();
  const files = new Set<string>();
  const sources = root.sources.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Fonte de sessão inválida');
    const source = value as Record<string,unknown>;
    if (Object.keys(source).some(key => !['sourceId','sourceVersion','provider','projectId','accountRef','filePath','staleAfterMs'].includes(key)) ||
      !['claude','codex'].includes(String(source.provider)) ||
      !['sourceId','sourceVersion','projectId','accountRef'].every(key => typeof source[key] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(source[key] as string)) ||
      typeof source.filePath !== 'string' || !path.isAbsolute(source.filePath) ||
      (source.staleAfterMs !== undefined && (!Number.isSafeInteger(source.staleAfterMs) || (source.staleAfterMs as number) < 1000 || (source.staleAfterMs as number) > 86400000))) throw new Error('Fonte de sessão precisa de escopo e caminho absolutos');
    const parsed = source as unknown as SessionSource;
    const filename = path.resolve(parsed.filePath).toLowerCase();
    if (ids.has(parsed.sourceId) || files.has(filename)) throw new Error('Fonte de sessão duplicada');
    ids.add(parsed.sourceId); files.add(filename);
    if (!projects.some(project => project.projectId === parsed.projectId)) throw new Error('Fonte sem projeto configurado');
    return parsed;
  });
  return {projects,sources};
}

export class SessionFileCollector {
  private readonly unavailable = new Map<string,SourceErrorCode>();
  private readonly lastTimestamp = new Map<string,number>();
  private readonly store: EventStore;
  readonly sources: readonly SessionSource[];
  constructor(store: EventStore, sources: readonly SessionSource[]) {
    this.store = store;
    this.sources = sources;
    const projects = new Set((store.snapshot().projects as {projectId:string}[]).map(item => item.projectId));
    for (const source of sources) if (!projects.has(source.projectId)) throw new Error(`Projeto não registrado: ${source.projectId}`);
    for (const source of store.snapshot().sources as {sourceId:string;status:string;errorCode?:SourceErrorCode}[])
      if (source.status === 'indisponivel') this.unavailable.set(source.sourceId,source.errorCode ?? 'read_error');
    for (const source of store.snapshot().sources as {sourceId:string;lastApplied:string|null}[])
      if (source.lastApplied) this.lastTimestamp.set(source.sourceId,Date.parse(source.lastApplied));
  }

  private nextTimestamp(sourceId: string): string {
    const next = Math.max(Date.now(),(this.lastTimestamp.get(sourceId) ?? 0)+1);
    this.lastTimestamp.set(sourceId,next);
    return new Date(next).toISOString();
  }

  poll(now = Date.now()): void {
    for (const source of this.sources) {
      try {
        this.pollSource(source);
        const row = (this.store.snapshot().sources as {sourceId:string;status:string;lastEvidenceAt:string|null}[]).find(item => item.sourceId === source.sourceId);
        if (!row) this.markUnavailable(source,'stale');
        else if (source.staleAfterMs && row.status === 'atual' && (!row.lastEvidenceAt || now - Date.parse(row.lastEvidenceAt) > source.staleAfterMs))
          this.markUnavailable(source,'stale');
      }
      catch (error) {
        const code: SourceErrorCode = error instanceof SourceInputError ? error.code
          : (error as {code?:unknown})?.code === 'ENOENT' ? 'file_missing' : 'read_error';
        this.markUnavailable(source,code);
      }
    }
  }

  private statusEvent(source: SessionSource, errorCode: SourceErrorCode): void {
    const previous = this.store.getCursor(source.sourceId, 'source-status');
    const offset = (previous?.offset ?? 0) + 1;
    const now = this.nextTimestamp(source.sourceId);
    const event: NormalizedEvent = {
      schemaVersion:'1.0',eventId:`e-${hash(`${source.sourceId}:status:${offset}`)}`,sourceId:source.sourceId,
      sourceEventId:`status-${offset}`,sourceVersion:source.sourceVersion,type:'source.unavailable',observedAt:now,receivedAt:now,
      provenance:'observed',ingestionMode:'live',payload:{reason:'source_lost',errorCode},evidenceRefs:[]
    };
    this.store.apply(event,{sourceId:source.sourceId,fileKey:'source-status',generation:0,offset});
  }

  private markUnavailable(source: SessionSource, code: SourceErrorCode): void {
    if (this.unavailable.get(source.sourceId) === code) return;
    this.statusEvent(source,code);
    this.unavailable.set(source.sourceId,code);
  }

  private pollSource(source: SessionSource): void {
    const fd = openSync(source.filePath,'r');
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new Error('Fonte não é arquivo');
      const fileKey = `file-${hash(`${path.resolve(source.filePath)}:${stat.dev}:${stat.ino}:${stat.birthtimeMs}`)}`;
      const previous = this.store.getCursor(source.sourceId,fileKey);
      const generation = previous && stat.size < previous.offset ? previous.generation + 1 : previous?.generation ?? 0;
      let offset = previous && stat.size >= previous.offset ? previous.offset : 0;
      let receivedEvidence = false;
      while (offset < stat.size) {
        const size = Math.min(MAX_READ,stat.size-offset);
        const bytes = Buffer.allocUnsafe(size);
        const count = readSync(fd,bytes,0,size,offset);
        if (!count) break;
        const chunk = bytes.subarray(0,count);
        const lastNewline = chunk.lastIndexOf(10);
        if (lastNewline < 0) {
          if (chunk.length > MAX_LINE) throw new SourceInputError('read_error');
          break;
        }
        const complete = chunk.subarray(0,lastNewline+1);
        for (const rawLine of complete.toString('utf8').split('\n').slice(0,-1)) {
          const length = Buffer.byteLength(rawLine)+1;
          const cursor: Cursor = {sourceId:source.sourceId,fileKey,generation,offset:offset+length};
          if (length > MAX_LINE) throw new SourceInputError('read_error');
          try {
            const record = JSON.parse(rawLine) as unknown;
            if (source.provider === 'claude' && (!record || typeof record !== 'object' || Array.isArray(record) ||
                typeof (record as {cwdHash?:unknown}).cwdHash !== 'string' ||
                !this.store.matchesProjectPathHash(source.projectId,(record as {cwdHash:string}).cwdHash)))
              throw new SourceInputError('invalid_scope');
            if (source.provider === 'codex') {
              const envelope = record as {method?:string;params?:{threadId?:string;thread?:{id?:string;cwdHash?:string}}};
              const thread = envelope?.params?.thread;
              if (envelope?.method === 'thread/started') {
                if (!thread?.id || !thread.cwdHash || !this.store.matchesProjectPathHash(source.projectId,thread.cwdHash))
                  throw new SourceInputError('invalid_scope');
              } else if (envelope?.method && ['turn/started','turn/completed','item/started','item/completed'].includes(envelope.method)) {
                const native = envelope.params?.threadId;
                if (!native || !this.store.hasSessionContext(sessionKey('codex',source.accountRef,native),source.sourceId,source.projectId,'codex'))
                  throw new SourceInputError('invalid_scope');
              }
            }
            const recordId = `${fileKey}:${generation}:${cursor.offset}`;
            const events = adaptSessionRecord(source,record,recordId,this.nextTimestamp(source.sourceId));
            this.store.applyBatch(events,cursor);
            if (events.length) receivedEvidence = true;
          } catch (error) {
            if (error instanceof SyntaxError) { this.store.acknowledgeCursor(cursor); this.markUnavailable(source,'malformed_json'); receivedEvidence = false; }
            else throw error;
          }
          offset = cursor.offset;
        }
      }
      if (receivedEvidence && (this.store.snapshot().sources as {sourceId:string;status:string}[])
        .some(row => row.sourceId === source.sourceId && row.status === 'atual')) this.unavailable.delete(source.sourceId);
    } finally { closeSync(fd); }
  }
}
