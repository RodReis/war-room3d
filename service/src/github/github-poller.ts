import type { EventStore } from '../store/event-store.ts';
import { GitHubClient, normalizePullRequest, normalizeWorkflowRun } from './github-client.ts';

interface PullRequest { id:number; number:number; state:string; merged_at:string|null; updated_at:string; html_url:string }
interface WorkflowRun { id:number; workflow_id:number; run_attempt:number; head_sha:string; head_branch:string; status:string; conclusion:string|null; updated_at:string; html_url:string }

export async function pollLinkedRepositories(store: EventStore, client: GitHubClient): Promise<{ repositories: number; milestones: number; errors: Array<{ repositoryId:string; message:string }> }> {
  const links = store.history.repositories();
  const byRepository = new Map<string, typeof links>();
  for (const link of links) byRepository.set(link.repositoryId, [...(byRepository.get(link.repositoryId) ?? []), link]);
  let milestones = 0;
  const errors: Array<{repositoryId:string;message:string}> = [];
  for (const [repositoryId, projectLinks] of byRepository) {
    const { owner, name } = projectLinks[0]!;
    try {
      const [pullRequests, workflowRuns] = await Promise.all([
        client.getAllPages<PullRequest>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?state=all&per_page=100`),
        client.getAllPages<WorkflowRun>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?per_page=100`)
      ]);
      for (const link of projectLinks) {
        for (const pr of pullRequests) if (store.history.recordGithubMilestone(normalizePullRequest(repositoryId, link.projectId, pr))) milestones++;
        for (const run of workflowRuns) {
          const normalized = normalizeWorkflowRun(repositoryId, link.projectId, run);
          if (normalized && store.history.recordGithubMilestone(normalized)) milestones++;
        }
      }
    } catch (error) {
      errors.push({ repositoryId, message: error instanceof Error ? error.message : 'Falha de coleta GitHub' });
    }
  }
  return { repositories: byRepository.size, milestones, errors };
}
