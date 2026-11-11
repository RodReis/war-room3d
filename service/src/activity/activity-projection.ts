import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '../store/event-store.ts';

const intervalMs = 5 * 60 * 1000;
const bucketsPerHour = 12;
const operational = new Set([
  'session.working', 'session.waiting', 'task.observed', 'task.working', 'task.waiting', 'task.completed',
  'tool.observed', 'tool.result', 'tool.failed', 'skill.observed', 'message.observed', 'request.observed'
]);
type Coverage = 'covered' | 'partial' | 'gap';
type Span = {start:number;end:number};
type Stored = {event_json:string;stream_sequence:number};

export interface ActivityBucket {start:string;end:string;count:number|null;coverage:Coverage;}
export interface ActivitySeries {projectId:string;name:string;lastUpdatedAt:string|null;buckets:ActivityBucket[];}
export interface ActivityHour {schemaVersion:'1.0';mode:'live';unit:'eventos observados';intervalMinutes:5;from:string;to:string;series:ActivitySeries[];}
export interface ActivityEvent {eventId:string;projectId:string;sessionKey:string|null;agentKey:string|null;type:string;sourceId:string;observedAt:string;provenance:string;}
export interface ActivityEventPage {items:ActivityEvent[];hasMore:boolean;}

function fullyCovered(start:number,end:number,spans:readonly Span[]):boolean {
  let cursor=start;
  for(const span of [...spans].sort((a,b)=>a.start-b.start)){
    if(span.end<=cursor)continue;
    if(span.start>cursor)return false;
    cursor=Math.max(cursor,span.end);
    if(cursor>=end)return true;
  }
  return false;
}
function overlaps(start:number,end:number,spans:readonly Span[]):boolean {
  return spans.some(span=>span.start<end&&span.end>start);
}
function unavailableIntervals(events:readonly NormalizedEvent[],now:number):Span[] {
  const ordered=[...events].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  const spans:Span[]=[];
  let opened:number|null=null;
  for(const event of ordered){
    const at=Date.parse(event.observedAt);
    if(at>now)break;
    if(event.type==='source.unavailable'&&opened===null)opened=at;
    else if(event.type==='source.recovered'&&opened!==null){spans.push({start:opened,end:at});opened=null;}
  }
  if(opened!==null)spans.push({start:opened,end:now});
  return spans;
}

// A projeção é somente leitura; o store já deduplicou sourceId + sourceEventId.
// Sem marcador source.covered da fonte para todo o intervalo, zero não é demonstrável.
export class ActivityProjection {
  private readonly db:Database.Database;
  constructor(db:Database.Database){this.db=db;}

  hour(now:string=new Date().toISOString()):ActivityHour {
    const current=Date.parse(now);
    if(!Number.isFinite(current))throw new Error('Instante inválido');
    const end=Math.ceil(current/intervalMs)*intervalMs;
    const start=end-bucketsPerHour*intervalMs;
    const projects=this.db.prepare('SELECT project_id,name FROM projects ORDER BY name,project_id').all() as {project_id:string;name:string}[];
    const series=projects.map(project=>{
      const projectId=project.project_id;
      const bindings=this.db.prepare('SELECT source_id FROM session_source_bindings WHERE project_id=? ORDER BY source_id')
        .all(projectId) as {source_id:string}[];
      const boundSources=new Set(bindings.map(binding=>binding.source_id));
      const rows=this.db.prepare(`SELECT event_json,stream_sequence FROM events
        WHERE json_extract(event_json,'$.projectId')=? AND json_extract(event_json,'$.observedAt')>=?
          AND json_extract(event_json,'$.observedAt')<? ORDER BY stream_sequence`)
        .all(projectId,new Date(start-1000).toISOString(),new Date(end+1000).toISOString()) as Stored[];
      const events=rows.map(row=>JSON.parse(row.event_json) as NormalizedEvent)
        .filter(event=>boundSources.has(event.sourceId)&&Date.parse(event.observedAt)>=start&&Date.parse(event.observedAt)<end);
      const coverageRows=this.db.prepare(`SELECT event_json FROM events
        WHERE json_extract(event_json,'$.projectId')=? AND json_extract(event_json,'$.type')='source.covered'`)
        .all(projectId) as {event_json:string}[];
      const coverage=new Map<string,Span[]>();
      let lastLiveCoverage:string|null=null;
      for(const row of coverageRows){
        const event=JSON.parse(row.event_json) as NormalizedEvent;
        if(!boundSources.has(event.sourceId)||Date.parse(event.observedAt)>current)continue;
        if(event.ingestionMode==='live'&&(!lastLiveCoverage||Date.parse(event.observedAt)>Date.parse(lastLiveCoverage)))
          lastLiveCoverage=event.observedAt;
        const marker={start:Date.parse(event.payload.coverageStart!),end:Date.parse(event.payload.coverageEnd!)};
        if(marker.end<=start||marker.start>=end)continue;
        const spans=coverage.get(event.sourceId)??[];
        spans.push(marker);
        coverage.set(event.sourceId,spans);
      }
      const losses=new Map<string,Span[]>();
      for(const binding of bindings){
        const statusRows=this.db.prepare(`SELECT event_json FROM events WHERE source_id=?
          AND json_extract(event_json,'$.type') IN ('source.unavailable','source.recovered')`)
          .all(binding.source_id) as {event_json:string}[];
        losses.set(binding.source_id,unavailableIntervals(statusRows.map(row=>JSON.parse(row.event_json) as NormalizedEvent),current));
      }
      const buckets:ActivityBucket[]=[];
      for(let bucketStart=start;bucketStart<end;bucketStart+=intervalMs){
        const bucketEnd=bucketStart+intervalMs;
        const count=events.filter(event=>{
          const at=Date.parse(event.observedAt);
          return at>=bucketStart&&at<bucketEnd&&operational.has(event.type)&&event.provenance==='observed'&&
            (event.ingestionMode==='live'||event.ingestionMode==='backfill');
        }).length;
        const covered=bucketEnd<=current&&bindings.length>0&&bindings.every(binding=>
          fullyCovered(bucketStart,bucketEnd,coverage.get(binding.source_id)??[])&&
          !overlaps(bucketStart,bucketEnd,losses.get(binding.source_id)??[]));
        buckets.push({start:new Date(bucketStart).toISOString(),end:new Date(bucketEnd).toISOString(),
          count:covered||count>0?count:null,coverage:covered?'covered':count>0?'partial':'gap'});
      }
      const last=this.db.prepare(`SELECT MAX(s.last_evidence_at) AS at FROM sources s
        JOIN session_source_bindings b ON b.source_id=s.source_id WHERE b.project_id=?`)
        .get(projectId) as {at:string|null};
      const lastUpdatedAt=last.at&&lastLiveCoverage ? Date.parse(last.at)>Date.parse(lastLiveCoverage)?last.at:lastLiveCoverage :
        last.at??lastLiveCoverage;
      return {projectId,name:project.name,lastUpdatedAt,buckets};
    });
    return {schemaVersion:'1.0',mode:'live',unit:'eventos observados',intervalMinutes:5,
      from:new Date(start).toISOString(),to:new Date(end).toISOString(),series};
  }

  events(projectId:string,from:string,to:string):ActivityEventPage|null {
    const start=Date.parse(from),end=Date.parse(to);
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(projectId)||!Number.isFinite(start)||!Number.isFinite(end)||
      end-start!==intervalMs||start%intervalMs!==0)throw new Error('Intervalo inválido');
    if(!this.db.prepare('SELECT 1 FROM projects WHERE project_id=?').get(projectId))return null;
    const boundSources=new Set((this.db.prepare('SELECT source_id FROM session_source_bindings WHERE project_id=?')
      .all(projectId) as {source_id:string}[]).map(binding=>binding.source_id));
    const rows=this.db.prepare(`SELECT event_json,stream_sequence FROM events
      WHERE json_extract(event_json,'$.projectId')=? AND json_extract(event_json,'$.observedAt')>=?
        AND json_extract(event_json,'$.observedAt')<? ORDER BY stream_sequence DESC`)
      .all(projectId,new Date(start-1000).toISOString(),new Date(end+1000).toISOString()) as Stored[];
    const events=rows.map(row=>JSON.parse(row.event_json) as NormalizedEvent)
      .filter(event=>boundSources.has(event.sourceId)&&Date.parse(event.observedAt)>=start&&Date.parse(event.observedAt)<end&&
        operational.has(event.type)&&event.provenance==='observed'&&
        (event.ingestionMode==='live'||event.ingestionMode==='backfill'));
    return {hasMore:events.length>100,items:events.slice(0,100).map(event=>({eventId:event.eventId,projectId,sessionKey:event.sessionKey??null,agentKey:event.agentKey??null,
        type:event.type,sourceId:event.sourceId,observedAt:event.observedAt,provenance:event.provenance}))};
  }
}
