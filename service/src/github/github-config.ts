import type { EventStore } from '../store/event-store.ts';
import { normalizeProjectPath, ProjectRegistry, type ProjectRecord } from '../domain/identity.ts';

type RepositoryBinding = { repositoryId: string; owner: string; name: string; projectId: string };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function configureGithub(store: EventStore, input: unknown): { projects: number; repositories: number } {
  if (!object(input) || input.schemaVersion !== '1.0' || !Array.isArray(input.projects) || !Array.isArray(input.repositories) ||
      Object.keys(input).some(key => !['schemaVersion','projects','repositories'].includes(key))) throw new Error('Configuração GitHub inválida');
  const projects: ProjectRecord[] = [];
  for (const item of input.projects) {
    if (!object(item) || typeof item.projectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(item.projectId) ||
        typeof item.name !== 'string' || item.name.length < 1 || item.name.length > 80 || typeof item.canonicalPath !== 'string' ||
        (item.aliases !== undefined && (!Array.isArray(item.aliases) || !item.aliases.every(alias => typeof alias === 'string'))) ||
        Object.keys(item).some(key => !['projectId','name','canonicalPath','aliases'].includes(key))) throw new Error('Projeto GitHub inválido');
    normalizeProjectPath(item.canonicalPath);
    projects.push(item as unknown as ProjectRecord);
  }
  new ProjectRegistry(projects);
  const existing = new Map((store.snapshot().projects as {projectId:string;name:string}[]).map(p => [p.projectId,p.name]));
  const newProjects: ProjectRecord[] = [];
  for (const project of projects) {
    if (existing.has(project.projectId)) {
      if (existing.get(project.projectId) !== project.name ||
          [project.canonicalPath,...(project.aliases ?? [])].some(candidate => store.resolveProject(candidate) !== project.projectId))
        throw new Error('Projeto GitHub difere do cadastro existente');
    } else {
      for (const candidate of [project.canonicalPath,...(project.aliases ?? [])])
        if (store.resolveProject(candidate) !== null) throw new Error('Caminho GitHub já pertence a outro projeto');
      newProjects.push(project);
    }
  }
  const repositories: RepositoryBinding[] = [];
  const links = new Set<string>();
  for (const item of input.repositories) {
    if (!object(item) || typeof item.repositoryId !== 'string' || !/^[1-9]\d{0,19}$/.test(item.repositoryId) ||
        typeof item.owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(item.owner) ||
        typeof item.name !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(item.name) || item.name === '.' || item.name === '..' ||
        typeof item.projectId !== 'string' || (!existing.has(item.projectId) && !projects.some(p => p.projectId === item.projectId)) ||
        Object.keys(item).some(key => !['repositoryId','owner','name','projectId'].includes(key))) throw new Error('Vínculo GitHub inválido');
    const key = `${item.repositoryId}:${item.projectId}`;
    if (links.has(key)) throw new Error('Vínculo GitHub duplicado');
    links.add(key);
    repositories.push(item as RepositoryBinding);
  }
  store.registerProjectsAndLinkRepositories(newProjects,repositories);
  return {projects:projects.length,repositories:repositories.length};
}
