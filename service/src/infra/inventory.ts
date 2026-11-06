import { Ajv2020 } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';

export type ResourceKind = 'host' | 'docker' | 'api' | 'database';
export type LinkOrigin = 'configured' | 'observed' | 'user_asserted';
export type LinkConfidence = 'confirmed' | 'unverified';
export interface Environment { environmentId: string; name: string }
export interface Resource { resourceId: string; environmentId: string; kind: ResourceKind; name: string; sourceId: string; staleAfterMs: number }
export interface ProjectResource { projectId: string; resourceId: string; origin: LinkOrigin; confidence: LinkConfidence }
export interface Dependency { dependentResourceId: string; dependencyResourceId: string; origin: LinkOrigin; confidence: LinkConfidence }
export interface Inventory { schemaVersion: '1.0'; environments: Environment[]; resources: Resource[]; projectResources: ProjectResource[]; dependencies: Dependency[] }

const schema = JSON.parse(readFileSync(new URL('../../../contracts/schemas/resource.v1.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ strict: true }).compile(schema);

export function parseInventory(input: unknown, knownProjects: ReadonlySet<string>): Inventory {
  if (!validate(input)) throw new Error(`Inventário inválido: ${validate.errors?.[0]?.instancePath ?? ''} ${validate.errors?.[0]?.message ?? ''}`);
  const inventory = input as Inventory;
  const environments = new Set(inventory.environments.map(item => item.environmentId));
  const resources = new Map(inventory.resources.map(item => [item.resourceId, item]));
  if (environments.size !== inventory.environments.length || resources.size !== inventory.resources.length) throw new Error('ID duplicado no inventário');
  for (const resource of inventory.resources) if (!environments.has(resource.environmentId)) throw new Error('Ambiente de recurso desconhecido');
  const links = new Set<string>();
  for (const link of inventory.projectResources) {
    if (!knownProjects.has(link.projectId) || !resources.has(link.resourceId)) throw new Error('Vínculo com projeto ou recurso desconhecido');
    const key = `${link.projectId}\0${link.resourceId}`;
    if (links.has(key)) throw new Error('Vínculo duplicado');
    links.add(key);
  }
  const dependencies = new Set<string>();
  for (const edge of inventory.dependencies) {
    const dependent = resources.get(edge.dependentResourceId);
    const dependency = resources.get(edge.dependencyResourceId);
    if (!dependent || !dependency || dependent.environmentId !== dependency.environmentId || dependent.resourceId === dependency.resourceId)
      throw new Error('Dependência inválida ou entre ambientes distintos');
    const key = `${edge.dependentResourceId}\0${edge.dependencyResourceId}`;
    if (dependencies.has(key)) throw new Error('Dependência duplicada');
    dependencies.add(key);
  }
  return inventory;
}
