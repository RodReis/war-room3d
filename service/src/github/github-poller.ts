import type { EventStore } from '../store/event-store.ts';
import { GitHubClient, GitHubRateLimitError, normalizePullRequest, normalizeWorkflowRun } from './github-client.ts';

interface PullRequest { id:number; number:number; state:string; merged_at:string|null; updated_at:string; html_url:string }
interface WorkflowRun { id:number; workflow_id:number; run_attempt:number; head_sha:string; head_branch:string|null; status:string; conclusion:string|null; updated_at:string; html_url:string }

export async function pollLinkedRepositories(store: EventStore, client: GitHubClient, expectedIntervalMs = 60000): Promise<{ repositories: number; milestones: number; errors: Array<{ repositoryId:string; message:string; retryAfterMs?:number }> }> {
  const links = store.history.repositories();
  const byRepository = new Map<string, typeof links>();
  for (const link of links) byRepository.set(link.repositoryId, [...(byRepository.get(link.repositoryId) ?? []), link]);
  let milestones = 0;
  const errors: Array<{repositoryId:string;message:string;retryAfterMs?:number}> = [];
  for (const [repositoryId, projectLinks] of byRepository) {
    const { owner, name } = projectLinks[0]!;
    const startedAt = new Date().toISOString();
    try {
      const lastScanStartedAt = store.history.lastSuccessfulPollStartedAt(repositoryId);
      if (!lastScanStartedAt || projectLinks.some(link=>link.linkedAt>lastScanStartedAt)) client.clearPageCache();
      const identity = await client.get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
      if (!identity.body || typeof identity.body !== 'object' || Array.isArray(identity.body) ||
          String((identity.body as {id?:unknown}).id) !== repositoryId) throw new Error('ID GitHub diverge do vínculo configurado');
      const [pullRequests, workflowRuns] = await Promise.all([
        client.getAllPages<PullRequest>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?state=all&sort=updated&direction=desc&per_page=100`),
        client.getAllPages<WorkflowRun>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?per_page=100`, 'workflow_runs')
      ]);
      pullRequests.sort((a,b)=>(a.merged_at??a.updated_at).localeCompare(b.merged_at??b.updated_at)||a.id-b.id);
      workflowRuns.sort((a,b)=>a.updated_at.localeCompare(b.updated_at)||a.id-b.id||a.run_attempt-b.run_attempt);
      for (const link of projectLinks) {
        const isInitialForProject = !lastScanStartedAt || link.linkedAt>lastScanStartedAt;
        const modeFor = (occurredAt:string): 'backfill'|'live' => isInitialForProject || occurredAt<=lastScanStartedAt ? 'backfill' : 'live';
        for (const pr of pullRequests) {
          const normalized = normalizePullRequest(repositoryId, link.projectId, pr);
          if (store.history.recordGithubMilestone({...normalized,ingestionMode:modeFor(normalized.occurredAt)})) milestones++;
        }
        for (const run of workflowRuns) {
          const normalized = normalizeWorkflowRun(repositoryId, link.projectId, run);
          if (normalized && store.history.recordGithubMilestone({...normalized,ingestionMode:modeFor(normalized.occurredAt)})) milestones++;
        }
      }
      store.history.markPollSuccess(repositoryId,startedAt,client.pageCacheSnapshot(),expectedIntervalMs);
    } catch (error) {
      client.clearPageCache();
      store.history.markPollFailure(repositoryId,startedAt,error instanceof GitHubRateLimitError?'rate_limited':'api_error',expectedIntervalMs);
      errors.push({ repositoryId, message: error instanceof Error ? error.message : 'Falha de coleta GitHub',
        ...(error instanceof GitHubRateLimitError ? {retryAfterMs:error.retryAfterMs} : {}) });
    }
  }
  return { repositories: byRepository.size, milestones, errors };
}
