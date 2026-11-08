import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';

export const operationCategories = ['metric', 'log', 'trace', 'network', 'security_detection', 'security_report'] as const;
export type OperationCategory = typeof operationCategories[number];
export type Coverage = 'covered' | 'disabled' | 'no_permission' | 'unavailable' | 'stale' | 'no_data' | 'absent';
export interface OperationSource { sourceId: string; sourceVersion: string; environmentId: string; enabled: boolean; permissions: OperationCategory[]; staleAfterMs: number; retentionDays: number; status?: 'active' | 'denied' | 'unavailable' }
export interface Observation {
  schemaVersion: '1.0'; observationId: string; sourceId: string; sourceVersion: string; environmentId: string; resourceId?: string | null;
  observedAt: string; receivedAt: string; category: OperationCategory; classification: string; confidence: 'observed' | 'derived' | 'inferred';
  evidenceRef: string; coverage: 'covered'; correlation?: { traceId?: string; spanId?: string; requestId?: string }; fields: Record<string, string | number | boolean | null>;
}
export interface OperationRule { ruleId: string; version: number; category: 'network' | 'security_detection'; field: string; operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; expectedValue: string | number | boolean; severity: 'info' | 'low' | 'medium' | 'high' | 'critical'; enabled: boolean }
type Row = Record<string, unknown>;
const schema = JSON.parse(readFileSync(new URL('../../../contracts/schemas/observation.v1.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const secretKey = /(?:secret|password|passwd|token|api[_-]?key|authorization|cookie|connection[_-]?string|credential)/i;

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(["']?(?:secret|password|passwd|token|api[_-]?key|authorization|cookie|connection[_-]?string|credential)["']?\s*[:=]\s*["']?)(?!Bearer\b|\[REDACTED\])[^"'&\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:token|api[_-]?key|password|secret|authorization|cookie)=)[^&\s;]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[REDACTED]@');
}

function safeReference(value: string): string {
  if (value.length > 512) throw new Error('Referência de evidência inválida');
  return redactString(value).replace(/[?#].*$/, '');
}

function sanitizeFields(fields: Observation['fields']): Observation['fields'] {
  const result: Observation['fields'] = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key)) throw new Error('Campo de observação inválido');
    result[key] = secretKey.test(key) ? '[REDACTED]' : typeof value === 'string' ? redactString(value.slice(0, 4096)) : value;
  }
  return result;
}

function compare(actual: unknown, operator: OperationRule['operator'], expected: unknown): boolean {
  if (operator === 'eq') return actual === expected;
  const a = Number(actual), b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return operator === 'gt' ? a > b : operator === 'gte' ? a >= b : operator === 'lt' ? a < b : a <= b;
}

export class OperationsStore {
  private readonly db: Database.Database;
  constructor(db: Database.Database) { this.db = db; }

  registerSource(source: OperationSource): void {
    if (!idPattern.test(source.sourceId) || !idPattern.test(source.sourceVersion) || !idPattern.test(source.environmentId) ||
        !Number.isSafeInteger(source.staleAfterMs) || source.staleAfterMs < 1000 || source.staleAfterMs > 31_536_000_000 ||
        !Number.isSafeInteger(source.retentionDays) || source.retentionDays < 1 || source.retentionDays > 3650 ||
        !Array.isArray(source.permissions) || source.permissions.some(value => !operationCategories.includes(value)) || new Set(source.permissions).size !== source.permissions.length ||
        (source.status !== undefined && !['active', 'denied', 'unavailable'].includes(source.status))) throw new Error('Fonte de operação inválida');
    if (!this.db.prepare('SELECT 1 FROM infra_environments WHERE environment_id=? AND active=1').get(source.environmentId)) throw new Error('Ambiente de fonte desconhecido');
    const previous=this.db.prepare('SELECT environment_id FROM operation_sources WHERE source_id=?').get(source.sourceId) as {environment_id:string}|undefined;
    if (previous&&previous.environment_id!==source.environmentId) throw new Error('Identidade de fonte não pode mudar de ambiente');
    this.db.prepare(`INSERT INTO operation_sources(source_id, source_version, environment_id, enabled, permissions_json, stale_after_ms, retention_days, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET source_version=excluded.source_version, environment_id=excluded.environment_id,
      enabled=excluded.enabled, permissions_json=excluded.permissions_json, stale_after_ms=excluded.stale_after_ms, retention_days=excluded.retention_days`)
      .run(source.sourceId, source.sourceVersion, source.environmentId, source.enabled ? 1 : 0, JSON.stringify(source.permissions), source.staleAfterMs, source.retentionDays, source.status ?? 'active');
    this.pruneExpired();
  }

  setSourceStatus(sourceId: string, status: 'active' | 'denied' | 'unavailable'): void {
    if (!idPattern.test(sourceId)) throw new Error('Fonte inválida');
    if (this.db.prepare('UPDATE operation_sources SET status=? WHERE source_id=?').run(status, sourceId).changes !== 1) throw new Error('Fonte desconhecida');
  }

  sources(environmentId: string, now = new Date().toISOString()): Array<OperationSource & { coverage: Record<OperationCategory, Coverage>; lastReceivedAt: string | null }> {
    if (!idPattern.test(environmentId) || !Number.isFinite(Date.parse(now))) throw new Error('Consulta de cobertura inválida');
    const rows = this.db.prepare('SELECT * FROM operation_sources WHERE environment_id=? ORDER BY source_id').all(environmentId) as Row[];
    return rows.map(row => {
      const permissions = JSON.parse(String(row.permissions_json)) as OperationCategory[];
      const receivedRows=this.db.prepare('SELECT category,last_received_at FROM operation_source_category_status WHERE source_id=?').all(row.source_id) as Array<{category:OperationCategory;last_received_at:string}>;
      const receivedByCategory=new Map(receivedRows.map(item=>[item.category,item.last_received_at]));
      const lastReceivedAt = row.last_received_at === null ? null : String(row.last_received_at);
      const coverage = Object.fromEntries(operationCategories.map(category => {
        const categoryReceived=receivedByCategory.get(category)??null;
        let state: Coverage;
        if (Number(row.enabled) === 0) state = 'disabled';
        else if (row.status === 'denied') state = 'no_permission';
        else if (row.status === 'unavailable') state = 'unavailable';
        else if (!permissions.includes(category)) state = 'no_permission';
        else if (!categoryReceived) state = 'no_data';
        else if (Date.parse(now) - Date.parse(categoryReceived) > Number(row.stale_after_ms)) state = 'stale';
        else state = 'covered';
        return [category, state];
      })) as Record<OperationCategory, Coverage>;
      return { sourceId: String(row.source_id), sourceVersion: String(row.source_version), environmentId: String(row.environment_id), enabled: Number(row.enabled) === 1,
        permissions, staleAfterMs: Number(row.stale_after_ms), retentionDays: Number(row.retention_days), status: row.status as OperationSource['status'], coverage, lastReceivedAt,
        categoryLastReceivedAt:Object.fromEntries(receivedByCategory) as Partial<Record<OperationCategory,string>> };
    });
  }

  coverage(environmentId: string, category: OperationCategory, now = new Date().toISOString()): Coverage {
    const sources = this.sources(environmentId, now);
    if (!sources.length) return 'absent';
    const states = sources.map(source => source.coverage[category]);
    if (states.includes('covered')) return 'covered';
    if (states.includes('unavailable')) return 'unavailable';
    if (states.includes('stale')) return 'stale';
    if (states.includes('no_data')) return 'no_data';
    if (states.includes('disabled')) return 'disabled';
    return 'no_permission';
  }

  pruneExpired(now=new Date().toISOString()): number {
    if (!Number.isFinite(Date.parse(now))) throw new Error('Instante de retenção inválido');
    return this.db.transaction(()=>{
      let removed=0;
      const rows=this.db.prepare('SELECT source_id,retention_days FROM operation_sources').all() as Array<{source_id:string;retention_days:number}>;
      for (const source of rows) {
        const cutoff=new Date(Date.parse(now)-source.retention_days*86_400_000).toISOString();
        removed+=this.db.prepare('DELETE FROM operation_observations WHERE source_id=? AND received_at<?').run(source.source_id,cutoff).changes;
      }
      return removed;
    })();
  }

  registerRule(rule: OperationRule): void {
    if (!idPattern.test(rule.ruleId) || !Number.isSafeInteger(rule.version) || rule.version < 1 || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(rule.field) ||
        !['network', 'security_detection'].includes(rule.category) || !['eq','gt','gte','lt','lte'].includes(rule.operator) ||
        !['info','low','medium','high','critical'].includes(rule.severity) || !['string','number','boolean'].includes(typeof rule.expectedValue) ||
        (typeof rule.expectedValue==='string'&&(!idPattern.test(rule.expectedValue)||secretKey.test(rule.expectedValue)))) throw new Error('Regra de operação inválida');
    const encoded=JSON.stringify(rule.expectedValue);
    const existing=this.db.prepare('SELECT category,field,operator,expected_value,severity,enabled FROM operation_rules WHERE rule_id=? AND version=?').get(rule.ruleId,rule.version) as Row|undefined;
    if (existing) {
      const same=existing.category===rule.category&&existing.field===rule.field&&existing.operator===rule.operator&&existing.expected_value===encoded&&
        existing.severity===rule.severity&&Number(existing.enabled)===(rule.enabled?1:0);
      if (!same) throw new Error('Versão de regra existente é imutável');
      return;
    }
    this.db.prepare('INSERT INTO operation_rules(rule_id,version,category,field,operator,expected_value,severity,enabled) VALUES (?,?,?,?,?,?,?,?)')
      .run(rule.ruleId, rule.version, rule.category, rule.field, rule.operator, encoded, rule.severity, rule.enabled ? 1 : 0);
  }

  record(input: Observation): boolean {
    if (!validate(input)) throw new Error(`Observação inválida: ${validate.errors?.[0]?.instancePath ?? ''} ${validate.errors?.[0]?.message ?? ''}`);
    if (!Number.isFinite(Date.parse(input.observedAt)) || !Number.isFinite(Date.parse(input.receivedAt)) || Date.parse(input.observedAt) > Date.parse(input.receivedAt)) throw new Error('Instantes da observação inválidos');
    const source = this.db.prepare('SELECT * FROM operation_sources WHERE source_id=?').get(input.sourceId) as Row | undefined;
    if (!source || source.environment_id !== input.environmentId || source.source_version !== input.sourceVersion) throw new Error('Fonte ou ambiente não autorizados');
    if (input.resourceId) {
      const resource=this.db.prepare('SELECT environment_id FROM infra_resources WHERE resource_id=? AND active=1').get(input.resourceId) as {environment_id:string}|undefined;
      if (!resource||resource.environment_id!==input.environmentId) throw new Error('Recurso fora do ambiente da observação');
    }
    const permissions = JSON.parse(String(source.permissions_json)) as OperationCategory[];
    if (!Number(source.enabled) || source.status !== 'active' || !permissions.includes(input.category)) throw new Error('Fonte indisponível ou sem permissão para esta categoria');
    const fields = sanitizeFields(input.fields);
    const evidenceRef = safeReference(input.evidenceRef);
    return this.db.transaction(() => {
      try {
        this.db.prepare(`INSERT INTO operation_observations(observation_id,source_id,source_version,environment_id,resource_id,observed_at,received_at,category,classification,confidence,evidence_ref,correlation_json,fields_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.observationId,input.sourceId,input.sourceVersion,input.environmentId,input.resourceId??null,input.observedAt,input.receivedAt,input.category,
          input.classification,input.confidence,evidenceRef,JSON.stringify(input.correlation??{}),JSON.stringify(fields));
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return false;
        throw error;
      }
      this.db.prepare('UPDATE operation_sources SET last_received_at=MAX(COALESCE(last_received_at,?),?) WHERE source_id=?').run(input.receivedAt,input.receivedAt,input.sourceId);
      this.db.prepare(`INSERT INTO operation_source_category_status(source_id,category,last_received_at) VALUES (?,?,?)
        ON CONFLICT(source_id,category) DO UPDATE SET last_received_at=MAX(operation_source_category_status.last_received_at,excluded.last_received_at)`).run(input.sourceId,input.category,input.receivedAt);
      this.evaluate(input, fields, evidenceRef);
      this.pruneExpired();
      return true;
    })();
  }

  private evaluate(observation: Observation, fields: Observation['fields'], evidenceRef: string): void {
    if (observation.category !== 'network' && observation.category !== 'security_detection') return;
    const rules = this.db.prepare('SELECT * FROM operation_rules WHERE category=? AND enabled=1 ORDER BY rule_id,version').all(observation.category) as Row[];
    for (const row of rules) {
      if (!Object.hasOwn(fields, String(row.field)) || !compare(fields[String(row.field)], row.operator as OperationRule['operator'], JSON.parse(String(row.expected_value)))) continue;
      if (!observation.resourceId) continue;
      const now = observation.receivedAt;
      const existing = this.db.prepare('SELECT incident_id,status,evidence_json FROM operation_incidents WHERE environment_id=? AND resource_id=? AND rule_id=? AND rule_version=?')
        .get(observation.environmentId,observation.resourceId,row.rule_id,row.version) as {incident_id:string;status:string;evidence_json:string}|undefined;
      if (!existing) {
        const incidentId=randomUUID();
        this.db.prepare(`INSERT INTO operation_incidents(incident_id,source_id,environment_id,resource_id,rule_id,rule_version,severity,status,opened_at,updated_at,evidence_json) VALUES (?,?,?,?,?,?,?,'open',?,?,?)`)
          .run(incidentId,observation.sourceId,observation.environmentId,observation.resourceId,row.rule_id,row.version,row.severity,now,now,JSON.stringify([evidenceRef]));
        this.incidentEvent(incidentId,'open','system',now,'Regra satisfeita',evidenceRef);
      } else {
        const refs = new Set(JSON.parse(existing.evidence_json) as string[]); refs.add(evidenceRef);
        this.db.prepare(`UPDATE operation_incidents SET severity=?,status=?,updated_at=?,evidence_json=?,
          resolved_by=CASE WHEN status='resolved' THEN NULL ELSE resolved_by END,
          resolved_at=CASE WHEN status='resolved' THEN NULL ELSE resolved_at END,
          resolution_reason=CASE WHEN status='resolved' THEN NULL ELSE resolution_reason END WHERE incident_id=?`)
          .run(row.severity,existing.status==='resolved'?'open':existing.status,now,JSON.stringify([...refs]),existing.incident_id);
        this.incidentEvent(existing.incident_id,existing.status==='resolved'?'reopened':'updated','system',now,'Nova evidência satisfaz regra',evidenceRef);
      }
    }
  }

  private incidentEvent(incidentId:string,transition:string,actor:string,at:string,reason:string,evidenceRef?:string):void {
    this.db.prepare('INSERT INTO operation_incident_events(event_id,incident_id,transition,actor,occurred_at,reason,evidence_ref) VALUES (?,?,?,?,?,?,?)')
      .run(randomUUID(),incidentId,transition,actor,at,reason,evidenceRef??null);
  }

  query(options: { environmentId: string; category: OperationCategory; sourceId?: string; resourceId?: string; projectId?: string; traceId?: string; spanId?:string; requestId?: string; from?: string; to?: string; cursor?: number; limit?: number }): { items: Observation[]; nextCursor: number | null; coverage: Coverage } {
    const { environmentId,category,sourceId,resourceId,projectId,traceId,spanId,requestId,from,to }=options;
    const cursor=options.cursor??0, limit=options.limit??50;
    if (!idPattern.test(environmentId) || !operationCategories.includes(category) || !Number.isSafeInteger(cursor) || cursor<0 || !Number.isSafeInteger(limit) || limit<1 || limit>100 ||
        (sourceId!==undefined&&!idPattern.test(sourceId)) || (resourceId!==undefined&&!idPattern.test(resourceId)) || (projectId!==undefined&&!idPattern.test(projectId)) ||
        (traceId!==undefined&&!/^[A-Fa-f0-9]{16,32}$/.test(traceId)) || (spanId!==undefined&&!/^[A-Fa-f0-9]{16}$/.test(spanId)) || (requestId!==undefined&&!idPattern.test(requestId)) ||
        (from!==undefined&&(!Number.isFinite(Date.parse(from))||!/Z$/.test(from))) || (to!==undefined&&(!Number.isFinite(Date.parse(to))||!/Z$/.test(to))) ||
        (from!==undefined&&to!==undefined&&Date.parse(from)>Date.parse(to))) throw new Error('Consulta de operações inválida');
    if (sourceId) {
      const source=this.db.prepare('SELECT environment_id,enabled,status,permissions_json FROM operation_sources WHERE source_id=?').get(sourceId) as Row|undefined;
      if (!source || source.environment_id!==environmentId) throw new Error('Fonte fora do ambiente solicitado');
      if (!Number(source.enabled) || source.status!=='active' || !(JSON.parse(String(source.permissions_json)) as string[]).includes(category)) return {items:[],nextCursor:null,coverage:this.coverage(environmentId,category)};
    }
    if (projectId&&!this.db.prepare('SELECT 1 FROM projects WHERE project_id=?').get(projectId)) throw new Error('Projeto desconhecido');
    const rows=this.db.prepare(`SELECT sequence,observation_id,source_id,source_version,environment_id,resource_id,observed_at,received_at,category,classification,confidence,evidence_ref,correlation_json,fields_json
      FROM operation_observations WHERE environment_id=? AND category=? AND sequence>? AND (? IS NULL OR source_id=?) AND (? IS NULL OR resource_id=?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM infra_project_resources p WHERE p.project_id=? AND p.resource_id=operation_observations.resource_id))
      AND (? IS NULL OR json_extract(correlation_json,'$.traceId')=?) AND (? IS NULL OR json_extract(correlation_json,'$.spanId')=?) AND (? IS NULL OR json_extract(correlation_json,'$.requestId')=?)
      AND (? IS NULL OR observed_at>=?) AND (? IS NULL OR observed_at<=?) ORDER BY sequence LIMIT ?`)
      .all(environmentId,category,cursor,sourceId??null,sourceId??null,resourceId??null,resourceId??null,projectId??null,projectId??null,traceId??null,traceId??null,spanId??null,spanId??null,requestId??null,requestId??null,from??null,from??null,to??null,to??null,limit+1) as Row[];
    const hasMore=rows.length>limit; const page=hasMore?rows.slice(0,limit):rows;
    const items=page.map(row=>({schemaVersion:'1.0' as const,observationId:String(row.observation_id),sourceId:String(row.source_id),sourceVersion:String(row.source_version),environmentId:String(row.environment_id),
      resourceId:row.resource_id===null?null:String(row.resource_id),observedAt:String(row.observed_at),receivedAt:String(row.received_at),category:row.category as OperationCategory,classification:String(row.classification),
      confidence:row.confidence as Observation['confidence'],evidenceRef:String(row.evidence_ref),coverage:'covered' as const,correlation:JSON.parse(String(row.correlation_json)),fields:JSON.parse(String(row.fields_json))} as Observation));
    return {items,nextCursor:hasMore?Number(page[page.length-1]!.sequence):null,coverage:this.coverage(environmentId,category)};
  }

  incidents(environmentId: string, status?: 'open'|'acknowledged'|'resolved', severity?: OperationRule['severity'], projectId?:string) {
    if (!idPattern.test(environmentId) || (status!==undefined&&!['open','acknowledged','resolved'].includes(status)) ||
        (severity!==undefined&&!['info','low','medium','high','critical'].includes(severity)) || (projectId!==undefined&&!idPattern.test(projectId))) throw new Error('Filtro de incidente inválido');
    if (projectId&&!this.db.prepare('SELECT 1 FROM projects WHERE project_id=?').get(projectId)) throw new Error('Projeto desconhecido');
    const rows=this.db.prepare(`SELECT i.* FROM operation_incidents i WHERE i.environment_id=? AND (? IS NULL OR i.status=?) AND (? IS NULL OR i.severity=?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM infra_project_resources p WHERE p.project_id=? AND p.resource_id=i.resource_id)) ORDER BY i.updated_at DESC`)
      .all(environmentId,status??null,status??null,severity??null,severity??null,projectId??null,projectId??null) as Array<Row & { incident_id:string; source_id:string; status:string; rule_version:number }>;
    return rows.map(row=>({...row,evidence:JSON.parse(String(row.evidence_json)),events:this.db.prepare('SELECT transition,actor,occurred_at,reason,evidence_ref FROM operation_incident_events WHERE incident_id=? ORDER BY rowid').all(row.incident_id)}));
  }

  actorCanAccessIncident(incidentId: string, projectIds: readonly string[]): boolean {
    if (!idPattern.test(incidentId) || !projectIds.length || projectIds.some(id=>!idPattern.test(id))) return false;
    const placeholders=projectIds.map(()=>'?').join(',');
    return !!this.db.prepare(`SELECT 1 FROM operation_incidents i JOIN infra_project_resources p ON p.resource_id=i.resource_id
      WHERE i.incident_id=? AND p.project_id IN (${placeholders}) LIMIT 1`).get(incidentId,...projectIds);
  }

  acknowledge(incidentId:string,actor:string,at=new Date().toISOString()):void {
    if (!idPattern.test(incidentId)||!idPattern.test(actor)||!Number.isFinite(Date.parse(at))) throw new Error('Reconhecimento inválido');
    const row=this.db.prepare('SELECT status FROM operation_incidents WHERE incident_id=?').get(incidentId) as {status:string}|undefined;
    if (!row || row.status==='resolved') throw new Error('Incidente indisponível para reconhecimento');
    this.db.transaction(()=>{this.db.prepare("UPDATE operation_incidents SET status='acknowledged',acknowledged_by=?,acknowledged_at=?,updated_at=? WHERE incident_id=?").run(actor,at,at,incidentId);this.incidentEvent(incidentId,'acknowledged',actor,at,'Reconhecido pelo operador');})();
  }

  resolve(incidentId:string,actor:string,reason:string,at=new Date().toISOString()):void {
    if (!idPattern.test(incidentId)||!idPattern.test(actor)||!reason.trim()||reason.length>500||!Number.isFinite(Date.parse(at))) throw new Error('Resolução inválida');
    const safeReason=redactString(reason.trim());
    const row=this.db.prepare('SELECT status FROM operation_incidents WHERE incident_id=?').get(incidentId) as {status:string}|undefined;
    if (!row || row.status==='resolved') throw new Error('Incidente indisponível para resolução');
    this.db.transaction(()=>{this.db.prepare("UPDATE operation_incidents SET status='resolved',resolved_by=?,resolved_at=?,resolution_reason=?,updated_at=? WHERE incident_id=?").run(actor,at,safeReason,at,incidentId);this.incidentEvent(incidentId,'resolved',actor,at,safeReason);})();
  }
}
