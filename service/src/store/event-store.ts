import Database from 'better-sqlite3';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { normalizeProjectPath, type ProjectRecord } from '../domain/identity.ts';
import { compareTimestamp, reduceSession, parentStatus, type SessionSignal, type SessionState, type Presence } from '../domain/session-reducer.ts';
import { InfrastructureStore } from '../infra/infrastructure-store.ts';
import type { Inventory } from '../infra/inventory.ts';
import { appendStateChange } from './change-log.ts';
import { HistoryStore, retentionCutoffs } from '../history/history.ts';
import type { RepositoryLink } from '../history/history.ts';
import { CommandAudit } from '../commands/audit.ts';
import { OperationsStore } from '../operations/operations-store.ts';
import { createHash } from 'node:crypto';
import type { SessionSource } from '../sessions/adapters.ts';

const schema = JSON.parse(readFileSync(new URL('../../../contracts/schemas/event.v1.schema.json', import.meta.url), 'utf8'));
const validateEvent = new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(schema);

export interface Cursor {
  sourceId: string;
  fileKey: string;
  generation: number;
  offset: number;
}

export interface NormalizedEvent {
  schemaVersion: '1.0';
  eventId: string;
  sourceId: string;
  sourceEventId?: string;
  sourceVersion: string;
  type: string;
  observedAt: string;
  receivedAt: string;
  projectId?: string;
  provider?: 'claude' | 'codex';
  sessionKey?: string;
  agentKey?: string;
  provenance: string;
  ingestionMode: string;
  payload: { parentAgentKey?: string; parentStatus?: 'vinculo_pendente'; taskId?: string; invocationId?: string; messageId?: string; title?: string; name?: string; reason?: string; errorCode?: string; repositoryId?: string; entityType?: 'pull_request' | 'workflow'; entityId?: string; transition?: string };
  evidenceRefs: string[];
  [key: string]: unknown;
}

export interface ApplyResult {
  applied: boolean;
  revision: number;
  streamSequence: number;
  reason?: 'duplicate' | 'schema_invalid' | 'unknown_project';
}

export interface StreamChange {
  streamSequence: number;
  type: string;
  resourceId?: string;
  projectId?: string;
}

type Row = Record<string, unknown>;

export class EventStore {
  private readonly db: Database.Database;
  readonly infrastructure: InfrastructureStore;
  readonly history: HistoryStore;
  readonly commands: CommandAudit;
  readonly operations: OperationsStore;

  constructor(databasePath: string) {
    if (!databasePath) throw new Error('Caminho do banco obrigatório');
    this.db = new Database(databasePath, { timeout: 5000 });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    const schemaVersion = this.number('schema_version');
    if (schemaVersion > 18) throw new Error('Banco criado por versão mais recente do serviço');
    if (schemaVersion < 2) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0002_infrastructure.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 3) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0003_state_changes.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 4) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0004_history_github.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 5) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0005_collection_windows.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 6) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0006_github_page_cache.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 7) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0007_poll_cadence.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 8) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0008_repository_link_periods.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 9) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0009_replay_cursor.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 10) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0010_project_presence_evidence.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 11) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0011_infrastructure_history.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 12) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0012_room_placement_history.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 13) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0013_github_retry_deadline.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 14) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0014_github_observations.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 15) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0015_github_entity_cursors.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 16) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0016_commands.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 17) this.db.transaction(() => {
      const columns = this.db.pragma('table_info(sources)') as {name:string}[];
      if (!columns.some(column => column.name === 'last_error_code')) this.db.exec('ALTER TABLE sources ADD COLUMN last_error_code TEXT');
      this.db.exec(readFileSync(new URL('./migrations/0017_session_activity.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 18) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0018_operations.sql', import.meta.url), 'utf8'));
    })();
    this.infrastructure = new InfrastructureStore(this.db);
    this.history = new HistoryStore(this.db);
    this.commands = new CommandAudit(this.db);
    this.operations = new OperationsStore(this.db);
  }

  close(): void { this.db.close(); }

  configureSessionSources(projects: readonly ProjectRecord[], sources: readonly SessionSource[]): void {
    this.db.transaction(() => {
      const existing = new Map((this.snapshot().projects as {projectId:string;name:string}[]).map(project => [project.projectId,project.name]));
      for (const project of projects) {
        if (existing.has(project.projectId) && (existing.get(project.projectId) !== project.name || this.resolveProject(project.canonicalPath) !== project.projectId))
          throw new Error('Projeto de sessões diverge do registro');
        if (!existing.has(project.projectId)) this.registerProject(project);
      }
      this.reconcileSessionSourceBindings(sources);
    })();
  }

  reconcileSessionSourceBindings(configured: readonly SessionSource[]): void {
    this.db.transaction(() => {
      const current = this.db.prepare('SELECT source_id,source_version,project_id,provider,account_ref FROM session_source_bindings').all() as
        {source_id:string;source_version:string;project_id:string;provider:string;account_ref:string}[];
      const next = new Map(configured.map(source => [source.sourceId,source]));
      for (const row of current) {
        const source = next.get(row.source_id);
        if (source && (source.projectId !== row.project_id || source.provider !== row.provider || source.accountRef !== row.account_ref))
          throw new Error('Fonte de sessão mudou de identidade; use outro sourceId');
        if (!source) {
          const status = this.db.prepare('SELECT status,status_at FROM sources WHERE source_id = ?').get(row.source_id) as {status:string;status_at:string}|undefined;
          if (status?.status !== 'indisponivel') {
            const previous = this.getCursor(row.source_id,'source-status');
            const offset = (previous?.offset ?? 0)+1;
            const now = new Date(Math.max(Date.now(),status ? Date.parse(status.status_at)+1 : 0)).toISOString();
            this.apply({schemaVersion:'1.0',eventId:`e-${createHash('sha256').update(`${row.source_id}:status:${offset}`).digest('hex')}`,
              sourceId:row.source_id,sourceEventId:`status-${offset}`,sourceVersion:row.source_version,type:'source.unavailable',
              observedAt:now,receivedAt:now,provenance:'observed',ingestionMode:'live',payload:{reason:'source_lost',errorCode:'revoked'},evidenceRefs:[]},
              {sourceId:row.source_id,fileKey:'source-status',generation:0,offset});
          }
          this.db.prepare('DELETE FROM session_source_bindings WHERE source_id = ?').run(row.source_id);
        }
      }
      for (const source of configured) this.db.prepare(`INSERT INTO session_source_bindings(source_id,source_version,project_id,provider,account_ref) VALUES(?,?,?,?,?)
        ON CONFLICT(source_id) DO UPDATE SET source_version=excluded.source_version`).run(source.sourceId,source.sourceVersion,source.projectId,source.provider,source.accountRef);
    })();
  }

  registerProjectsAndLinkRepositories(projects: readonly ProjectRecord[], repositories: readonly Omit<RepositoryLink, 'linkedAt'>[]): void {
    this.db.transaction(() => {
      for (const project of projects) this.registerProject(project);
      for (const repository of repositories) this.history.linkRepository(repository);
    })();
  }

  registerProjectsAndReplaceInventory(projects: readonly ProjectRecord[], inventory: Inventory): void {
    this.db.transaction(() => {
      for (const project of projects) this.registerProject(project);
      this.infrastructure.replaceInventory(inventory);
    })();
  }

  private number(key: string): number {
    return (this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: number }).value;
  }

  private next(key: string): number {
    this.db.prepare('UPDATE meta SET value = value + 1 WHERE key = ?').run(key);
    return this.number(key);
  }

  registerProject(record: ProjectRecord): void {
    const paths = [record.canonicalPath, ...(record.aliases ?? [])].map(normalizeProjectPath);
    if (!record.projectId || !record.name) throw new Error('Projeto incompleto');
    const operation = this.db.transaction(() => {
      const knownAt = new Date().toISOString();
      this.db.prepare('INSERT INTO projects(project_id, name) VALUES (?, ?)').run(record.projectId, record.name);
      this.db.prepare("INSERT INTO project_presence_evidence(project_id,known_at,evidence_kind) VALUES (?,?,'registration')")
        .run(record.projectId,knownAt);
      const addPath = this.db.prepare('INSERT INTO project_paths(path, project_id) VALUES (?, ?)');
      for (const candidate of paths) addPath.run(candidate, record.projectId);
      const index = (this.db.prepare('SELECT COUNT(*) AS count FROM room_placements').get() as { count: number }).count;
      const sectorId = `setor-${String(Math.floor(index / 6) + 1).padStart(2, '0')}`;
      const slotId = `slot-${String((index % 6) + 1).padStart(2, '0')}`;
      this.db.prepare('INSERT INTO room_placements VALUES (?, ?, ?, ?)').run(record.projectId, sectorId, slotId, '1');
      this.db.prepare('INSERT INTO room_placement_versions(project_id,sector_id,slot_id,layout_version,known_at) VALUES (?,?,?,?,?)')
        .run(record.projectId,sectorId,slotId,'1',knownAt);
      this.db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'revision'").run();
      appendStateChange(this.db, 'project.changed', record.projectId, knownAt);
    });
    operation();
  }

  resolveProject(cwd: string | null | undefined): string | null {
    if (!cwd) return null;
    let candidate: string;
    try { candidate = normalizeProjectPath(cwd); }
    catch { return null; }
    const row = this.db.prepare('SELECT project_id FROM project_paths WHERE path = ?').get(candidate) as { project_id: string } | undefined;
    return row?.project_id ?? null;
  }

  matchesProjectPathHash(projectId: string, pathHash: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(pathHash)) return false;
    const paths = this.db.prepare('SELECT path FROM project_paths WHERE project_id = ?').all(projectId) as {path:string}[];
    return paths.some(row => createHash('sha256').update(row.path).digest('hex') === pathHash);
  }

  hasSessionContext(sessionKey: string, sourceId: string, projectId: string, provider: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM sessions WHERE session_key=? AND source_id=? AND project_id=? AND provider=?')
      .get(sessionKey,sourceId,projectId,provider));
  }

  getCursor(sourceId: string, fileKey: string): Cursor | null {
    const row = this.db.prepare('SELECT generation, offset FROM source_cursors WHERE source_id = ? AND file_key = ?').get(sourceId, fileKey) as { generation: number; offset: number } | undefined;
    return row ? { sourceId, fileKey, ...row } : null;
  }

  private advanceCursor(cursor: Cursor): void {
    const previous = this.getCursor(cursor.sourceId, cursor.fileKey);
    if (previous && (cursor.generation < previous.generation || (cursor.generation === previous.generation && cursor.offset < previous.offset))) {
      throw new Error('Cursor retrocedeu');
    }
    this.db.prepare(`INSERT INTO source_cursors(source_id, file_key, generation, offset) VALUES (?, ?, ?, ?)
      ON CONFLICT(source_id, file_key) DO UPDATE SET generation = excluded.generation, offset = excluded.offset`)
      .run(cursor.sourceId, cursor.fileKey, cursor.generation, cursor.offset);
  }

  acknowledgeCursor(cursor: Cursor): void {
    if (!cursor.sourceId || !cursor.fileKey || !Number.isSafeInteger(cursor.generation) || cursor.generation < 0 || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0)
      throw new Error('Cursor inválido');
    this.db.transaction(() => this.advanceCursor(cursor))();
  }

  applyBatch(events: readonly NormalizedEvent[], cursor: Cursor): ApplyResult[] {
    if (events.length === 0) { this.acknowledgeCursor(cursor); return []; }
    return this.db.transaction(() => events.map(event => {
      const result = this.apply(event,cursor);
      if (result.reason && result.reason !== 'duplicate') throw new Error('Lote de fonte inválido');
      return result;
    }))();
  }

  apply(input: unknown, cursor: Cursor): ApplyResult {
    if (!cursor.sourceId || !cursor.fileKey || !Number.isSafeInteger(cursor.generation) || cursor.generation < 0 || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) {
      throw new Error('Cursor inválido');
    }
    const valid = validateEvent(input);
    const event = valid ? input as NormalizedEvent : null;
    if (event && event.sourceId !== cursor.sourceId) throw new Error('Fonte do evento difere do cursor');
    if (event?.ingestionMode === 'demo') throw new Error('Demonstração não entra no store live');
    const operation = this.db.transaction((): ApplyResult => {
      const state = (): ApplyResult => ({ applied: false, revision: this.number('revision'), streamSequence: this.number('stream_sequence') });
      if (!event || (event.projectId && !this.db.prepare('SELECT 1 FROM projects WHERE project_id = ?').get(event.projectId))) {
        const reason = !event ? 'schema_invalid' : 'unknown_project';
        this.db.prepare('INSERT OR IGNORE INTO quarantine(source_id, file_key, generation, offset, reason, recorded_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(cursor.sourceId, cursor.fileKey, cursor.generation, cursor.offset, reason, new Date().toISOString());
        this.advanceCursor(cursor);
        return { ...state(), reason };
      }
      const dedupeKey = event.sourceEventId ?? `${cursor.fileKey}:${cursor.generation}:${cursor.offset}`;
      const eventIdOwner = this.db.prepare('SELECT source_id, dedupe_key FROM events WHERE event_id = ?').get(event.eventId) as { source_id: string; dedupe_key: string } | undefined;
      if (eventIdOwner && (eventIdOwner.source_id !== event.sourceId || eventIdOwner.dedupe_key !== dedupeKey)) throw new Error('eventId colide com outro evento');
      const duplicate = this.db.prepare('SELECT 1 FROM events WHERE source_id = ? AND dedupe_key = ?').get(event.sourceId, dedupeKey);
      if (duplicate) {
        this.advanceCursor(cursor);
        return { ...state(), reason: 'duplicate' };
      }
      const sequence = this.next('stream_sequence');
      this.db.prepare('INSERT INTO events(event_id, source_id, dedupe_key, stream_sequence, event_json) VALUES (?, ?, ?, ?, ?)')
        .run(event.eventId, event.sourceId, dedupeKey, sequence, JSON.stringify(event));
      this.applyState(event);
      const priorSource = this.db.prepare('SELECT status, status_at, last_unavailable_at, last_error_code FROM sources WHERE source_id = ?').get(event.sourceId) as { status: string; status_at: string; last_unavailable_at: string | null; last_error_code: string | null } | undefined;
      const statusIsNewer = !priorSource || compareTimestamp(event.observedAt, priorSource.status_at) >= 0;
      const status = statusIsNewer ? (event.type === 'source.unavailable' ? 'indisponivel' : 'atual') : priorSource.status;
      const statusAt = statusIsNewer ? event.observedAt : priorSource.status_at;
      const errorCode = statusIsNewer ? (event.type === 'source.unavailable' ? event.payload.errorCode ?? null : null) : priorSource.last_error_code;
      const lastUnavailableAt = event.type === 'source.unavailable' && (!priorSource?.last_unavailable_at || compareTimestamp(event.observedAt, priorSource.last_unavailable_at) > 0)
        ? event.observedAt : priorSource?.last_unavailable_at ?? null;
      this.db.prepare(`INSERT INTO sources(source_id, source_version, status, status_at, last_unavailable_at, last_received, last_applied, last_error_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET source_version = excluded.source_version,
          status = excluded.status, status_at = excluded.status_at, last_unavailable_at = excluded.last_unavailable_at,
          last_received = excluded.last_received, last_applied = excluded.last_applied, last_error_code = excluded.last_error_code`)
        .run(event.sourceId, event.sourceVersion, status, statusAt, lastUnavailableAt, event.receivedAt, event.receivedAt, errorCode);
      this.advanceCursor(cursor);
      return { applied: true, revision: this.next('revision'), streamSequence: sequence };
    });
    return operation();
  }

  private applyState(event: NormalizedEvent): void {
    if (event.type === 'github.observed') {
      this.history.recordGithubObservation({eventId:event.eventId,sourceId:event.sourceId,projectId:event.projectId!,repositoryId:event.payload.repositoryId!,entityType:event.payload.entityType!,entityId:event.payload.entityId!,transition:event.payload.transition!,observedAt:event.observedAt});
    } else if (event.type.startsWith('session.')) {
      if (this.isOlderThanSourceLoss(event)) return;
      const row = this.db.prepare('SELECT project_id, source_id, provider, presence, freshness, last_seen, source_unavailable_at FROM sessions WHERE session_key = ?').get(event.sessionKey) as { project_id: string; source_id: string; provider: string; presence: SessionState['presence']; freshness: SessionState['freshness']; last_seen: string; source_unavailable_at: string | null } | undefined;
      if (row && (row.project_id !== event.projectId || row.source_id !== event.sourceId || row.provider !== event.provider)) throw new Error('Identidade de sessão colide com outro contexto');
      const current: SessionState | null = row ? { presence: row.presence, freshness: row.freshness, lastSeen: row.last_seen, sourceUnavailableAt: row.source_unavailable_at } : null;
      const next = reduceSession(current, event.type as SessionSignal, event.observedAt, event.payload.reason === 'source_recovered');
      const provider = event.provider!;
      this.db.prepare(`INSERT INTO sessions(session_key, project_id, source_id, provider, presence, freshness, last_seen, source_unavailable_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET presence = excluded.presence, freshness = excluded.freshness, last_seen = excluded.last_seen, source_unavailable_at = excluded.source_unavailable_at`)
        .run(event.sessionKey, event.projectId, event.sourceId, provider, next.presence, next.freshness, next.lastSeen, next.sourceUnavailableAt);
      if (next.presence === 'encerrada') {
        this.db.prepare("UPDATE agents SET presence = 'encerrada' WHERE session_key = ? AND presence != 'encerrada'").run(event.sessionKey);
        this.db.prepare("UPDATE session_tasks SET status = 'desconhecida' WHERE session_key = ? AND status != 'concluida_declarada'").run(event.sessionKey);
        this.db.prepare("UPDATE session_invocations SET status = 'desconhecida' WHERE session_key = ? AND status = 'observada'").run(event.sessionKey);
      }
    } else if (event.type.startsWith('agent.')) {
      if (this.isOlderThanSourceLoss(event)) return;
      const session = this.db.prepare('SELECT project_id, source_id, provider, presence FROM sessions WHERE session_key = ?').get(event.sessionKey) as { project_id: string; source_id: string; provider: string; presence: Presence } | undefined;
      if (session && (session.project_id !== event.projectId || session.source_id !== event.sourceId || session.provider !== event.provider)) throw new Error('Agente aponta para sessão de outro contexto');
      if (session?.presence === 'encerrada') return;
      if (!session) {
        const provider = event.provider!;
        this.db.prepare(`INSERT INTO sessions(session_key, project_id, source_id, provider, presence, freshness, last_seen, source_unavailable_at)
          VALUES (?, ?, ?, ?, 'desconhecida', 'desconhecido', ?, NULL)`).run(event.sessionKey, event.projectId, event.sourceId, provider, event.observedAt);
      }
      const known = new Set((this.db.prepare('SELECT agent_key FROM agents WHERE session_key = ?').all(event.sessionKey) as { agent_key: string }[]).map(row => row.agent_key));
      const presence = event.type.replace('agent.', '') === 'ended' ? 'encerrada' : event.type.replace('agent.', '') === 'working' ? 'trabalhando' : event.type.replace('agent.', '') === 'waiting' ? 'aguardando' : 'observada';
      const previous = this.db.prepare('SELECT session_key, parent_agent_key, parent_status, presence, last_seen FROM agents WHERE agent_key = ?').get(event.agentKey) as { session_key: string; parent_agent_key: string | null; parent_status: string; presence: Presence; last_seen: string } | undefined;
      if (previous && previous.session_key !== event.sessionKey) throw new Error('Agente aponta para outra sessão');
      if ((previous?.presence === 'encerrada' && event.payload.reason !== 'source_recovered') || (previous && compareTimestamp(event.observedAt, previous.last_seen) < 0)) return;
      const parent = event.payload.parentAgentKey ?? previous?.parent_agent_key ?? null;
      const status = !parent && (event.payload.parentStatus === 'vinculo_pendente' || previous?.parent_status === 'vinculo_pendente') ? 'vinculo_pendente' : parentStatus(event.agentKey!, parent, known);
      this.db.prepare(`INSERT INTO agents(agent_key, session_key, parent_agent_key, presence, parent_status, last_seen) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_key) DO UPDATE SET parent_agent_key = excluded.parent_agent_key, presence = excluded.presence,
          parent_status = excluded.parent_status, last_seen = excluded.last_seen`)
        .run(event.agentKey, event.sessionKey, parent, presence, status, event.observedAt);
      this.db.prepare("UPDATE agents SET parent_status = 'vinculado' WHERE session_key = ? AND parent_agent_key = ? AND parent_status = 'vinculo_pendente'")
        .run(event.sessionKey, event.agentKey);
    } else if (event.type.startsWith('task.') || event.type.startsWith('tool.') || event.type.startsWith('skill.')) {
      if (this.isOlderThanSourceLoss(event)) return;
      const session = this.db.prepare('SELECT project_id, source_id, provider, presence FROM sessions WHERE session_key = ?').get(event.sessionKey) as { project_id: string; source_id: string; provider: string; presence: Presence } | undefined;
      if (!session || session.project_id !== event.projectId || session.source_id !== event.sourceId || session.provider !== event.provider || session.presence === 'encerrada')
        throw new Error('Atividade sem sessão ativa no mesmo contexto');
      if (event.agentKey && !this.db.prepare('SELECT 1 FROM agents WHERE agent_key = ? AND session_key = ?').get(event.agentKey, event.sessionKey))
        throw new Error('Atividade aponta para agente desconhecido');
      if (event.type.startsWith('task.')) {
        const previous = this.db.prepare('SELECT session_key, last_seen, status FROM session_tasks WHERE task_id = ?').get(event.payload.taskId) as { session_key: string; last_seen: string; status: string } | undefined;
        if (previous && previous.session_key !== event.sessionKey) throw new Error('Tarefa aponta para outra sessão');
        if (previous && (previous.status === 'concluida_declarada' || compareTimestamp(event.observedAt, previous.last_seen) < 0)) return;
        const status = event.type === 'task.completed' ? 'concluida_declarada' : event.type === 'task.working' ? 'trabalhando' : event.type === 'task.waiting' ? 'aguardando' : 'observada';
        this.db.prepare(`INSERT INTO session_tasks(task_id,session_key,agent_key,title,status,provenance,last_seen) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(task_id) DO UPDATE SET agent_key=excluded.agent_key,title=excluded.title,status=excluded.status,provenance=excluded.provenance,last_seen=excluded.last_seen`)
          .run(event.payload.taskId,event.sessionKey,event.agentKey??null,event.payload.title,status,event.provenance,event.observedAt);
      } else {
        const kind = event.type.startsWith('tool.') ? 'tool' : 'skill';
        const previous = this.db.prepare('SELECT session_key,kind,last_seen,status FROM session_invocations WHERE invocation_id = ?').get(event.payload.invocationId) as { session_key: string; kind: string; last_seen: string; status: string } | undefined;
        if (previous && (previous.session_key !== event.sessionKey || previous.kind !== kind)) throw new Error('Invocação aponta para outro contexto');
        if (previous && (previous.status === 'resultado_observado' || previous.status === 'falha_observada' || compareTimestamp(event.observedAt, previous.last_seen) < 0)) return;
        const status = event.type === 'tool.result' ? 'resultado_observado' : event.type === 'tool.failed' ? 'falha_observada' : 'observada';
        this.db.prepare(`INSERT INTO session_invocations(invocation_id,session_key,agent_key,kind,name,status,last_seen) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(invocation_id) DO UPDATE SET agent_key=excluded.agent_key,name=excluded.name,status=excluded.status,last_seen=excluded.last_seen`)
          .run(event.payload.invocationId,event.sessionKey,event.agentKey??null,kind,event.payload.name,status,event.observedAt);
      }
    } else if (event.type === 'source.unavailable') {
      const rows = this.db.prepare("SELECT session_key, presence, freshness, last_seen, source_unavailable_at FROM sessions WHERE source_id = ? AND presence != 'encerrada'").all(event.sourceId) as { session_key: string; presence: SessionState['presence']; freshness: SessionState['freshness']; last_seen: string; source_unavailable_at: string | null }[];
      for (const row of rows) {
        const next = reduceSession({ presence: row.presence, freshness: row.freshness, lastSeen: row.last_seen, sourceUnavailableAt: row.source_unavailable_at }, 'source.unavailable', event.observedAt);
        this.db.prepare('UPDATE sessions SET presence = ?, freshness = ?, source_unavailable_at = ? WHERE session_key = ?').run(next.presence, next.freshness, next.sourceUnavailableAt, row.session_key);
        if (next.presence === 'desconhecida' && next.sourceUnavailableAt === event.observedAt) {
          this.db.prepare("UPDATE agents SET presence = 'desconhecida' WHERE session_key = ? AND presence != 'encerrada'").run(row.session_key);
          this.db.prepare("UPDATE session_tasks SET status = 'desconhecida' WHERE session_key = ? AND status != 'concluida_declarada'").run(row.session_key);
          this.db.prepare("UPDATE session_invocations SET status = 'desconhecida' WHERE session_key = ? AND status = 'observada'").run(row.session_key);
        }
      }
    }
  }

  private isOlderThanSourceLoss(event: NormalizedEvent): boolean {
    const source = this.db.prepare('SELECT last_unavailable_at FROM sources WHERE source_id = ?').get(event.sourceId) as { last_unavailable_at: string | null } | undefined;
    return Boolean(source?.last_unavailable_at && compareTimestamp(event.observedAt, source.last_unavailable_at) <= 0);
  }

  snapshot(now: string = new Date().toISOString()): Row {
    return this.db.transaction(() => this.snapshotInsideTransaction(now))();
  }

  historicalSnapshot(at: string, now = new Date().toISOString()): Row {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(at) || !Number.isFinite(Date.parse(at)) ||
        new Date(at).toISOString().slice(0,19) !== at.slice(0,19))
      throw new Error('Instante de replay inválido');
    if (compareTimestamp(at,retentionCutoffs(now).detailCutoffAt)<0) throw new Error('Instante de replay expirado');
    const input = this.db.transaction(() => ({
      projects: this.db.prepare('SELECT project_id,name FROM projects ORDER BY project_id').all() as {project_id:string;name:string}[],
      placements: this.db.prepare('SELECT id,project_id,sector_id,slot_id,layout_version,known_at FROM room_placement_versions WHERE substr(known_at,1,19)<=?')
        .all(at.slice(0,19)) as {id:number;project_id:string;sector_id:string;slot_id:string;layout_version:string;known_at:string}[],
      projectEvidence: this.db.prepare('SELECT project_id,known_at FROM project_presence_evidence').all() as {project_id:string;known_at:string}[],
      githubProjects: this.db.prepare('SELECT project_id,occurred_at FROM history_milestones WHERE substr(occurred_at,1,19)<=?').all(at.slice(0,19)) as {project_id:string;occurred_at:string}[],
      events: this.db.prepare("SELECT stream_sequence,event_json FROM events WHERE substr(json_extract(event_json,'$.observedAt'),1,19)<=?").all(at.slice(0,19)) as {stream_sequence:number;event_json:string}[],
      ciIncidents: this.history.ciIncidentsAt(at),
      infrastructure: this.infrastructure.historicalSnapshot(at),
      revision: this.number('revision'),
      streamSequence: this.number('stream_sequence')
    }))();
    const historicalEvents = input.events.map(row=>({ ...row,event:JSON.parse(row.event_json) as NormalizedEvent }))
      .filter(row=>compareTimestamp(row.event.observedAt,at)<=0)
      .sort((a,b)=>compareTimestamp(a.event.observedAt,b.event.observedAt)||a.stream_sequence-b.stream_sequence);
    const visibleProjects=new Set(input.projectEvidence.filter(row=>compareTimestamp(row.known_at,at)<=0).map(row=>row.project_id));
    for(const row of historicalEvents)if(row.event.projectId)visibleProjects.add(row.event.projectId);
    for(const row of input.githubProjects)if(compareTimestamp(row.occurred_at,at)<=0)visibleProjects.add(row.project_id);
    const placements=new Map<string,(typeof input.placements)[number]>();
    for(const row of input.placements)if(visibleProjects.has(row.project_id) && compareTimestamp(row.known_at,at)<=0){
      const prior=placements.get(row.project_id);
      if(!prior || compareTimestamp(row.known_at,prior.known_at)>0 || (compareTimestamp(row.known_at,prior.known_at)===0 && row.id>prior.id))
        placements.set(row.project_id,row);
    }
    const projection = new EventStore(':memory:');
    try {
      projection.db.transaction(() => {
        const project = projection.db.prepare('INSERT INTO projects(project_id,name) VALUES (?,?)');
        const placement = projection.db.prepare('INSERT INTO room_placements(project_id,sector_id,slot_id,layout_version) VALUES (?,?,?,?)');
        for (const row of input.projects) if(visibleProjects.has(row.project_id))project.run(row.project_id,row.name);
        for (const row of placements.values())placement.run(row.project_id,row.sector_id,row.slot_id,row.layout_version);
      })();
      let replayOffset = 0;
      for (const row of historicalEvents) {
        projection.apply(row.event,{sourceId:row.event.sourceId,fileKey:'historical-replay',generation:0,offset:++replayOffset});
      }
      const state = projection.snapshot(at);
      const activeSourceLosses=projection.db.prepare("SELECT source_id,last_unavailable_at FROM sources WHERE status='indisponivel' AND last_unavailable_at IS NOT NULL ORDER BY source_id")
        .all() as {source_id:string;last_unavailable_at:string}[];
      const sequences = new Map(historicalEvents.map(row=>[row.event.eventId,row.stream_sequence]));
      const feed = (state.feed as {eventId:string;streamSequence:number}[]).map(event=>({ ...event,streamSequence:sequences.get(event.eventId)??event.streamSequence }));
      return { ...state, ...input.infrastructure, mode:'replay', at, layoutReference:visibleProjects.size===0?'unavailable':placements.size===visibleProjects.size?'recorded':placements.size?'partial':'unavailable', revision:input.revision, streamSequence:input.streamSequence,
        feed, ciIncidents:input.ciIncidents, capabilities:['sessions','agents',...(state.capabilities as string[]).filter(value => ['tasks','tools','skills'].includes(value)),'feed','ci-incidents',...(input.infrastructure.infrastructureReference==='recorded'?['infrastructure']:[])], coverage:{status:activeSourceLosses.length?'gap':historicalEvents.length?'unknown':'none',
          reason:'expected_collection_windows_not_recorded',gaps:activeSourceLosses.map(row=>({sourceId:row.source_id,start:row.last_unavailable_at,end:at,reason:'source_unavailable'}))} };
    } finally { projection.close(); }
  }

  private snapshotInsideTransaction(now: string): Row {
    const projects = (this.db.prepare('SELECT project_id, name FROM projects ORDER BY project_id').all() as { project_id: string; name: string }[]).map(row => ({ projectId: row.project_id, name: row.name }));
    const roomPlacements = (this.db.prepare('SELECT * FROM room_placements ORDER BY sector_id, slot_id').all() as Row[]).map(row => ({ projectId: row.project_id, sectorId: row.sector_id, slotId: row.slot_id, layoutVersion: row.layout_version }));
    const sessions = (this.db.prepare('SELECT * FROM sessions ORDER BY session_key').all() as Row[]).map(row => ({ sessionKey: row.session_key, projectId: row.project_id, provider: row.provider, presence: row.presence, freshness: row.freshness, lastSeen: row.last_seen }));
    const agents = (this.db.prepare('SELECT * FROM agents ORDER BY agent_key').all() as Row[]).map(row => ({ agentKey: row.agent_key, sessionKey: row.session_key, ...(row.parent_agent_key ? { parentAgentKey: row.parent_agent_key } : {}), presence: row.presence, parentStatus: row.parent_status }));
    const tasks = (this.db.prepare('SELECT * FROM session_tasks ORDER BY task_id').all() as Row[]).map(row => ({ taskId: row.task_id, sessionKey: row.session_key, ...(row.agent_key ? { agentKey: row.agent_key } : {}), title: row.title, status: row.status, provenance: row.provenance }));
    const invocations = (this.db.prepare('SELECT * FROM session_invocations ORDER BY invocation_id').all() as Row[]).map(row => ({ invocationId: row.invocation_id, sessionKey: row.session_key, ...(row.agent_key ? { agentKey: row.agent_key } : {}), kind: row.kind, name: row.name, status: row.status }));
    const sources = (this.db.prepare('SELECT * FROM sources ORDER BY source_id').all() as Row[]).map(row => ({ sourceId: row.source_id, sourceVersion: row.source_version, status: row.status, ...(row.last_error_code ? {errorCode:row.last_error_code} : {}), lastReceived: row.last_received, lastApplied: row.last_applied }));
    const feed = (this.db.prepare('SELECT event_json, stream_sequence FROM events ORDER BY stream_sequence DESC LIMIT 100').all() as { event_json: string; stream_sequence: number }[]).reverse().map(row => {
      const event = JSON.parse(row.event_json) as NormalizedEvent;
      return { eventId: event.eventId, streamSequence: row.stream_sequence, type: event.type, observedAt: event.observedAt, ...(event.projectId ? { projectId: event.projectId } : {}), ...(event.sessionKey ? { sessionKey: event.sessionKey } : {}), ...(event.agentKey ? { agentKey: event.agentKey } : {}), provenance: event.provenance };
    });
    return { schemaVersion: '1.0', mode: 'live', revision: this.number('revision'), streamSequence: this.number('stream_sequence'), projects, roomPlacements, sessions, agents, tasks, invocations, feed, sources,
      ...this.infrastructure.snapshot(now), capabilities: ['sessions', 'agents',...(tasks.length ? ['tasks'] : []),
        ...(invocations.some(item => item.kind === 'tool') ? ['tools'] : []),
        ...(invocations.some(item => item.kind === 'skill') ? ['skills'] : []),'feed', 'infrastructure'] };
  }

  changesSince(cursor: number, limit = 1001): StreamChange[] {
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1001)
      throw new Error('Cursor ou limite inválido');
    return (this.db.prepare(`SELECT stream_sequence AS streamSequence, type, object_id AS objectId FROM (
      SELECT stream_sequence, 'event.changed' AS type, NULL AS object_id FROM events WHERE stream_sequence > ?
      UNION ALL
      SELECT stream_sequence, type, object_id FROM state_changes WHERE stream_sequence > ?
    ) ORDER BY stream_sequence LIMIT ?`).all(cursor, cursor, limit) as { streamSequence: number; type: string; objectId: string | null }[])
      .map(row => ({ streamSequence: row.streamSequence, type: row.type,
        ...(row.type === 'resource.changed' && row.objectId ? { resourceId: row.objectId } : {}),
        ...(row.type === 'project.changed' && row.objectId ? { projectId: row.objectId } : {}) }));
  }

  transportBaseline(): number { return this.number('transport_baseline'); }

  changeWindow(cursor: number, limit = 1001): { baseline: number; current: number; changes: StreamChange[] } {
    return this.db.transaction(() => ({
      baseline: this.transportBaseline(),
      current: this.number('stream_sequence'),
      changes: this.changesSince(cursor, limit)
    }))();
  }

  quarantineCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM quarantine').get() as { count: number }).count;
  }
}
