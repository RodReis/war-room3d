import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { compareTimestamp } from '../domain/session-reducer.ts';
import { affectedBy } from './dependency-graph.ts';
import { reduceHealth, type Reading } from './health-reducer.ts';
import { parseInventory, type Dependency, type Inventory, type ProjectResource, type Resource } from './inventory.ts';

type Row = Record<string, unknown>;

export class InfrastructureStore {
  private readonly db: Database.Database;
  constructor(db: Database.Database) { this.db = db; }

  replaceInventory(input: unknown): void {
    const knownProjects = new Set((this.db.prepare('SELECT project_id FROM projects').all() as { project_id: string }[]).map(row => row.project_id));
    const inventory = parseInventory(input, knownProjects);
    this.db.transaction(() => this.writeInventory(inventory))();
  }

  private writeInventory(inventory: Inventory): void {
    this.db.prepare('UPDATE infra_environments SET active = 0').run();
    this.db.prepare('UPDATE infra_resources SET active = 0').run();
    for (const item of inventory.environments)
      this.db.prepare(`INSERT INTO infra_environments(environment_id, name, active) VALUES (?, ?, 1)
        ON CONFLICT(environment_id) DO UPDATE SET name = excluded.name, active = 1`).run(item.environmentId, item.name);
    for (const item of inventory.resources) {
      const prior = this.db.prepare('SELECT environment_id FROM infra_resources WHERE resource_id = ?').get(item.resourceId) as { environment_id: string } | undefined;
      if (prior && prior.environment_id !== item.environmentId) throw new Error('Identidade de recurso não pode mudar de ambiente');
      this.db.prepare(`INSERT INTO infra_resources(resource_id, environment_id, kind, name, source_id, stale_after_ms, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(resource_id) DO UPDATE SET kind = excluded.kind, name = excluded.name, source_id = excluded.source_id,
          stale_after_ms = excluded.stale_after_ms, active = 1`)
        .run(item.resourceId, item.environmentId, item.kind, item.name, item.sourceId, item.staleAfterMs);
    }
    this.db.prepare('DELETE FROM infra_project_resources').run();
    this.db.prepare('DELETE FROM infra_dependencies').run();
    for (const link of inventory.projectResources)
      this.db.prepare('INSERT INTO infra_project_resources VALUES (?, ?, ?, ?)').run(link.projectId, link.resourceId, link.origin, link.confidence);
    for (const edge of inventory.dependencies)
      this.db.prepare('INSERT INTO infra_dependencies VALUES (?, ?, ?, ?)').run(edge.dependentResourceId, edge.dependencyResourceId, edge.origin, edge.confidence);
    this.db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'revision'").run();
  }

  recordReading(input: Reading, recordedAt: string = new Date().toISOString()): boolean {
    const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
    if (!id.test(input.resourceId) || !id.test(input.sourceId) || !id.test(input.sourceVersion) || !['saudavel', 'degradado', 'indisponivel', 'sem_dados'].includes(input.health) ||
        !id.test(input.evidenceRef ?? '') || !Number.isFinite(Date.parse(input.observedAt)) || !Number.isFinite(Date.parse(recordedAt)) ||
        compareTimestamp(input.observedAt, recordedAt) > 0 ||
        ((input.indicator ?? null) !== null && !id.test(input.indicator!)) ||
        ((input.value ?? null) !== null && !Number.isFinite(input.value)) ||
        ((input.unit ?? null) !== null && !/^[A-Za-z%][A-Za-z0-9%/._-]{0,15}$/.test(input.unit!)) ||
        ((input.indicator ?? null) === null) !== ((input.value ?? null) === null) ||
        ((input.indicator ?? null) === null) !== ((input.unit ?? null) === null)) throw new Error('Leitura inválida ou sem evidência');
    return this.db.transaction(() => {
      const resource = this.db.prepare('SELECT source_id FROM infra_resources WHERE resource_id = ? AND active = 1').get(input.resourceId) as { source_id: string } | undefined;
      if (!resource || resource.source_id !== input.sourceId) throw new Error('Recurso ou fonte não autorizados pelo inventário');
      const previous = this.db.prepare(`SELECT r.observed_at, r.source_id, r.source_version, r.health, r.evidence_ref, r.indicator, r.value, r.unit
        FROM infra_latest l JOIN infra_readings r ON r.id = l.reading_id WHERE l.resource_id = ?`).get(input.resourceId) as {
          observed_at: string; source_id: string; source_version: string; health: string; evidence_ref: string;
          indicator: string | null; value: number | null; unit: string | null
        } | undefined;
      if (previous) {
        const order = compareTimestamp(input.observedAt, previous.observed_at);
        if (order === 0 && (input.sourceId !== previous.source_id || input.sourceVersion !== previous.source_version ||
            input.health !== previous.health || input.evidenceRef !== previous.evidence_ref ||
            (input.indicator ?? null) !== previous.indicator || (input.value ?? null) !== previous.value ||
            (input.unit ?? null) !== previous.unit)) throw new Error('Leitura colide com outra no mesmo instante');
        if (order <= 0) return false;
      }
      const result = this.db.prepare(`INSERT INTO infra_readings(resource_id, source_id, source_version, health, observed_at, evidence_ref, indicator, value, unit, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.resourceId, input.sourceId, input.sourceVersion, input.health, input.observedAt, input.evidenceRef,
          input.indicator ?? null, input.value ?? null, input.unit ?? null, recordedAt);
      this.db.prepare(`INSERT INTO infra_latest(resource_id, reading_id) VALUES (?, ?)
        ON CONFLICT(resource_id) DO UPDATE SET reading_id = excluded.reading_id`).run(input.resourceId, result.lastInsertRowid);
      const loss = this.db.prepare('SELECT last_lost_at FROM infra_source_status WHERE source_id = ?').get(input.sourceId) as { last_lost_at: string } | undefined;
      const failure = this.db.prepare('SELECT last_failed_at FROM infra_resource_status WHERE resource_id = ?').get(input.resourceId) as { last_failed_at: string } | undefined;
      if ((!loss || compareTimestamp(input.observedAt, loss.last_lost_at) > 0) && (!failure || compareTimestamp(input.observedAt, failure.last_failed_at) > 0)) {
        if (input.health === 'saudavel')
          this.db.prepare('UPDATE infra_incidents SET resolved_at = ? WHERE resource_id = ? AND resolved_at IS NULL').run(input.observedAt, input.resourceId);
        else if (input.health !== 'sem_dados' && !this.db.prepare('SELECT 1 FROM infra_incidents WHERE resource_id = ? AND resolved_at IS NULL').get(input.resourceId))
          this.db.prepare('INSERT INTO infra_incidents VALUES (?, ?, ?, ?, ?, NULL)').run(randomUUID(), input.resourceId, input.observedAt, input.health, input.evidenceRef);
      }
      this.db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'revision'").run();
      return true;
    })();
  }

  markSourceLost(sourceId: string, lostAt: string): boolean {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(sourceId) || !Number.isFinite(Date.parse(lostAt)) || compareTimestamp(lostAt, lostAt) !== 0) throw new Error('Perda de fonte inválida');
    return this.db.transaction(() => {
      if (!this.db.prepare('SELECT 1 FROM infra_resources WHERE source_id = ? AND active = 1').get(sourceId)) throw new Error('Fonte fora do inventário');
      const row = this.db.prepare('SELECT last_lost_at FROM infra_source_status WHERE source_id = ?').get(sourceId) as { last_lost_at: string } | undefined;
      if (row && compareTimestamp(lostAt, row.last_lost_at) <= 0) return false;
      this.db.prepare(`INSERT INTO infra_source_status(source_id, last_lost_at) VALUES (?, ?)
        ON CONFLICT(source_id) DO UPDATE SET last_lost_at = excluded.last_lost_at`).run(sourceId, lostAt);
      this.db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'revision'").run();
      return true;
    })();
  }

  markResourceCollectionFailed(resourceId: string, failedAt: string): boolean {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(resourceId) || !Number.isFinite(Date.parse(failedAt)) || compareTimestamp(failedAt, failedAt) !== 0)
      throw new Error('Falha de coleta inválida');
    return this.db.transaction(() => {
      if (!this.db.prepare('SELECT 1 FROM infra_resources WHERE resource_id = ? AND active = 1').get(resourceId)) throw new Error('Recurso fora do inventário');
      const row = this.db.prepare('SELECT last_failed_at FROM infra_resource_status WHERE resource_id = ?').get(resourceId) as { last_failed_at: string } | undefined;
      if (row && compareTimestamp(failedAt, row.last_failed_at) <= 0) return false;
      this.db.prepare(`INSERT INTO infra_resource_status(resource_id, last_failed_at) VALUES (?, ?)
        ON CONFLICT(resource_id) DO UPDATE SET last_failed_at = excluded.last_failed_at`).run(resourceId, failedAt);
      this.db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'revision'").run();
      return true;
    })();
  }

  snapshot(now: string = new Date().toISOString()): Row {
    const environments = (this.db.prepare('SELECT environment_id AS environmentId, name FROM infra_environments WHERE active = 1 ORDER BY environment_id').all() as Row[]);
    const resources = this.db.prepare(`SELECT resource_id AS resourceId, environment_id AS environmentId, kind, name, source_id AS sourceId,
      stale_after_ms AS staleAfterMs FROM infra_resources WHERE active = 1 ORDER BY resource_id`).all() as unknown as Resource[];
    const projectResources = this.db.prepare('SELECT project_id AS projectId, resource_id AS resourceId, origin, confidence FROM infra_project_resources ORDER BY project_id, resource_id').all() as ProjectResource[];
    const dependencies = this.db.prepare('SELECT dependent_resource_id AS dependentResourceId, dependency_resource_id AS dependencyResourceId, origin, confidence FROM infra_dependencies ORDER BY dependent_resource_id, dependency_resource_id').all() as Dependency[];
    const readings = this.db.prepare(`SELECT l.resource_id AS resourceId, r.source_id AS sourceId, r.source_version AS sourceVersion,
      r.health, r.observed_at AS observedAt, r.evidence_ref AS evidenceRef, r.indicator, r.value, r.unit FROM infra_latest l JOIN infra_readings r ON r.id = l.reading_id`).all() as Reading[];
    const latest = new Map(readings.map(reading => [reading.resourceId, reading]));
    const losses = new Map((this.db.prepare('SELECT source_id, last_lost_at FROM infra_source_status').all() as { source_id: string; last_lost_at: string }[])
      .map(row => [row.source_id, row.last_lost_at]));
    const failures = new Map((this.db.prepare('SELECT resource_id, last_failed_at FROM infra_resource_status').all() as { resource_id: string; last_failed_at: string }[])
      .map(row => [row.resource_id, row.last_failed_at]));
    const resourceStates = resources.map(resource => ({ resourceId: resource.resourceId,
      dependentProjectIds: affectedBy(resource.resourceId, dependencies, projectResources).projectIds,
      ...reduceHealth(latest.get(resource.resourceId)?.sourceId === resource.sourceId ? latest.get(resource.resourceId)! : null,
        laterOf(losses.get(resource.sourceId), failures.get(resource.resourceId)), resource.staleAfterMs, now, resource.sourceId) }));
    const incidents = (this.db.prepare('SELECT incident_id AS incidentId, resource_id AS resourceId, opened_at AS openedAt, opened_health AS openedHealth, evidence_ref AS evidenceRef, resolved_at AS resolvedAt FROM infra_incidents WHERE resolved_at IS NULL ORDER BY opened_at').all() as Row[])
      .filter(row => resources.some(resource => resource.resourceId === row.resourceId))
      .map(row => ({ ...row, ...affectedBy(row.resourceId as string, dependencies, projectResources) }));
    return { environments, resources, projectResources, dependencies, resourceStates, incidents };
  }
}

function laterOf(a: string | undefined, b: string | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return compareTimestamp(a, b) >= 0 ? a : b;
}
