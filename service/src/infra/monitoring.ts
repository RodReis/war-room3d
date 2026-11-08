import { httpProbe } from './connectors/http.ts';
import { localHostProbe } from './connectors/host.ts';
import { CollectorRunner, type Probe } from './connectors/probe.ts';
import { parseInventory, type Inventory } from './inventory.ts';
import type { EventStore } from '../store/event-store.ts';
import type { ProjectRecord } from '../domain/identity.ts';
import { normalizeProjectPath } from '../domain/identity.ts';
import { createHttpNetworkSink } from '../operations/operation-collector.ts';
import type { OperationRule } from '../operations/operations-store.ts';

interface MonitoringConfig {
  schemaVersion: '1.0';
  projects: ProjectRecord[];
  inventory: Inventory;
  probes: ({ kind: 'host'; resourceId: string } | { kind: 'api'; resourceId: string; url: string })[];
  intervalMs: number;
  timeoutMs: number;
  m5NetworkSignals: boolean;
  m5NetworkRetentionDays: number | undefined;
  m5Rules: OperationRule[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConfig(input: unknown): MonitoringConfig {
  if (!isRecord(input) || input.schemaVersion !== '1.0' || !Array.isArray(input.projects) ||
      !Array.isArray(input.probes) || !Number.isSafeInteger(input.intervalMs) || !Number.isSafeInteger(input.timeoutMs) ||
      (input.intervalMs as number) < 1000 || (input.intervalMs as number) > 3600000 ||
      (input.timeoutMs as number) < 100 || (input.timeoutMs as number) > 30000 ||
      (input.m5NetworkSignals !== undefined && typeof input.m5NetworkSignals !== 'boolean') ||
      (input.m5NetworkRetentionDays !== undefined && (typeof input.m5NetworkRetentionDays!=='number'||!Number.isSafeInteger(input.m5NetworkRetentionDays)||input.m5NetworkRetentionDays<1||input.m5NetworkRetentionDays>3650)) ||
      (input.m5NetworkSignals===true && input.m5NetworkRetentionDays===undefined) ||
      (input.m5Rules !== undefined && !Array.isArray(input.m5Rules)) ||
      Object.keys(input).some(key => !['schemaVersion', 'projects', 'inventory', 'probes', 'intervalMs', 'timeoutMs', 'm5NetworkSignals', 'm5NetworkRetentionDays', 'm5Rules'].includes(key)))
    throw new Error('Configuração de monitoração inválida');
  const projects: ProjectRecord[] = [];
  const projectIds = new Set<string>();
  for (const value of input.projects) {
    if (!isRecord(value) || typeof value.projectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value.projectId) ||
        typeof value.name !== 'string' || typeof value.canonicalPath !== 'string' || value.name.length === 0 || value.name.length > 80 ||
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
  if (input.m5NetworkSignals===true && !probes.some(probe=>probe.kind==='api')) throw new Error('Sinais de rede M5 exigem ao menos uma sonda API configurada');
  const m5Rules:OperationRule[]=[]; const ruleKeys=new Set<string>();
  for (const value of (input.m5Rules??[]) as unknown[]) {
    if (!isRecord(value)||Object.keys(value).some(key=>!['ruleId','version','category','field','operator','expectedValue','severity','enabled'].includes(key))||
        typeof value.ruleId!=='string'||typeof value.version!=='number'||(value.category!=='network'&&value.category!=='security_detection')||typeof value.field!=='string'||
        !['eq','gt','gte','lt','lte'].includes(String(value.operator))||!['string','number','boolean'].includes(typeof value.expectedValue)||
        !['info','low','medium','high','critical'].includes(String(value.severity))||typeof value.enabled!=='boolean') throw new Error('Regra M5 inválida');
    const key=`${value.ruleId}:${value.version}`; if(ruleKeys.has(key)) throw new Error('Regra M5 duplicada'); ruleKeys.add(key);
    m5Rules.push(value as unknown as OperationRule);
  }
  return { schemaVersion: '1.0', projects, inventory, probes,
    intervalMs: input.intervalMs as number, timeoutMs: input.timeoutMs as number, m5NetworkSignals: input.m5NetworkSignals === true,
    m5NetworkRetentionDays: input.m5NetworkRetentionDays as number|undefined, m5Rules };
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
  store.registerProjectsAndReplaceInventory(config.projects.filter(project => !existing.has(project.projectId)), config.inventory);
  for (const rule of config.m5Rules) store.operations.registerRule(rule);
  const apiResources=new Map(config.probes.filter((probe):probe is {kind:'api';resourceId:string;url:string}=>probe.kind==='api')
    .map(probe=>[probe.resourceId,{environmentId:resources.get(probe.resourceId)!.environmentId}]));
  const sink=config.m5NetworkSignals?createHttpNetworkSink(store.operations,apiResources,config.intervalMs,config.m5NetworkRetentionDays!):undefined;
  return { runner: new CollectorRunner(store.infrastructure, probes, config.timeoutMs, undefined, sink), intervalMs: config.intervalMs };
}
