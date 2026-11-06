import type Database from 'better-sqlite3';

type EventRow = { event_id: string; stream_sequence: number; event_json: string };

export interface RepositoryLink {
  repositoryId: string;
  owner: string;
  name: string;
  projectId: string;
  linkedAt: string;
}

export class HistoryStore {
  private readonly db: Database.Database;
  constructor(db: Database.Database) { this.db = db; }

  linkRepository(input: { repositoryId: string; owner: string; name: string; projectId: string }, at = new Date().toISOString()): RepositoryLink {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(input.owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(input.name) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(input.repositoryId)) throw new Error('Identidade de repositório inválida');
    if (!this.db.prepare('SELECT 1 FROM projects WHERE project_id = ?').get(input.projectId)) throw new Error('Projeto desconhecido');
    this.db.prepare(`INSERT INTO project_repositories(repository_id, owner, name, project_id, linked_at, active)
      VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(repository_id, project_id) DO UPDATE SET owner=excluded.owner, name=excluded.name, linked_at=excluded.linked_at, active=1`)
      .run(input.repositoryId, input.owner, input.name, input.projectId, at);
    return { ...input, linkedAt: at };
  }

  unlinkRepository(repositoryId: string, projectId: string, at = new Date().toISOString()): boolean {
    return this.db.prepare('UPDATE project_repositories SET active=0, unlinked_at=? WHERE repository_id=? AND project_id=? AND active=1').run(at, repositoryId, projectId).changes > 0;
  }

  repositories(): RepositoryLink[] {
    return (this.db.prepare('SELECT repository_id, owner, name, project_id, linked_at FROM project_repositories WHERE active=1 ORDER BY owner,name,project_id').all() as { repository_id: string; owner: string; name: string; project_id: string; linked_at: string }[])
      .map(r => ({ repositoryId: r.repository_id, owner: r.owner, name: r.name, projectId: r.project_id, linkedAt: r.linked_at }));
  }

  recordGithubMilestone(input: { repositoryId: string; projectId: string; entityType: 'pull_request' | 'workflow'; entityId: string; transition: string; occurredAt: string; payload: Record<string, unknown> }): boolean {
    const linked = this.db.prepare('SELECT 1 FROM project_repositories WHERE repository_id=? AND project_id=? AND active=1').get(input.repositoryId, input.projectId);
    if (!linked) return false;
    const key = `${input.entityType}:${input.entityId}:${input.transition}`;
    const result = this.db.prepare(`INSERT OR IGNORE INTO history_milestones(repository_id, project_id, entity_type, entity_id, transition, occurred_at, payload_json)
      VALUES (?,?,?,?,?,?,?)`).run(input.repositoryId, input.projectId, input.entityType, input.entityId, input.transition, input.occurredAt, JSON.stringify(input.payload));
    if (result.changes) {
      this.db.prepare("INSERT INTO state_changes(stream_sequence, type, object_id, observed_at) VALUES ((SELECT value+1 FROM meta WHERE key='stream_sequence'), 'history.changed', ?, ?)").run(input.projectId, input.occurredAt);
      this.db.prepare("UPDATE meta SET value=value+1 WHERE key='stream_sequence'").run();
      this.db.prepare("UPDATE meta SET value=value+1 WHERE key='revision'").run();
    }
    return result.changes > 0;
  }

  replay(cursor: number, limit = 500): { viewMode: 'replay'; fromSequence: number; throughSequence: number; events: unknown[]; nextCursor: number | null } {
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Cursor de replay inválido');
    const events = this.db.prepare('SELECT event_id, stream_sequence, event_json FROM events WHERE stream_sequence>? ORDER BY stream_sequence LIMIT ?').all(cursor, limit + 1) as EventRow[];
    const page = events.slice(0, limit);
    return { viewMode: 'replay', fromSequence: cursor, throughSequence: page.at(-1)?.stream_sequence ?? cursor,
      events: page.map(r => ({ eventId: r.event_id, streamSequence: r.stream_sequence, ...JSON.parse(r.event_json) as object, viewMode: 'replay' })),
      nextCursor: events.length > limit ? page.at(-1)!.stream_sequence : null };
  }

  daySummary(date: string, timeZone: string): Record<string, unknown> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data inválida');
    new Intl.DateTimeFormat('pt-BR', { timeZone }).format(new Date(`${date}T12:00:00Z`));
    const rows = this.db.prepare("SELECT stream_sequence,event_json FROM events WHERE json_extract(event_json,'$.observedAt') IS NOT NULL ORDER BY stream_sequence").all() as { stream_sequence: number; event_json: string }[];
    const events: (Record<string, unknown> & { streamSequence: number })[] = rows.map(r => ({ ...(JSON.parse(r.event_json) as Record<string, unknown>), streamSequence: r.stream_sequence }));
    const dayStart = zonedMidnight(date, timeZone);
    const calendar = new Date(`${date}T12:00:00Z`);
    calendar.setUTCDate(calendar.getUTCDate() + 1);
    const nextDate = calendar.toISOString().slice(0, 10);
    const dayEnd = zonedMidnight(nextDate, timeZone);
    const sessions = intervals(events, 'sessionKey', dayStart, dayEnd);
    const agents = intervals(events, 'agentKey', dayStart, dayEnd);
    const sessionUnion = unionDuration(sessions);
    const agentMs = agents.reduce((sum, x) => sum + x.end - x.start, 0);
    const dayEvents = events.filter(e => { const t = Date.parse(String(e.observedAt)); return t >= dayStart && t < dayEnd; });
    return { date, timeZone, elapsedDurationMs: sessionUnion, agentHours: agentMs / 3600000,
      coverage: { status: dayEvents.length ? 'unknown' : 'none', observedEventCount: dayEvents.length, reason: 'expected_collection_windows_not_recorded', gaps: dayEvents.length ? null : [{ start: new Date(dayStart).toISOString(), end: new Date(dayEnd).toISOString(), reason: 'no_observations' }] },
      milestones: (this.db.prepare('SELECT repository_id,project_id,entity_type,entity_id,transition,occurred_at,payload_json FROM history_milestones WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at').all(new Date(dayStart).toISOString(), new Date(dayEnd).toISOString()) as { repository_id:string;project_id:string;entity_type:string;entity_id:string;transition:string;occurred_at:string;payload_json:string }[]).map(r=>({repositoryId:r.repository_id,projectId:r.project_id,entityType:r.entity_type,entityId:r.entity_id,transition:r.transition,occurredAt:r.occurred_at,payload:JSON.parse(r.payload_json)})),
      incidentMarkers: [], costs: null };
  }
}

function zonedMidnight(date: string, zone: string): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const localAsUtc = Date.UTC(Number(values.year), Number(values.month)-1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    guess += target - localAsUtc;
  }
  return guess;
}

function intervals(events: Record<string, unknown>[], key: string, start: number, end: number): { start: number; end: number }[] {
  const byEntity = new Map<string, { at: number; type: string }[]>();
  for (const event of events) if (typeof event[key] === 'string') {
    const at = Date.parse(String(event.observedAt)); if (!Number.isFinite(at) || at >= end) continue;
    const id = String(event[key]); byEntity.set(id, [...(byEntity.get(id) ?? []), { at, type: String(event.type) }]);
  }
  const result: {start:number;end:number}[] = [];
  for (const list of byEntity.values()) {
    list.sort((a,b)=>a.at-b.at); let opened: number | null = null;
    for (const e of list) {
      if (e.type.endsWith('.ended')) { if (opened !== null) result.push({start:Math.max(opened,start),end:Math.min(e.at,end)}); opened=null; }
      else if (opened === null) opened=e.at;
    }
    if (opened !== null) result.push({start:Math.max(opened,start),end});
  }
  return result.filter(x=>x.end>x.start);
}
function unionDuration(items: {start:number;end:number}[]): number {
  const sorted=[...items].sort((a,b)=>a.start-b.start); let end=-Infinity,total=0;
  for(const x of sorted){if(x.end>end){total+=x.end-Math.max(end,x.start);end=x.end;}}
  return total;
}
