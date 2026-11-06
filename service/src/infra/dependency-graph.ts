import type { Dependency, ProjectResource } from './inventory.ts';

export interface Impact { resourceIds: string[]; projectIds: string[] }

// Aresta A -> B significa que A depende de B. Falha de B alcança A e seus projetos.
export function affectedBy(resourceId: string, dependencies: readonly Dependency[], links: readonly ProjectResource[]): Impact {
  const reverse = new Map<string, string[]>();
  for (const edge of dependencies) {
    const list = reverse.get(edge.dependencyResourceId) ?? [];
    list.push(edge.dependentResourceId);
    reverse.set(edge.dependencyResourceId, list);
  }
  const visited = new Set<string>();
  const pending = [resourceId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(reverse.get(current) ?? []));
  }
  const projectIds = new Set(links.filter(link => visited.has(link.resourceId)).map(link => link.projectId));
  return { resourceIds: [...visited].sort(), projectIds: [...projectIds].sort() };
}
