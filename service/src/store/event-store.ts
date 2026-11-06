import Database from 'better-sqlite3';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { normalizeProjectPath, type ProjectRecord } from '../domain/identity.ts';
import { compareTimestamp, reduceSession, parentStatus, type SessionSignal, type SessionState, type Presence } from '../domain/session-reducer.ts';
import { InfrastructureStore } from '../infra/infrastructure-store.ts';
import type { Inventory } from '../infra/inventory.ts';
import { appendStateChange } from './change-log.ts';
import { HistoryStore } from '../history/history.ts';

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
  payload: { parentAgentKey?: string; reason?: string };
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

  constructor(databasePath: string) {
    if (!databasePath) throw new Error('Caminho do banco obrigatório');
    this.db = new Database(databasePath, { timeout: 5000 });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    const schemaVersion = this.number('schema_version');
    if (schemaVersion > 4) throw new Error('Banco criado por versão mais recente do serviço');
    if (schemaVersion < 2) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0002_infrastructure.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 3) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0003_state_changes.sql', import.meta.url), 'utf8'));
    })();
    if (schemaVersion < 4) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/0004_history_github.sql', import.meta.url), 'utf8'));
    })();
    this.infrastructure = new InfrastructureStore(this.db);
    this.history = new HistoryStore(this.db);
  }

  close(): void { this.db.close(); }

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
      this.db.prepare('INSERT INTO projects(project_id, name) VALUES (?, ?)').run(record.projectId, record.name);
      const addPath = this.db.prepare('INSERT INTO project_paths(path, project_id) VALUES (?, ?)');
      for (const candidate of paths) addPath.run(candidate, record.projectId);
      const index = (this.db.prepare('SELECT COUNT(*) AS count FROM room_placements').get() as { count: number }).count;
      const sectorId = `setor-${String(Math.floor(index / 6) + 1).padStart(2, '0')}`;
      const slotId = `slot-${String((index % 6) + 1).padStart(2, '0')}`;
      this.db.prepare('INSERT INTO room_placements VALUES (?, ?, ?, ?)').run(record.projectId, sectorId, slotId, '1');
      this.db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'revision'").run();
      appendStateChange(this.db, 'project.changed', record.projectId, new Date().toISOString());
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
      const priorSource = this.db.prepare('SELECT status, status_at, last_unavailable_at FROM sources WHERE source_id = ?').get(event.sourceId) as { status: string; status_at: string; last_unavailable_at: string | null } | undefined;
      const statusIsNewer = !priorSource || compareTimestamp(event.observedAt, priorSource.status_at) > 0;
      const status = statusIsNewer ? (event.type === 'source.unavailable' ? 'indisponivel' : 'atual') : priorSource.status;
      const statusAt = statusIsNewer ? event.observedAt : priorSource.status_at;
      const lastUnavailableAt = event.type === 'source.unavailable' && (!priorSource?.last_unavailable_at || compareTimestamp(event.observedAt, priorSource.last_unavailable_at) > 0)
        ? event.observedAt : priorSource?.last_unavailable_at ?? null;
      this.db.prepare(`INSERT INTO sources(source_id, source_version, status, status_at, last_unavailable_at, last_received, last_applied) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET source_version = excluded.source_version,
          status = excluded.status, status_at = excluded.status_at, last_unavailable_at = excluded.last_unavailable_at,
          last_received = excluded.last_received, last_applied = excluded.last_applied`)
        .run(event.sourceId, event.sourceVersion, status, statusAt, lastUnavailableAt, event.receivedAt, event.receivedAt);
      this.advanceCursor(cursor);
      return { applied: true, revision: this.next('revision'), streamSequence: sequence };
    });
    return operation();
  }

  private applyState(event: NormalizedEvent): void {
    if (event.type.startsWith('session.')) {
      if (this.isOlderThanSourceLoss(event)) return;
      const row = this.db.prepare('SELECT project_id, source_id, provider, presence, freshness, last_seen, source_unavailable_at FROM sessions WHERE session_key = ?').get(event.sessionKey) as { project_id: string; source_id: string; provider: string; presence: SessionState['presence']; freshness: SessionState['freshness']; last_seen: string; source_unavailable_at: string | null } | undefined;
      if (row && (row.project_id !== event.projectId || row.source_id !== event.sourceId || row.provider !== event.provider)) throw new Error('Identidade de sessão colide com outro contexto');
      const current: SessionState | null = row ? { presence: row.presence, freshness: row.freshness, lastSeen: row.last_seen, sourceUnavailableAt: row.source_unavailable_at } : null;
      const next = reduceSession(current, event.type as SessionSignal, event.observedAt);
      const provider = event.provider!;
      this.db.prepare(`INSERT INTO sessions(session_key, project_id, source_id, provider, presence, freshness, last_seen, source_unavailable_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET presence = excluded.presence, freshness = excluded.freshness, last_seen = excluded.last_seen, source_unavailable_at = excluded.source_unavailable_at`)
        .run(event.sessionKey, event.projectId, event.sourceId, provider, next.presence, next.freshness, next.lastSeen, next.sourceUnavailableAt);
      if (next.presence === 'encerrada') this.db.prepare("UPDATE agents SET presence = 'encerrada' WHERE session_key = ? AND presence != 'encerrada'").run(event.sessionKey);
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
      const previous = this.db.prepare('SELECT session_key, parent_agent_key, presence, last_seen FROM agents WHERE agent_key = ?').get(event.agentKey) as { session_key: string; parent_agent_key: string | null; presence: Presence; last_seen: string } | undefined;
      if (previous && previous.session_key !== event.sessionKey) throw new Error('Agente aponta para outra sessão');
      if (previous?.presence === 'encerrada' || (previous && compareTimestamp(event.observedAt, previous.last_seen) < 0)) return;
      const parent = event.payload.parentAgentKey ?? previous?.parent_agent_key ?? null;
      const status = parentStatus(event.agentKey!, parent, known);
      this.db.prepare(`INSERT INTO agents(agent_key, session_key, parent_agent_key, presence, parent_status, last_seen) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_key) DO UPDATE SET parent_agent_key = excluded.parent_agent_key, presence = excluded.presence,
          parent_status = excluded.parent_status, last_seen = excluded.last_seen`)
        .run(event.agentKey, event.sessionKey, parent, presence, status, event.observedAt);
      this.db.prepare("UPDATE agents SET parent_status = 'vinculado' WHERE session_key = ? AND parent_agent_key = ? AND parent_status = 'vinculo_pendente'")
        .run(event.sessionKey, event.agentKey);
    } else if (event.type === 'source.unavailable') {
      const rows = this.db.prepare("SELECT session_key, presence, freshness, last_seen, source_unavailable_at FROM sessions WHERE source_id = ? AND presence != 'encerrada'").all(event.sourceId) as { session_key: string; presence: SessionState['presence']; freshness: SessionState['freshness']; last_seen: string; source_unavailable_at: string | null }[];
      for (const row of rows) {
        const next = reduceSession({ presence: row.presence, freshness: row.freshness, lastSeen: row.last_seen, sourceUnavailableAt: row.source_unavailable_at }, 'source.unavailable', event.observedAt);
        this.db.prepare('UPDATE sessions SET presence = ?, freshness = ?, source_unavailable_at = ? WHERE session_key = ?').run(next.presence, next.freshness, next.sourceUnavailableAt, row.session_key);
        if (next.presence === 'desconhecida' && next.sourceUnavailableAt === event.observedAt) {
          this.db.prepare("UPDATE agents SET presence = 'desconhecida' WHERE session_key = ? AND presence != 'encerrada'").run(row.session_key);
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

  private snapshotInsideTransaction(now: string): Row {
    const projects = (this.db.prepare('SELECT project_id, name FROM projects ORDER BY project_id').all() as { project_id: string; name: string }[]).map(row => ({ projectId: row.project_id, name: row.name }));
    const roomPlacements = (this.db.prepare('SELECT * FROM room_placements ORDER BY sector_id, slot_id').all() as Row[]).map(row => ({ projectId: row.project_id, sectorId: row.sector_id, slotId: row.slot_id, layoutVersion: row.layout_version }));
    const sessions = (this.db.prepare('SELECT * FROM sessions ORDER BY session_key').all() as Row[]).map(row => ({ sessionKey: row.session_key, projectId: row.project_id, provider: row.provider, presence: row.presence, freshness: row.freshness, lastSeen: row.last_seen }));
    const agents = (this.db.prepare('SELECT * FROM agents ORDER BY agent_key').all() as Row[]).map(row => ({ agentKey: row.agent_key, sessionKey: row.session_key, ...(row.parent_agent_key ? { parentAgentKey: row.parent_agent_key } : {}), presence: row.presence, parentStatus: row.parent_status }));
    const sources = (this.db.prepare('SELECT * FROM sources ORDER BY source_id').all() as Row[]).map(row => ({ sourceId: row.source_id, sourceVersion: row.source_version, status: row.status, lastReceived: row.last_received, lastApplied: row.last_applied }));
    const feed = (this.db.prepare('SELECT event_json, stream_sequence FROM events ORDER BY stream_sequence DESC LIMIT 100').all() as { event_json: string; stream_sequence: number }[]).reverse().map(row => {
      const event = JSON.parse(row.event_json) as NormalizedEvent;
      return { eventId: event.eventId, streamSequence: row.stream_sequence, type: event.type, observedAt: event.observedAt, ...(event.projectId ? { projectId: event.projectId } : {}), ...(event.sessionKey ? { sessionKey: event.sessionKey } : {}), ...(event.agentKey ? { agentKey: event.agentKey } : {}), provenance: event.provenance };
    });
    return { schemaVersion: '1.0', mode: 'live', revision: this.number('revision'), streamSequence: this.number('stream_sequence'), projects, roomPlacements, sessions, agents, tasks: [], invocations: [], feed, sources,
      ...this.infrastructure.snapshot(now), capabilities: ['sessions', 'agents', 'feed', 'infrastructure'] };
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
