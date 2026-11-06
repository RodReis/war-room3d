import { createHash } from 'node:crypto';
import path from 'node:path';

export type Provider = 'claude' | 'codex';

export function sessionKey(provider: Provider, accountRef: string, providerSessionId: string): string {
  if (!accountRef || !providerSessionId) throw new Error('Identidade de sessão incompleta');
  const value = JSON.stringify([provider, accountRef, providerSessionId]);
  return `session-${createHash('sha256').update(value).digest('hex')}`;
}

export function normalizeProjectPath(input: string): string {
  if (!input || !input.trim()) throw new Error('Caminho de projeto vazio');
  if (/^[a-zA-Z]:[\\/]/.test(input) || input.startsWith('\\\\')) {
    return path.win32.normalize(input).replaceAll('/', '\\').toLowerCase();
  }
  if (input.startsWith('/')) return path.posix.normalize(input);
  throw new Error('Caminho de projeto deve ser absoluto');
}

export interface ProjectRecord {
  projectId: string;
  name: string;
  canonicalPath: string;
  aliases?: string[];
}

export class ProjectRegistry {
  private readonly pathToId = new Map<string, string>();
  private readonly projects = new Map<string, ProjectRecord>();

  constructor(records: ProjectRecord[] = []) {
    for (const record of records) this.add(record);
  }

  add(record: ProjectRecord): void {
    if (this.projects.has(record.projectId)) throw new Error('Projeto duplicado');
    const paths = [record.canonicalPath, ...(record.aliases ?? [])].map(normalizeProjectPath);
    for (const candidate of paths) {
      const existing = this.pathToId.get(candidate);
      if (existing && existing !== record.projectId) throw new Error('Alias colide com outro projeto');
    }
    this.projects.set(record.projectId, record);
    for (const candidate of paths) this.pathToId.set(candidate, record.projectId);
  }

  resolve(cwd: string | null | undefined): string | null {
    if (!cwd) return null;
    try { return this.pathToId.get(normalizeProjectPath(cwd)) ?? null; }
    catch { return null; }
  }
}
