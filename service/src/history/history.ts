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
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(input.owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(input.name) || input.name === '.' || input.name === '..' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(input.repositoryId)) throw new Error('Identidade de repositório inválida');
    if (!this.db.prepare('SELECT 1 FROM projects WHERE project_id = ?').get(input.projectId)) throw new Error('Projeto desconhecido');
    const identity = this.db.prepare('SELECT owner,name FROM project_repositories WHERE repository_id=? LIMIT 1').get(input.repositoryId) as {owner:string;name:string}|undefined;
    if (identity && (identity.owner !== input.owner || identity.name !== input.name)) throw new Error('ID de repositório vinculado a outro owner/repo');
    this.db.prepare(`INSERT INTO project_repositories(repository_id, owner, name, project_id, linked_at, active)
      VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(repository_id, project_id) DO UPDATE SET linked_at=CASE WHEN project_repositories.active=1 THEN project_repositories.linked_at ELSE excluded.linked_at END, unlinked_at=NULL, active=1`)
      .run(input.repositoryId, input.owner, input.name, input.projectId, at);
    const row = this.db.prepare('SELECT linked_at FROM project_repositories WHERE repository_id=? AND project_id=?').get(input.repositoryId, input.projectId) as {linked_at:string};
    return { ...input, linkedAt: row.linked_at };
  }

  unlinkRepository(repositoryId: string, projectId: string, at = new Date().toISOString()): boolean {
    return this.db.prepare('UPDATE project_repositories SET active=0, unlinked_at=? WHERE repository_id=? AND project_id=? AND active=1').run(at, repositoryId, projectId).changes > 0;
  }

  repositories(): RepositoryLink[] {
    return (this.db.prepare('SELECT repository_id, owner, name, project_id, linked_at FROM project_repositories WHERE active=1 ORDER BY owner,name,project_id').all() as { repository_id: string; owner: string; name: string; project_id: string; linked_at: string }[])
      .map(r => ({ repositoryId: r.repository_id, owner: r.owner, name: r.name, projectId: r.project_id, linkedAt: r.linked_at }));
  }

  hasSuccessfulPoll(repositoryId: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM github_poll_state WHERE repository_id=?').get(repositoryId));
  }

  markPollSuccess(repositoryId: string, at = new Date().toISOString()): void {
    this.db.prepare('INSERT INTO github_poll_state(repository_id,last_success_at) VALUES (?,?) ON CONFLICT(repository_id) DO UPDATE SET last_success_at=excluded.last_success_at').run(repositoryId,at);
  }

  recordGithubMilestone(input: { repositoryId: string; projectId: string; entityType: 'pull_request' | 'workflow'; entityId: string; transition: string; occurredAt: string; payload: Record<string, unknown>; ingestionMode?: 'live' | 'backfill' }): boolean {
    const operation = this.db.transaction(() => {
      const linked = this.db.prepare('SELECT 1 FROM project_repositories WHERE repository_id=? AND project_id=? AND active=1').get(input.repositoryId, input.projectId);
      if (!linked) return false;
      const result = this.db.prepare(`INSERT OR IGNORE INTO history_milestones(repository_id, project_id, entity_type, entity_id, transition, occurred_at, payload_json, ingestion_mode)
        VALUES (?,?,?,?,?,?,?,?)`).run(input.repositoryId, input.projectId, input.entityType, input.entityId, input.transition, input.occurredAt, JSON.stringify(input.payload),input.ingestionMode??'live');
      if (!result.changes) return false;
      this.db.prepare("UPDATE meta SET value=value+1 WHERE key='stream_sequence'").run();
      const sequence = (this.db.prepare("SELECT value FROM meta WHERE key='stream_sequence'").get() as {value:number}).value;
      this.db.prepare('UPDATE history_milestones SET stream_sequence=? WHERE repository_id=? AND project_id=? AND entity_type=? AND entity_id=? AND transition=?')
        .run(sequence,input.repositoryId,input.projectId,input.entityType,input.entityId,input.transition);
      this.db.prepare("INSERT INTO state_changes(stream_sequence,type,object_id,observed_at) VALUES (?,'history.changed',?,?)").run(sequence,input.projectId,input.occurredAt);
      this.db.prepare("UPDATE meta SET value=value+1 WHERE key='revision'").run();
      this.recordEffectAndIncident(input);
      return true;
    });
    return operation();
  }

  private recordEffectAndIncident(input: { repositoryId:string; projectId:string; entityType:'pull_request'|'workflow'; entityId:string; transition:string; occurredAt:string; payload:Record<string,unknown>; ingestionMode?:'live'|'backfill' }): void {
    const mode=input.ingestionMode??'live';
    if (input.entityType === 'pull_request' && input.transition === 'merged') {
      const cause = JSON.stringify([input.projectId,input.repositoryId,'pull_request',input.entityId,'merged']);
      this.db.prepare(`INSERT OR IGNORE INTO history_effects(causation_id,effect_type,project_id,occurred_at,stream_sequence,duration_ms,ingestion_mode,parameters_json)
        VALUES (?,'merge.celebration',?,?,(SELECT value FROM meta WHERE key='stream_sequence'),8000,?,?)`).run(cause,input.projectId,input.occurredAt,mode,JSON.stringify({source:'github'}));
      return;
    }
    if (input.entityType !== 'workflow' || !/^attempt-\d+-/.test(input.transition)) return;
    const payload = input.payload;
    const attempt = Number(/^attempt-(\d+)-/.exec(input.transition)?.[1]);
    const workflowId = Number(payload.workflowId); const runId = Number(payload.runId);
    const ref = typeof payload.ref === 'string' ? payload.ref : '';
    const sha = typeof payload.headSha === 'string' ? payload.headSha : '';
    const url = typeof payload.url === 'string' ? payload.url : '';
    if (![attempt,workflowId,runId].every(Number.isSafeInteger) || !ref || !sha || !url) return;
    if (input.transition.endsWith('-failure')) {
      const open=this.db.prepare('SELECT incident_id,last_observed_at FROM history_incidents WHERE repository_id=? AND project_id=? AND workflow_id=? AND ref=? AND resolved_at IS NULL')
        .get(input.repositoryId,input.projectId,workflowId,ref) as {incident_id:string;last_observed_at:string}|undefined;
      const newerSuccess=this.db.prepare(`SELECT 1 FROM history_milestones WHERE repository_id=? AND project_id=? AND entity_type='workflow' AND transition LIKE 'attempt-%-success'
        AND occurred_at>=? AND CAST(json_extract(payload_json,'$.workflowId') AS INTEGER)=? AND json_extract(payload_json,'$.ref')=? LIMIT 1`)
        .get(input.repositoryId,input.projectId,input.occurredAt,workflowId,ref);
      if (open && input.occurredAt>=open.last_observed_at) {
        this.db.prepare('UPDATE history_incidents SET run_id=?,head_sha=?,last_observed_at=?,last_attempt=?,evidence_url=? WHERE incident_id=?')
          .run(runId,sha,input.occurredAt,attempt,url,open.incident_id);
      } else if (!open && !newerSuccess) {
        const incidentId=JSON.stringify([input.projectId,input.repositoryId,workflowId,ref,runId,attempt]);
        this.db.prepare(`INSERT INTO history_incidents(incident_id,repository_id,project_id,workflow_id,run_id,ref,head_sha,opened_at,resolved_at,last_observed_at,last_attempt,evidence_url)
          VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?)`).run(incidentId,input.repositoryId,input.projectId,workflowId,runId,ref,sha,input.occurredAt,input.occurredAt,attempt,url);
      }
      const cause = JSON.stringify([input.projectId,input.repositoryId,workflowId,runId,ref,sha,attempt,'failure']);
      this.db.prepare(`INSERT OR IGNORE INTO history_effects(causation_id,effect_type,project_id,occurred_at,stream_sequence,duration_ms,ingestion_mode,parameters_json)
        VALUES (?,'ci.alarm',?,?,(SELECT value FROM meta WHERE key='stream_sequence'),5000,?,?)`).run(cause,input.projectId,input.occurredAt,mode,JSON.stringify({source:'github'}));
    } else if (input.transition.endsWith('-success')) {
      this.db.prepare(`UPDATE history_incidents SET resolved_at=?,last_observed_at=?,last_attempt=?,evidence_url=? WHERE repository_id=? AND project_id=? AND workflow_id=? AND ref=? AND resolved_at IS NULL AND last_observed_at<=?`)
        .run(input.occurredAt,input.occurredAt,attempt,url,input.repositoryId,input.projectId,workflowId,ref,input.occurredAt);
    }
  }

  replay(cursor: number, limit = 500): { viewMode: 'replay'; fromSequence: number; throughSequence: number; events: unknown[]; nextCursor: number | null; hasMore: boolean } {
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Cursor de replay inválido');
    const events = this.db.prepare('SELECT event_id, stream_sequence, event_json FROM events WHERE stream_sequence>? ORDER BY stream_sequence LIMIT ?').all(cursor,limit+1) as EventRow[];
    const milestones = this.db.prepare('SELECT repository_id,project_id,entity_type,entity_id,transition,occurred_at,payload_json,ingestion_mode,stream_sequence FROM history_milestones WHERE stream_sequence>? ORDER BY stream_sequence LIMIT ?').all(cursor,limit+1) as {repository_id:string;project_id:string;entity_type:string;entity_id:string;transition:string;occurred_at:string;payload_json:string;ingestion_mode:string;stream_sequence:number}[];
    const effects = this.db.prepare('SELECT causation_id,effect_type,project_id,occurred_at,duration_ms,parameters_json,ingestion_mode,stream_sequence FROM history_effects WHERE stream_sequence>? ORDER BY stream_sequence LIMIT ?').all(cursor,limit+1) as {causation_id:string;effect_type:string;project_id:string;occurred_at:string;duration_ms:number;parameters_json:string;ingestion_mode:string;stream_sequence:number}[];
    const effectsBySequence = new Map<number,unknown[]>();
    for (const r of effects) effectsBySequence.set(r.stream_sequence,[...(effectsBySequence.get(r.stream_sequence)??[]),
      {causationId:r.causation_id,effectType:r.effect_type,projectId:r.project_id,occurredAt:r.occurred_at,durationMs:r.duration_ms,ingestionMode:r.ingestion_mode,parameters:JSON.parse(r.parameters_json)}]);
    const items = [
      ...events.map(r => ({ sequence:r.stream_sequence, item:{eventId:r.event_id,streamSequence:r.stream_sequence,...JSON.parse(r.event_json) as object,viewMode:'replay'} })),
      ...milestones.map(r => ({ sequence:r.stream_sequence, item:{kind:'github.milestone',repositoryId:r.repository_id,projectId:r.project_id,entityType:r.entity_type,entityId:r.entity_id,transition:r.transition,occurredAt:r.occurred_at,payload:JSON.parse(r.payload_json),ingestionMode:r.ingestion_mode,effects:effectsBySequence.get(r.stream_sequence)??[],streamSequence:r.stream_sequence,viewMode:'replay'} }))
    ].sort((a,b)=>a.sequence-b.sequence);
    const page=items.slice(0,limit);
    return { viewMode:'replay',fromSequence:cursor,throughSequence:page.at(-1)?.sequence??cursor,events:page.map(x=>x.item),nextCursor:items.length>limit?page.at(-1)!.sequence:null,hasMore:items.length>limit };
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
    const sessionUnion = sessions === null ? null : unionDuration(sessions);
    const agentMs = agents === null ? null : agents.reduce((sum, x) => sum + x.end - x.start, 0);
    const dayEvents = events.filter(e => { const t = Date.parse(String(e.observedAt)); return t >= dayStart && t < dayEnd; });
    return { date, timeZone, elapsedDurationMs: sessionUnion, elapsedDurationKnown:sessionUnion !== null,
      agentHours: agentMs === null ? null : agentMs / 3600000, agentHoursKnown:agentMs !== null,
      coverage: { status: dayEvents.length ? 'unknown' : 'none', observedEventCount: dayEvents.length, reason: 'expected_collection_windows_not_recorded', gaps: dayEvents.length ? null : [{ start: new Date(dayStart).toISOString(), end: new Date(dayEnd).toISOString(), reason: 'no_observations' }] },
      milestones: (this.db.prepare('SELECT repository_id,project_id,entity_type,entity_id,transition,occurred_at,payload_json,ingestion_mode FROM history_milestones WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at').all(new Date(dayStart).toISOString(), new Date(dayEnd).toISOString()) as { repository_id:string;project_id:string;entity_type:string;entity_id:string;transition:string;occurred_at:string;payload_json:string;ingestion_mode:string }[]).map(r=>({repositoryId:r.repository_id,projectId:r.project_id,entityType:r.entity_type,entityId:r.entity_id,transition:r.transition,occurredAt:r.occurred_at,payload:JSON.parse(r.payload_json),ingestionMode:r.ingestion_mode})),
      incidentMarkers: (this.db.prepare('SELECT incident_id,repository_id,project_id,workflow_id,run_id,ref,head_sha,opened_at,resolved_at,last_attempt,evidence_url FROM history_incidents WHERE (opened_at>=? AND opened_at<?) OR (resolved_at>=? AND resolved_at<?) ORDER BY opened_at').all(new Date(dayStart).toISOString(),new Date(dayEnd).toISOString(),new Date(dayStart).toISOString(),new Date(dayEnd).toISOString()) as {incident_id:string;repository_id:string;project_id:string;workflow_id:number;run_id:number;ref:string;head_sha:string;opened_at:string;resolved_at:string|null;last_attempt:number;evidence_url:string}[]).map(r=>({incidentId:r.incident_id,repositoryId:r.repository_id,projectId:r.project_id,workflowId:r.workflow_id,runId:r.run_id,ref:r.ref,headSha:r.head_sha,openedAt:r.opened_at,resolvedAt:r.resolved_at,lastAttempt:r.last_attempt,evidenceUrl:r.evidence_url})), costs: null };
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

function intervals(events: Record<string, unknown>[], key: string, start: number, end: number): { start: number; end: number }[] | null {
  const losses = new Map<string, number[]>();
  const byEntity = new Map<string, { sourceId: string; observations: { at: number; type: string }[] }>();
  for (const event of events) {
    const at = Date.parse(String(event.observedAt));
    if (!Number.isFinite(at)) continue;
    const sourceId = typeof event.sourceId === 'string' ? event.sourceId : '';
    if (event.type === 'source.unavailable' && sourceId) losses.set(sourceId,[...(losses.get(sourceId)??[]),at]);
    if (typeof event[key] !== 'string') continue;
    const id = String(event[key]);
    const current = byEntity.get(id) ?? {sourceId,observations:[]};
    current.observations.push({at,type:String(event.type)});
    byEntity.set(id,current);
  }
  const result: {start:number;end:number}[] = [];
  for (const entity of byEntity.values()) {
    const list=[...entity.observations,...(losses.get(entity.sourceId)??[]).map(at=>({at,type:'source.unavailable'}))];
    list.sort((a,b)=>a.at-b.at); let opened: number | null = null;
    for (const e of list) {
      if (e.type.endsWith('.ended') || e.type === 'source.unavailable') { if (opened !== null) result.push({start:Math.max(opened,start),end:Math.min(e.at,end)}); opened=null; }
      else if (opened === null) opened=e.at;
    }
    if (opened !== null && opened < end) return null;
  }
  return result.filter(x=>x.end>x.start);
}
function unionDuration(items: {start:number;end:number}[]): number {
  const sorted=[...items].sort((a,b)=>a.start-b.start); let end=-Infinity,total=0;
  for(const x of sorted){if(x.end>end){total+=x.end-Math.max(end,x.start);end=x.end;}}
  return total;
}
