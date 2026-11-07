import type Database from 'better-sqlite3';
import type { GitHubPageCacheEntry } from '../github/github-client.ts';
import { compareTimestamp } from '../domain/session-reducer.ts';

type EventRow = { event_id: string; stream_sequence: number; event_json: string };

export interface RepositoryLink {
  repositoryId: string;
  owner: string;
  name: string;
  projectId: string;
  linkedAt: string;
}

interface CiIncidentInterval {
  incidentId: string;
  repositoryId: string;
  projectId: string;
  workflowId: number;
  ref: string;
  openedAt: string;
  resolvedAt: string | null;
}

export class HistoryStore {
  private readonly db: Database.Database;
  constructor(db: Database.Database) { this.db = db; }

  linkRepository(input: { repositoryId: string; owner: string; name: string; projectId: string }, at = new Date().toISOString()): RepositoryLink {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(input.owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(input.name) || input.name === '.' || input.name === '..' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(input.repositoryId)) throw new Error('Identidade de repositório inválida');
    if (!Number.isFinite(Date.parse(at))) throw new Error('Data de vínculo inválida');
    if (!this.db.prepare('SELECT 1 FROM projects WHERE project_id = ?').get(input.projectId)) throw new Error('Projeto desconhecido');
    const identity = this.db.prepare('SELECT owner,name FROM project_repositories WHERE repository_id=? LIMIT 1').get(input.repositoryId) as {owner:string;name:string}|undefined;
    if (identity && (identity.owner !== input.owner || identity.name !== input.name)) throw new Error('ID de repositório vinculado a outro owner/repo');
    return this.db.transaction(() => {
      const prior=this.db.prepare('SELECT active,unlinked_at FROM project_repositories WHERE repository_id=? AND project_id=?').get(input.repositoryId,input.projectId) as {active:number;unlinked_at:string|null}|undefined;
      if(prior?.active===0 && prior.unlinked_at && compareTimestamp(at,prior.unlinked_at)<0)throw new Error('Vínculo não pode anteceder desvínculo');
      this.db.prepare(`INSERT INTO project_repositories(repository_id, owner, name, project_id, linked_at, active)
        VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(repository_id, project_id) DO UPDATE SET linked_at=CASE WHEN project_repositories.active=1 THEN project_repositories.linked_at ELSE excluded.linked_at END, unlinked_at=NULL, active=1`)
        .run(input.repositoryId, input.owner, input.name, input.projectId, at);
      if(!prior || prior.active===0)
        this.db.prepare('INSERT INTO project_repository_link_periods(repository_id,project_id,linked_at) VALUES (?,?,?)')
          .run(input.repositoryId,input.projectId,at);
      const row = this.db.prepare('SELECT linked_at FROM project_repositories WHERE repository_id=? AND project_id=?').get(input.repositoryId, input.projectId) as {linked_at:string};
      return { ...input, linkedAt: row.linked_at };
    })();
  }

  unlinkRepository(repositoryId: string, projectId: string, at = new Date().toISOString()): boolean {
    if (!Number.isFinite(Date.parse(at))) throw new Error('Data de desvínculo inválida');
    return this.db.transaction(() => {
      const prior=this.db.prepare('SELECT linked_at FROM project_repositories WHERE repository_id=? AND project_id=? AND active=1').get(repositoryId,projectId) as {linked_at:string}|undefined;
      if(prior && compareTimestamp(at,prior.linked_at)<0)throw new Error('Desvínculo não pode anteceder vínculo');
      const removed=this.db.prepare('UPDATE project_repositories SET active=0, unlinked_at=? WHERE repository_id=? AND project_id=? AND active=1')
        .run(at,repositoryId,projectId).changes>0;
      if(removed)this.db.prepare('UPDATE project_repository_link_periods SET unlinked_at=? WHERE repository_id=? AND project_id=? AND unlinked_at IS NULL')
        .run(at,repositoryId,projectId);
      return removed;
    })();
  }

  repositories(): RepositoryLink[] {
    return (this.db.prepare('SELECT repository_id, owner, name, project_id, linked_at FROM project_repositories WHERE active=1 ORDER BY owner,name,project_id').all() as { repository_id: string; owner: string; name: string; project_id: string; linked_at: string }[])
      .map(r => ({ repositoryId: r.repository_id, owner: r.owner, name: r.name, projectId: r.project_id, linkedAt: r.linked_at }));
  }

  hasSuccessfulPoll(repositoryId: string): boolean {
    return this.lastSuccessfulPollAt(repositoryId) !== null;
  }

  lastSuccessfulPollAt(repositoryId: string): string | null {
    const row=this.db.prepare('SELECT last_success_at FROM github_poll_state WHERE repository_id=?').get(repositoryId) as {last_success_at:string}|undefined;
    return row?.last_success_at??null;
  }

  lastSuccessfulPollStartedAt(repositoryId: string): string | null {
    const row=this.db.prepare("SELECT started_at FROM github_poll_attempts WHERE repository_id=? AND status='success' ORDER BY id DESC LIMIT 1")
      .get(repositoryId) as {started_at:string}|undefined;
    return row?.started_at??null;
  }

  githubRetryUntilMs(): number {
    return (this.db.prepare("SELECT value FROM meta WHERE key='github_retry_until_ms'").get() as {value:number}).value;
  }

  markPollSuccess(repositoryId: string, startedAt: string, cacheEntries: readonly GitHubPageCacheEntry[], expectedIntervalMs: number, completedAt = new Date().toISOString()): void {
    if (!Number.isSafeInteger(expectedIntervalMs) || expectedIntervalMs < 1000 || expectedIntervalMs > 86400000) throw new Error('Cadência GitHub inválida');
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO github_poll_state(repository_id,last_success_at) VALUES (?,?) ON CONFLICT(repository_id) DO UPDATE SET last_success_at=excluded.last_success_at').run(repositoryId,completedAt);
      this.db.prepare("INSERT INTO github_poll_attempts(repository_id,started_at,completed_at,status,expected_interval_ms) VALUES (?,?,?,'success',?)").run(repositoryId,startedAt,completedAt,expectedIntervalMs);
      this.db.prepare('DELETE FROM github_page_cache').run();
      const insert=this.db.prepare('INSERT INTO github_page_cache(url,etag,next_url,saved_at) VALUES (?,?,?,?)');
      for (const entry of cacheEntries) insert.run(entry.url,entry.etag,entry.next,completedAt);
    })();
  }

  markPollFailure(repositoryId: string, startedAt: string, status: 'api_error' | 'rate_limited', expectedIntervalMs: number, completedAt = new Date().toISOString(), retryAfterMs = 0): void {
    if (!Number.isSafeInteger(expectedIntervalMs) || expectedIntervalMs < 1000 || expectedIntervalMs > 86400000) throw new Error('Cadência GitHub inválida');
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0 || !Number.isFinite(Date.parse(completedAt))) throw new Error('Prazo GitHub inválido');
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO github_poll_attempts(repository_id,started_at,completed_at,status,expected_interval_ms) VALUES (?,?,?,?,?)').run(repositoryId,startedAt,completedAt,status,expectedIntervalMs);
      if (status === 'rate_limited' && retryAfterMs > 0)
        this.db.prepare("UPDATE meta SET value=MAX(value,?) WHERE key='github_retry_until_ms'").run(Date.parse(completedAt)+retryAfterMs);
    })();
  }

  githubPageCache(): GitHubPageCacheEntry[] {
    return (this.db.prepare('SELECT url,etag,next_url FROM github_page_cache ORDER BY url').all() as {url:string;etag:string;next_url:string|null}[])
      .map(row=>({url:row.url,etag:row.etag,next:row.next_url}));
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
    return this.db.transaction(() => {
      const baseline=(this.db.prepare("SELECT value FROM meta WHERE key='replay_baseline'").get() as {value:number}).value;
      const current=(this.db.prepare("SELECT value FROM meta WHERE key='stream_sequence'").get() as {value:number}).value;
      if(cursor<baseline || cursor>current)throw new Error('Cursor de replay indisponível');
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
      return { viewMode:'replay' as const,fromSequence:cursor,throughSequence:page.at(-1)?.sequence??cursor,events:page.map(x=>x.item),nextCursor:items.length>limit?page.at(-1)!.sequence:null,hasMore:items.length>limit };
    })();
  }

  ciIncidentsAt(at: string): Omit<CiIncidentInterval,'resolvedAt'>[] {
    return this.ciIncidentIntervals().filter(row=>compareTimestamp(row.openedAt,at)<=0 &&
      (!row.resolvedAt || compareTimestamp(row.resolvedAt,at)>0))
      .map(({resolvedAt: _resolvedAt,...row})=>row);
  }

  private ciIncidentIntervals(): CiIncidentInterval[] {
    const rows=this.db.prepare("SELECT repository_id,project_id,transition,occurred_at,payload_json,stream_sequence FROM history_milestones WHERE entity_type='workflow' AND (transition LIKE 'attempt-%-failure' OR transition LIKE 'attempt-%-success')").all() as
      {repository_id:string;project_id:string;transition:string;occurred_at:string;payload_json:string;stream_sequence:number}[];
    rows.sort((a,b)=>compareTimestamp(a.occurred_at,b.occurred_at)||
      Number(a.transition.endsWith('-success'))-Number(b.transition.endsWith('-success'))||a.stream_sequence-b.stream_sequence);
    const active=new Map<string,CiIncidentInterval>();
    const intervals:CiIncidentInterval[]=[];
    for(const row of rows){
      const payload=JSON.parse(row.payload_json) as Record<string,unknown>;
      const workflowId=Number(payload.workflowId);const runId=Number(payload.runId);
      const attempt=Number(/^attempt-(\d+)-/.exec(row.transition)?.[1]);
      const ref=typeof payload.ref==='string'?payload.ref:'';
      if(![workflowId,runId,attempt].every(Number.isSafeInteger)||!ref)continue;
      const key=JSON.stringify([row.repository_id,row.project_id,workflowId,ref]);
      const current=active.get(key);
      if(row.transition.endsWith('-failure')){
        if(current)continue;
        const interval={incidentId:JSON.stringify([row.project_id,row.repository_id,workflowId,ref,runId,attempt]),
          repositoryId:row.repository_id,projectId:row.project_id,workflowId,ref,openedAt:row.occurred_at,resolvedAt:null};
        active.set(key,interval);intervals.push(interval);
      }else if(current){current.resolvedAt=row.occurred_at;active.delete(key);}
    }
    return intervals;
  }

  daySummary(date: string, timeZone: string, now = new Date().toISOString(), projectId?: string): Record<string, unknown> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data inválida');
    new Intl.DateTimeFormat('pt-BR', { timeZone }).format(new Date(`${date}T12:00:00Z`));
    if (projectId && !this.db.prepare('SELECT 1 FROM projects WHERE project_id=?').get(projectId)) throw new Error('Projeto desconhecido');
    const rows = this.db.prepare("SELECT stream_sequence,event_json FROM events WHERE json_extract(event_json,'$.observedAt') IS NOT NULL ORDER BY stream_sequence").all() as { stream_sequence: number; event_json: string }[];
    const nowMs=Date.parse(now);
    const allEvents: (Record<string, unknown> & { streamSequence: number })[] = rows.map(r => ({ ...(JSON.parse(r.event_json) as Record<string, unknown>), streamSequence: r.stream_sequence } as Record<string, unknown> & {streamSequence:number}))
      .filter(e=>Date.parse(String(e.observedAt))<=nowMs);
    const dayStart = zonedMidnight(date, timeZone);
    const calendar = new Date(`${date}T12:00:00Z`);
    calendar.setUTCDate(calendar.getUTCDate() + 1);
    const nextDate = calendar.toISOString().slice(0, 10);
    const dayEnd = zonedMidnight(nextDate, timeZone);
    const asOfEnd = Math.min(dayEnd,nowMs);
    const projectSources = new Set(allEvents.filter(e=>e.projectId===projectId && typeof e.sourceId==='string' &&
      Date.parse(String(e.observedAt))<asOfEnd).map(e=>String(e.sourceId)));
    const events = projectId ? allEvents.filter(e=>e.projectId===projectId ||
      (String(e.type).startsWith('source.') && projectSources.has(String(e.sourceId)))) : allEvents;
    const sessions = intervals(events, 'sessionKey', dayStart, dayEnd);
    const agents = intervals(events, 'agentKey', dayStart, dayEnd);
    const waiting = waitingIntervals(events,dayStart,dayEnd);
    const sessionUnion = sessions === null ? null : unionDuration(sessions);
    const agentMs = agents === null ? null : agents.reduce((sum, x) => sum + x.end - x.start, 0);
    const waitingMs = waiting === null || !events.some(e => String(e.type).startsWith('session.') && Date.parse(String(e.observedAt)) >= dayStart && Date.parse(String(e.observedAt)) < dayEnd)
      ? null : unionDuration(waiting);
    const dayEvents = events.filter(e => { const t = Date.parse(String(e.observedAt)); return t >= dayStart && t < dayEnd; });
    const sourceGaps = sourceCollectionGaps(events,dayStart,dayEnd,Date.parse(now));
    const linkedRepositories = projectId ? this.db.prepare('SELECT repository_id,linked_at,unlinked_at FROM project_repository_link_periods WHERE project_id=?').all(projectId) as
      {repository_id:string;linked_at:string;unlinked_at:string|null}[] : [];
    const githubHistory = (this.db.prepare('SELECT repository_id,started_at,completed_at,status,expected_interval_ms FROM github_poll_attempts WHERE started_at<=? ORDER BY repository_id,started_at,id')
      .all(now) as GithubPollAttempt[]).filter(attempt=>Date.parse(attempt.completed_at)<=nowMs && (!projectId || linkedRepositories.some(link=>link.repository_id===attempt.repository_id &&
        Date.parse(link.linked_at)<=Date.parse(attempt.started_at) && (!link.unlinked_at || Date.parse(attempt.started_at)<Date.parse(link.unlinked_at)))));
    const githubAttempts = githubHistory.filter(x=>Date.parse(x.started_at)>=dayStart && Date.parse(x.started_at)<dayEnd);
    const successfulAttempts = githubAttempts.filter(x=>x.status==='success');
    const failedAttempts = githubAttempts.filter(x=>x.status!=='success');
    const gaps = projectId ? linkedRepositories.flatMap(link=>githubPollGaps(githubHistory.filter(attempt=>
      attempt.repository_id===link.repository_id && Date.parse(attempt.started_at)>=Date.parse(link.linked_at) &&
      (!link.unlinked_at || Date.parse(attempt.started_at)<Date.parse(link.unlinked_at))),dayStart,dayEnd,nowMs))
      .sort((a,b)=>a.start.localeCompare(b.start)||a.repositoryId.localeCompare(b.repositoryId))
      : githubPollGaps(githubHistory,dayStart,dayEnd,nowMs);
    const incidentMarkers = this.ciIncidentIntervals().filter(row=>(!projectId || row.projectId===projectId) && asOfEnd>dayStart && Date.parse(row.openedAt)<asOfEnd &&
      (!row.resolvedAt || Date.parse(row.resolvedAt)>dayStart))
      .map(row=>({...row,openedBeforeDay:Date.parse(row.openedAt)<dayStart,
        resolvedAt:row.resolvedAt && Date.parse(row.resolvedAt)<asOfEnd ? row.resolvedAt : null,
        activeAtEnd:!row.resolvedAt || Date.parse(row.resolvedAt)>asOfEnd}));
    return { date, timeZone, projectId:projectId??null, elapsedDurationMs: sessionUnion, elapsedDurationKnown:sessionUnion !== null,
      agentHours: agentMs === null ? null : agentMs / 3600000, agentHoursKnown:agentMs !== null,
      waitingDurationMs:waitingMs,waitingDurationKnown:waitingMs!==null,
      coverage: { status: dayEvents.length ? 'unknown' : 'none', observedEventCount: dayEvents.length, reason: 'expected_collection_windows_not_recorded',
        gaps: dayEvents.length || sourceGaps.length ? sourceGaps : asOfEnd>dayStart
          ? [{ start: new Date(dayStart).toISOString(), end: new Date(asOfEnd).toISOString(), reason: 'no_observations' }] : [] },
      githubCoverage: { status: githubAttempts.length===0?(gaps.length?'gap':'none'):successfulAttempts.length===0?'failed':failedAttempts.length||gaps.length?'partial':'sampled',
        attempts:githubAttempts.length,successfulAttempts:successfulAttempts.length,failedAttempts:failedAttempts.length,
        lastSuccessfulPollAt:successfulAttempts.at(-1)?.completed_at??null,
        gaps },
      milestones: (this.db.prepare('SELECT repository_id,project_id,entity_type,entity_id,transition,occurred_at,payload_json,ingestion_mode FROM history_milestones WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at').all(new Date(dayStart).toISOString(), new Date(dayEnd).toISOString()) as { repository_id:string;project_id:string;entity_type:string;entity_id:string;transition:string;occurred_at:string;payload_json:string;ingestion_mode:string }[])
        .filter(r=>(!projectId || r.project_id===projectId) && Date.parse(r.occurred_at)<=nowMs)
        .map(r=>({repositoryId:r.repository_id,projectId:r.project_id,entityType:r.entity_type,entityId:r.entity_id,transition:r.transition,occurredAt:r.occurred_at,payload:JSON.parse(r.payload_json),ingestionMode:r.ingestion_mode})),
      incidentMarkers, costs: null };
  }
}

type GithubPollAttempt = {repository_id:string;started_at:string;completed_at:string;status:string;expected_interval_ms:number|null};
function sourceCollectionGaps(events: Record<string,unknown>[], dayStart:number, dayEnd:number, now:number): {sourceId:string;start:string;end:string;reason:string}[] {
  const ordered=[...events].filter(event=>typeof event.sourceId==='string' && Number.isFinite(Date.parse(String(event.observedAt))))
    .sort((a,b)=>compareTimestamp(String(a.observedAt),String(b.observedAt)));
  const open=new Map<string,number>();
  const gaps:{sourceId:string;start:string;end:string;reason:string}[]=[];
  const close=(sourceId:string,at:number):void=>{
    const since=open.get(sourceId);if(since===undefined)return;
    const start=Math.max(since,dayStart);const end=Math.min(at,dayEnd,now);
    if(end>start)gaps.push({sourceId,start:new Date(start).toISOString(),end:new Date(end).toISOString(),reason:'source_unavailable'});
    open.delete(sourceId);
  };
  for(const event of ordered){
    const sourceId=String(event.sourceId);const at=Date.parse(String(event.observedAt));
    if(at>now)break;
    if(event.type==='source.unavailable'){if(!open.has(sourceId))open.set(sourceId,at);}
    else close(sourceId,at);
  }
  for(const sourceId of open.keys())close(sourceId,Math.min(dayEnd,now));
  return gaps.sort((a,b)=>a.start.localeCompare(b.start)||a.sourceId.localeCompare(b.sourceId));
}
function githubPollGaps(attempts: GithubPollAttempt[], dayStart:number, dayEnd:number, now:number): {repositoryId:string;start:string;end:string;reason:string}[] {
  const byRepository = new Map<string,GithubPollAttempt[]>();
  for (const attempt of attempts) {
    const list=byRepository.get(attempt.repository_id)??[];
    list.push(attempt);
    byRepository.set(attempt.repository_id,list);
  }
  const gaps: {repositoryId:string;start:string;end:string;reason:string}[] = [];
  for (const [repositoryId,history] of byRepository) {
    let lastSuccess: GithubPollAttempt|null = null;
    let firstFailure: GithubPollAttempt|null = null;
    const emit = (from:number,to:number,reason:string): void => {
      const start=Math.max(from,dayStart); const end=Math.min(to,dayEnd,now);
      if (Number.isFinite(start) && Number.isFinite(end) && end>start) gaps.push({repositoryId,start:new Date(start).toISOString(),end:new Date(end).toISOString(),reason});
    };
    for (const attempt of history) {
      if (Date.parse(attempt.started_at)>now) break;
      if (attempt.status==='success') {
        const due=lastSuccess?.expected_interval_ms==null?null:Date.parse(lastSuccess.completed_at)+lastSuccess.expected_interval_ms;
        const from=due??(firstFailure?Date.parse(firstFailure.started_at):null);
        if (from!==null) emit(from,Date.parse(attempt.completed_at),firstFailure?.status??'missed_poll');
        lastSuccess=attempt;
        firstFailure=null;
      } else if (!firstFailure) firstFailure=attempt;
    }
  }
  return gaps.sort((a,b)=>a.start.localeCompare(b.start)||a.repositoryId.localeCompare(b.repositoryId));
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
function waitingIntervals(events: Record<string,unknown>[], start:number, end:number): {start:number;end:number}[]|null {
  const ordered=[...events].filter(event=>Number.isFinite(Date.parse(String(event.observedAt))))
    .sort((a,b)=>compareTimestamp(String(a.observedAt),String(b.observedAt)));
  const sourceBySession=new Map<string,string>();
  const opened=new Map<string,number>();
  const result:{start:number;end:number}[]=[];
  const close=(sessionKey:string,at:number):void=>{
    const since=opened.get(sessionKey);if(since===undefined)return;
    const clippedStart=Math.max(since,start);const clippedEnd=Math.min(at,end);
    if(clippedEnd>clippedStart)result.push({start:clippedStart,end:clippedEnd});
    opened.delete(sessionKey);
  };
  for(const event of ordered){
    const at=Date.parse(String(event.observedAt));
    if(at>=end)break;
    if(event.type==='source.unavailable'){
      for(const [sessionKey,sourceId] of sourceBySession)if(sourceId===event.sourceId)close(sessionKey,at);
      continue;
    }
    if(typeof event.sessionKey!=='string' || !String(event.type).startsWith('session.'))continue;
    const sessionKey=event.sessionKey;
    if(typeof event.sourceId==='string')sourceBySession.set(sessionKey,event.sourceId);
    if(event.type==='session.waiting'){
      if(!opened.has(sessionKey))opened.set(sessionKey,at);
    }else close(sessionKey,at);
  }
  if([...opened.values()].some(at=>at<end))return null;
  return result;
}
function unionDuration(items: {start:number;end:number}[]): number {
  const sorted=[...items].sort((a,b)=>a.start-b.start); let end=-Infinity,total=0;
  for(const x of sorted){if(x.end>end){total+=x.end-Math.max(end,x.start);end=x.end;}}
  return total;
}
