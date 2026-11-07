export interface GitHubResponse { status: number; headers: Headers; body: unknown }
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export interface GitHubPageCacheEntry { url: string; etag: string; next: string | null }

export class GitHubRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Limite GitHub atingido; tentar após ${retryAfterMs} ms`);
    this.retryAfterMs = retryAfterMs;
  }
}

export class GitHubClient {
  private readonly token: string;
  private readonly fetcher: FetchLike;
  private readonly base: string;
  private readonly pageCache = new Map<string,{etag:string;next:string|null}>();
  constructor(token = '', fetcher: FetchLike = fetch, base = 'https://api.github.com') {
    this.token = token;
    this.fetcher = fetcher;
    this.base = base;
    if (token && Buffer.byteLength(token) < 20) throw new Error('Token GitHub inválido');
  }

  clearPageCache(): void { this.pageCache.clear(); }

  pageCacheSnapshot(): GitHubPageCacheEntry[] {
    return [...this.pageCache].map(([url,value])=>({url,etag:value.etag,next:value.next})).sort((a,b)=>a.url.localeCompare(b.url));
  }

  restorePageCache(entries: readonly GitHubPageCacheEntry[]): void {
    const origin = new URL(this.base).origin;
    if (entries.length > 1000 || entries.some(entry=>
      !entry.url || new URL(entry.url).origin !== origin ||
      !entry.etag || entry.etag.length > 512 ||
      (entry.next !== null && new URL(entry.next).origin !== origin))) throw new Error('Cache de páginas GitHub inválido');
    this.pageCache.clear();
    for (const entry of entries) this.pageCache.set(entry.url,{etag:entry.etag,next:entry.next});
  }

  async get(url: string, etag?: string): Promise<GitHubResponse> {
    const headers: Record<string,string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (etag) headers['If-None-Match'] = etag;
    const response = await this.fetcher(new URL(url, this.base), { headers });
    if (response.status === 304) return { status: 304, headers: response.headers, body: null };
    if (response.status === 401) throw new Error('Credencial GitHub recusada');
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const rawRetryAfter = response.headers.get('retry-after');
      const secondary = response.status === 403 && remaining !== '0' && !rawRetryAfter &&
        /secondary rate limit|abuse detection|rate limit exceeded/i.test(await response.text());
      if (response.status === 429 || remaining === '0' || rawRetryAfter || secondary) {
        const reset = Number(response.headers.get('x-ratelimit-reset'));
        const seconds = rawRetryAfter === null ? NaN : Number(rawRetryAfter);
        const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : rawRetryAfter ? Date.parse(rawRetryAfter) - Date.now() : 0;
        const resetMs = Number.isFinite(reset) && reset > 0 ? reset * 1000 - Date.now() : 0;
        const fallbackMs = (!rawRetryAfter && remaining !== '0') || (retryAfterMs <= 0 && resetMs <= 0) ? 60000 : 0;
        throw new GitHubRateLimitError(Math.max(fallbackMs, Math.ceil(retryAfterMs || 0), Math.ceil(resetMs)));
      }
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
      const cached = this.pageCache.get(next);
      const response = await this.get(next,cached?.etag);
      if (response.status === 304) {
        if (!cached) throw new Error('Resposta GitHub 304 sem página em cache');
        next = cached.next;
        continue;
      }
      const pageBody = collectionKey && response.body && typeof response.body === 'object' && !Array.isArray(response.body)
        ? (response.body as Record<string,unknown>)[collectionKey] : response.body;
      if (!Array.isArray(pageBody)) throw new Error('Resposta paginada GitHub inválida');
      result.push(...pageBody as T[]);
      const following = parseNext(response.headers.get('link'));
      const etag = response.headers.get('etag');
      if (etag) this.pageCache.set(next,{etag,next:following});
      else this.pageCache.delete(next);
      next = following;
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
