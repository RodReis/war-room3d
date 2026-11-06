export interface GitHubResponse { status: number; headers: Headers; body: unknown }
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class GitHubClient {
  private readonly token: string;
  private readonly fetcher: FetchLike;
  private readonly base: string;
  constructor(token = '', fetcher: FetchLike = fetch, base = 'https://api.github.com') {
    this.token = token;
    this.fetcher = fetcher;
    this.base = base;
    if (token && Buffer.byteLength(token) < 20) throw new Error('Token GitHub inválido');
  }

  async get(url: string, etag?: string): Promise<GitHubResponse> {
    const headers: Record<string,string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (etag) headers['If-None-Match'] = etag;
    const response = await this.fetcher(new URL(url, this.base), { headers });
    if (response.status === 304) return { status: 304, headers: response.headers, body: null };
    if (response.status === 401) throw new Error('Credencial GitHub recusada');
    if (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))) {
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new Error(`Limite GitHub atingido; tentar após ${retryAfter || Math.max(0, reset * 1000 - Date.now())} ms`);
    }
    if (!response.ok) throw new Error(`GitHub API retornou HTTP ${response.status}`);
    return { status: response.status, headers: response.headers, body: await response.json() as unknown };
  }

  async getAllPages<T>(path: string, collectionKey?: string): Promise<T[]> {
    let next: string | null = new URL(path, this.base).href;
    const apiOrigin = new URL(this.base).origin;
    const result: T[] = [];
    for (let page = 0; next && page < 100; page++) {
      if (new URL(next).origin !== apiOrigin) throw new Error('Link de paginação GitHub fora da origem confiável');
      const response = await this.get(next);
      const pageBody = collectionKey && response.body && typeof response.body === 'object' && !Array.isArray(response.body)
        ? (response.body as Record<string,unknown>)[collectionKey] : response.body;
      if (!Array.isArray(pageBody)) throw new Error('Resposta paginada GitHub inválida');
      result.push(...pageBody as T[]);
      next = parseNext(response.headers.get('link'));
    }
    if (next) throw new Error('Paginação GitHub excedeu limite de segurança');
    return result;
  }
}

function parseNext(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    const match = /^\s*<([^>]+)>\s*;\s*rel="([^"]+)"/.exec(part);
    if (match?.[2] === 'next') return match[1]!;
  }
  return null;
}

export function normalizePullRequest(repositoryId: string, projectId: string, pr: { id: number; number: number; state: string; merged_at: string | null; updated_at: string; html_url: string }): { repositoryId: string; projectId: string; entityType: 'pull_request'; entityId: string; transition: string; occurredAt: string; payload: Record<string, unknown> } {
  const transition = pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
  return { repositoryId, projectId, entityType: 'pull_request', entityId: String(pr.id), transition,
    occurredAt: pr.merged_at ?? pr.updated_at, payload: { number: pr.number, url: pr.html_url, state: pr.state, mergedAt: pr.merged_at } };
}

export function normalizeWorkflowRun(repositoryId: string, projectId: string, run: { id: number; workflow_id: number; run_attempt: number; head_sha: string; head_branch: string | null; status: string; conclusion: string | null; updated_at: string; html_url: string }): { repositoryId: string; projectId: string; entityType: 'workflow'; entityId: string; transition: string; occurredAt: string; payload: Record<string, unknown> } | null {
  if (run.status !== 'completed' || !run.conclusion || !run.head_branch || !run.head_sha) return null;
  const runIdentity = `${run.workflow_id}:${run.id}:${run.head_branch}:${run.head_sha}`;
  return { repositoryId, projectId, entityType: 'workflow', entityId: runIdentity, transition: `attempt-${run.run_attempt}-${run.conclusion}`,
    occurredAt: run.updated_at, payload: { workflowId: run.workflow_id, runId: run.id, attempt: run.run_attempt, ref: run.head_branch, headSha: run.head_sha, url: run.html_url } };
}
