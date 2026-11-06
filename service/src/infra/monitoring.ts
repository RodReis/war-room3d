import { httpProbe } from './connectors/http.ts';
import { localHostProbe } from './connectors/host.ts';
import { CollectorRunner, type Probe } from './connectors/probe.ts';
import { parseInventory, type Inventory } from './inventory.ts';
import type { EventStore } from '../store/event-store.ts';
import type { ProjectRecord } from '../domain/identity.ts';
import { normalizeProjectPath } from '../domain/identity.ts';

interface MonitoringConfig {
  schemaVersion: '1.0';
  projects: ProjectRecord[];
  inventory: Inventory;
  probes: ({ kind: 'host'; resourceId: string } | { kind: 'api'; resourceId: string; url: string })[];
  intervalMs: number;
  timeoutMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConfig(input: unknown): MonitoringConfig {
  if (!isRecord(input) || input.schemaVersion !== '1.0' || !Array.isArray(input.projects) ||
      !Array.isArray(input.probes) || !Number.isSafeInteger(input.intervalMs) || !Number.isSafeInteger(input.timeoutMs) ||
      (input.intervalMs as number) < 1000 || (input.intervalMs as number) > 3600000 ||
      (input.timeoutMs as number) < 100 || (input.timeoutMs as number) > 30000 ||
      Object.keys(input).some(key => !['schemaVersion', 'projects', 'inventory', 'probes', 'intervalMs', 'timeoutMs'].includes(key)))
    throw new Error('Configuração de monitoração inválida');
  const projects: ProjectRecord[] = [];
  const projectIds = new Set<string>();
  for (const value of input.projects) {
    if (!isRecord(value) || typeof value.projectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value.projectId) ||
        typeof value.name !== 'string' || typeof value.canonicalPath !== 'string' || value.name.length === 0 ||
        value.canonicalPath.length === 0 || Object.keys(value).some(key => !['projectId', 'name', 'canonicalPath', 'aliases'].includes(key)) ||
        (value.aliases !== undefined && (!Array.isArray(value.aliases) || !value.aliases.every(item => typeof item === 'string'))))
      throw new Error('Projeto de monitoração inválido');
    if (projectIds.has(value.projectId)) throw new Error('Projeto duplicado na monitoração');
    projectIds.add(value.projectId);
    projects.push(value as unknown as ProjectRecord);
  }
  const inventory = parseInventory(input.inventory, projectIds);
  const projectPaths = new Map<string, string>();
  for (const project of projects) for (const candidate of [project.canonicalPath, ...(project.aliases ?? [])]) {
    const normalized = normalizeProjectPath(candidate);
    const prior = projectPaths.get(normalized);
    if (prior && prior !== project.projectId) throw new Error('Caminho compartilhado por projetos distintos');
    projectPaths.set(normalized, project.projectId);
  }
  const resources = new Map(inventory.resources.map(resource => [resource.resourceId, resource]));
  const probes: MonitoringConfig['probes'] = [];
  const probeIds = new Set<string>();
  for (const value of input.probes) {
    if (!isRecord(value) || typeof value.resourceId !== 'string' ||
        (value.kind !== 'host' && value.kind !== 'api') ||
        Object.keys(value).some(key => !['kind', 'resourceId', 'url'].includes(key)) ||
        (value.kind === 'host' && 'url' in value) ||
        (value.kind === 'api' && typeof value.url !== 'string'))
      throw new Error('Sonda não autorizada pela configuração');
    const resource = resources.get(value.resourceId);
    if (!resource || resource.kind !== value.kind || probeIds.has(value.resourceId))
      throw new Error('Sonda sem recurso correspondente ou duplicada');
    probeIds.add(value.resourceId);
    if (value.kind === 'host') probes.push({ kind: 'host', resourceId: value.resourceId });
    else probes.push({ kind: 'api', resourceId: value.resourceId, url: value.url as string });
  }
  if (probes.length === 0) throw new Error('Nenhuma sonda configurada');
  return { schemaVersion: '1.0', projects, inventory, probes,
    intervalMs: input.intervalMs as number, timeoutMs: input.timeoutMs as number };
}

export function configureMonitoring(store: EventStore, input: unknown): { runner: CollectorRunner; intervalMs: number } {
  const config = parseConfig(input);
  const resources = new Map(config.inventory.resources.map(resource => [resource.resourceId, resource]));
  const probes: Probe[] = config.probes.map(item => {
    const resource = resources.get(item.resourceId)!;
    return item.kind === 'host'
      ? localHostProbe(resource.resourceId, resource.sourceId)
      : httpProbe(resource.resourceId, resource.sourceId, item.url);
  });
  const existing = new Map((store.snapshot().projects as { projectId: string; name: string }[]).map(project => [project.projectId, project.name]));
  for (const project of config.projects) {
    const alreadyRegistered = existing.has(project.projectId);
    if (alreadyRegistered && existing.get(project.projectId) !== project.name)
      throw new Error('Projeto existente não corresponde à configuração');
    for (const candidate of [project.canonicalPath, ...(project.aliases ?? [])]) {
      const owner = store.resolveProject(candidate);
      if (alreadyRegistered && owner !== project.projectId)
        throw new Error('Caminho de projeto existente não corresponde à configuração');
      if (!alreadyRegistered && owner !== null)
        throw new Error('Caminho de projeto já pertence a outro cadastro');
    }
  }
  for (const project of config.projects) if (!existing.has(project.projectId)) store.registerProject(project);
  store.infrastructure.replaceInventory(config.inventory);
  return { runner: new CollectorRunner(store.infrastructure, probes, config.timeoutMs), intervalMs: config.intervalMs };
}
