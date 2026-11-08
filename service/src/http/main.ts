import { EventStore } from '../store/event-store.ts';
import { startReadOnlyServer } from './server.ts';
import { configureMonitoring } from '../infra/monitoring.ts';
import { readFileSync } from 'node:fs';
import { GitHubClient } from '../github/github-client.ts';
import { pollLinkedRepositories } from '../github/github-poller.ts';
import { configureGithub } from '../github/github-config.ts';

const databasePath = process.env.WR3D_DATABASE_PATH;
const token = process.env.WR3D_SERVICE_TOKEN;
const port = Number(process.env.WR3D_SERVICE_PORT);
if (!databasePath || !token || !Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error('Banco, token ou porta do serviço não configurados');
const store = new EventStore(databasePath);
try {
  store.commands.recover();
  store.history.pruneExpired();
  const retentionTimer = setInterval(() => {
    try { store.history.pruneExpired(); }
    catch { process.stdout.write('M3: manutenção da retenção indisponível\n'); }
  }, 86400000);
  retentionTimer.unref();
  const configPath = process.env.WR3D_MONITORING_CONFIG_PATH;
  const monitoring = configPath ? configureMonitoring(store, JSON.parse(readFileSync(configPath, 'utf8')) as unknown,
    { dockerToken: process.env.WR3D_DOCKER_PROXY_TOKEN }) : null;
  const githubConfigPath = process.env.WR3D_GITHUB_CONFIG_PATH;
  if (githubConfigPath) configureGithub(store, JSON.parse(readFileSync(githubConfigPath, 'utf8')) as unknown);
  const commandToken=process.env.WR3D_COMMAND_TOKEN;
  const commandProjects=process.env.WR3D_COMMAND_PROJECT_IDS?.split(',').map(value=>value.trim()).filter(Boolean)??[];
  const { server, url } = await startReadOnlyServer(store, token, port, {token:commandToken,actor:{actorId:'operador-local',projectIds:commandProjects}});
  monitoring?.runner.start(monitoring.intervalMs);
  const githubToken = process.env.WR3D_GITHUB_TOKEN;
  let githubTimer: NodeJS.Timeout | null = null;
  let pollRunning = false;
  let nextPollAllowedAt = store.history.githubRetryUntilMs();
  if (githubConfigPath) {
    const client = new GitHubClient(githubToken ?? '');
    try { client.restorePageCache(store.history.githubPageCache()); }
    catch { client.clearPageCache(); process.stdout.write('GitHub M3: cache de páginas inválido; nova leitura necessária\n'); }
    const poll = async (): Promise<void> => {
      if (pollRunning || Date.now() < nextPollAllowedAt) return;
      pollRunning = true;
      try {
        const result = await pollLinkedRepositories(store, client, githubToken ? 60000 : 600000);
        nextPollAllowedAt = Math.max(nextPollAllowedAt, store.history.githubRetryUntilMs());
        process.stdout.write(`GitHub M3: ${result.repositories} repositórios, ${result.milestones} marcos novos, ${result.errors.length} falhas\n`);
      } catch { process.stdout.write('GitHub M3: coleta indisponível\n'); }
      finally { pollRunning = false; }
    };
    void poll();
    githubTimer = setInterval(() => void poll(), githubToken ? 60000 : 600000);
  }
  process.stdout.write(`Serviço de leitura ativo em ${url}\n`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => {
    clearInterval(retentionTimer);
    if (githubTimer) clearInterval(githubTimer);
    await monitoring?.runner.stop();
    server.closeAllConnections();
    server.close(() => store.close());
  });
} catch (error) { store.close(); throw error; }
