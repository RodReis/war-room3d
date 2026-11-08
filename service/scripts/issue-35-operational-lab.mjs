// Integra apenas duas sessões novas autorizadas e um contêiner descartável.
// Sem --run, não inicia Player, Docker ou provedor. Os spools brutos ficam em Logs/.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { SessionFileCollector } from '../src/sessions/file-source.ts';
import { dockerEngineReader, startDockerSnapshotProxy } from '../src/infra/connectors/docker-proxy.ts';
import { createDockerLogsCollector } from '../src/operations/operation-collector.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const [mode, claudePath, codexPath, playerPath] = process.argv.slice(2);
if (mode !== '--run') {
  console.log(JSON.stringify({ source: 'two-authorized-new-sessions-and-one-disposable-docker-container',
    executes: false, network: 'none', volumes: 0, playerControl: 'stop.signal', maxPlayerSeconds: 180 }));
  process.exit(0);
}
if (![claudePath, codexPath, playerPath].every(value => value && path.isAbsolute(value) && existsSync(value)))
  throw new Error('Informe relatórios absolutos de Claude/Codex e Player M5');
const claude = JSON.parse(readFileSync(claudePath, 'utf8'));
const codex = JSON.parse(readFileSync(codexPath, 'utf8'));
if (claude.provider !== 'claude' || codex.provider !== 'codex' || !claude.roundTrip || !codex.roundTrip ||
    !claude.project || !codex.project ||
    !existsSync(claude.spool) || !existsSync(codex.spool))
  throw new Error('Sessões autorizadas, chat ou subagente não comprovados');
const codexRecords = readFileSync(codex.spool, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const activities = codexRecords.filter(record => record.params?.item?.type === 'subAgentActivity');
const childIds = new Set(activities.map(record => record.params?.item?.agentThreadId).filter(Boolean));
if (childIds.size !== 1 || !activities.some(record => record.params?.item?.kind === 'started') ||
    !activities.some(record => record.params?.item?.kind === 'completed') ||
    !codexRecords.some(record => record.method === 'turn/started' && childIds.has(record.params?.threadId)))
  throw new Error('Subagente Codex único, início, fim ou turno não comprovado');

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'Logs', `issue-35-operational-${randomUUID()}`);
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(path.join(os.tmpdir(), 'wr3d-35-operational-'));
const composeProject = `wr3d35${randomBytes(4).toString('hex')}`;
const composeFile = path.join(temporary, 'compose.yml');
const dockerArgs = ['compose', '-p', composeProject, '-f', composeFile];
const docker = (args, timeout = 20000) => execFileSync('docker', [...dockerArgs, ...args],
  { cwd: temporary, encoding: 'utf8', timeout, windowsHide: true });
const projectId = 'lab-35-docker', environmentId = 'env-35-docker', resourceId = 'api-35-docker';
writeFileSync(composeFile, `services:\n  api:\n    image: node:24-alpine\n    network_mode: "none"\n    read_only: true\n    command: ["node", "-e", "console.log('WR3D35_DOCKER_SOURCE requestId=req-35-docker token=synthetic-secret'); setInterval(() => {}, 1000)"]\n`);
let up = false, store, proxy, api, player;
const summary = { status: 'fail', syntheticContent: true, providers: ['claude', 'codex'],
  oneCodexChild: false, sourceToStore: false, chatHttp: {}, docker: {}, player: {} };
try {
  execFileSync('docker', ['image', 'inspect', 'node:24-alpine'], { stdio: 'ignore', timeout: 10000, windowsHide: true });
  up = true;
  docker(['up', '-d', '--no-build', '--pull', 'never'], 30000);
  const containerId = docker(['ps', '-q', 'api']).trim();
  assert.match(containerId, /^[a-f0-9]{12,64}$/);
  const inspected = JSON.parse(execFileSync('docker', ['inspect', containerId],
    { encoding: 'utf8', timeout: 10000, windowsHide: true }))[0];
  const workingDir = inspected?.Config?.Labels?.['com.docker.compose.project.working_dir'];
  assert.equal(inspected?.Config?.Labels?.['com.docker.compose.project'], composeProject);
  assert.equal(inspected?.Config?.Labels?.['com.docker.compose.service'], 'api');
  assert.equal(path.resolve(workingDir).toLowerCase(), path.resolve(temporary).toLowerCase());
  assert.equal(inspected?.HostConfig?.NetworkMode, 'none');
  assert.equal(inspected?.HostConfig?.ReadonlyRootfs, true);
  assert.deepEqual(inspected?.Mounts, []);
  assert.equal(inspected?.State?.Running, true);
  assert.ok(Object.values(inspected?.NetworkSettings?.Ports ?? {}).every(value => value === null));

  store = new EventStore(path.join(output, 'state.sqlite'));
  const projects = [
    { projectId: 'lab-35-claude', name: 'LAB #35 · CLAUDE', canonicalPath: claude.project },
    { projectId: 'lab-35-codex', name: 'LAB #35 · CODEX', canonicalPath: codex.project }
  ];
  const sources = [
    { sourceId: 'issue-35-claude-lab', sourceVersion: claude.version, provider: 'claude',
      projectId: projects[0].projectId, accountRef: 'disposable-35', filePath: claude.spool,
      conversationContent: { consentRef: 'issue-35-synthetic-authorization', retentionDays: 1 } },
    { sourceId: 'issue-35-codex-lab', sourceVersion: codex.version, provider: 'codex',
      projectId: projects[1].projectId, accountRef: 'disposable-35', filePath: codex.spool,
      conversationContent: { consentRef: 'issue-35-synthetic-authorization', retentionDays: 1 } }
  ];
  store.configureSessionSources(projects, sources);
  new SessionFileCollector(store, sources).poll();
  store.registerProject({ projectId, name: 'LAB #35 · DOCKER', canonicalPath: temporary });
  store.infrastructure.replaceInventory({ schemaVersion: '1.0',
    environments: [{ environmentId, name: 'Docker local descartável' }],
    resources: [{ resourceId, environmentId, kind: 'api', name: 'API de laboratório',
      sourceId: 'probe-35-docker', staleAfterMs: 600000 }],
    projectResources: [{ projectId, resourceId, origin: 'configured', confidence: 'confirmed' }], dependencies: [] });
  const proxyToken = randomBytes(32).toString('hex');
  proxy = await startDockerSnapshotProxy(dockerEngineReader(), { composeProject, composeWorkingDir: workingDir }, proxyToken, 0, true);
  const collector = createDockerLogsCollector(store.operations,
    { composeProject, composeWorkingDir: workingDir, environmentId, resourceId,
      retentionDays: 1, initialLookbackMinutes: 5 },
    { url: proxy.url.replace('/v1/snapshot', '/v1/logs'), token: proxyToken });
  const collected = await collector.collectOnce();
  assert.equal(collected.state, 'running');
  assert.ok(collected.recorded >= 1);
  const logPage = store.operations.query({ environmentId, projectId, category: 'log', requestId: 'req-35-docker' });
  assert.equal(logPage.items.length, 1);
  assert.equal(logPage.items[0].fields.message,
    'WR3D35_DOCKER_SOURCE requestId=req-35-docker token=[REDACTED]');
  summary.docker = { source: 'docker-engine-local', recorded: collected.recorded, coverage: logPage.coverage,
    network: 'none', volumes: 0, ports: 0, redacted: true };

  const token = randomBytes(32).toString('hex');
  api = await startReadOnlyServer(store, token, 0);
  const snapshotResponse = await fetch(`${api.url}/v1/snapshot`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  const children = snapshot.agents.filter(agent => agent.parentAgentKey);
  summary.oneCodexChild = children.length === 1 && children[0].parentStatus === 'vinculado' &&
    snapshot.sessions.find(session => session.sessionKey === children[0].sessionKey)?.provider === 'codex';
  summary.sourceToStore = snapshot.sessions.filter(session => ['claude', 'codex'].includes(session.provider)).length === 3 &&
    summary.oneCodexChild;
  assert.equal(summary.sourceToStore, true);
  for (const provider of ['claude', 'codex']) {
    const session = snapshot.sessions.find(item => item.projectId === `lab-35-${provider}` &&
      !children.some(child => child.sessionKey === item.sessionKey));
    assert.ok(session);
    const route = `/v1/conversations?projectId=lab-35-${provider}&sessionKey=${encodeURIComponent(session.sessionKey)}&limit=50`;
    const response = await fetch(api.url + route, { headers: { Authorization: `Bearer ${token}` } });
    const page = await response.json();
    const roles = page.items?.map(item => item.role) ?? [];
    summary.chatHttp[provider] = { httpStatus: response.status, roles,
      receiptIsResponse: page.receiptIsResponse, contentOptIn: page.items?.every(item =>
        item.consentRef === 'issue-35-synthetic-authorization') };
    assert.equal(response.status, 200);
    assert.ok(roles.includes('user') && roles.includes('assistant'));
    assert.equal(page.receiptIsResponse, false);
  }

  const playerExit = new Promise(resolve => {
    player = spawn(playerPath, ['-screen-width', '1920', '-screen-height', '1080',
      '-screen-fullscreen', '0', '-logFile', path.join(output, 'player.log')],
    { env: { ...process.env, WR3D_SERVICE_URL: api.url, WR3D_SERVICE_TOKEN: token,
      WR3D_COMMAND_TOKEN: '' }, stdio: 'ignore' });
    player.once('exit', (code, signal) => resolve({ code, signal }));
    player.once('error', error => resolve({ error: error.code }));
  });
  summary.player = { processId: player.pid, build: path.basename(playerPath), manualUiPending: true };
  writeFileSync(path.join(output, 'result.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ output, projectNames: snapshot.projects.map(item => item.name),
    sessionCount: snapshot.sessions.length, agentCount: snapshot.agents.length,
    linkedChildCount: children.length, chatHttp: summary.chatHttp, docker: summary.docker,
    playerPid: player.pid, stopSignal: path.join(output, 'stop.signal') }));
  const deadline = Date.now() + 180000;
  while (!existsSync(path.join(output, 'stop.signal')) && Date.now() < deadline && player.exitCode === null)
    await new Promise(resolve => setTimeout(resolve, 200));
  summary.player.manualUiPending = false;
  summary.player.stoppedBy = existsSync(path.join(output, 'stop.signal')) ? 'operator' :
    Date.now() >= deadline ? 'timeout' : 'player-exit';
  if (player.exitCode === null) player.kill();
  summary.player.exit = await Promise.race([playerExit, new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 5000))]);
  summary.status = summary.sourceToStore && summary.oneCodexChild && summary.docker.redacted ? 'pass-backend' : 'fail';
  writeFileSync(path.join(output, 'result.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ output, status: summary.status, player: summary.player }));
} finally {
  if (player && player.exitCode === null) player.kill();
  if (api) { api.server.closeAllConnections(); await new Promise(resolve => api.server.close(resolve)); }
  if (proxy) { proxy.server.closeAllConnections(); await new Promise(resolve => proxy.server.close(resolve)); }
  store?.close();
  let removed = false;
  try { if (up) docker(['down', '--timeout', '5'], 30000); removed = true; }
  finally {
    if (removed) {
      if (!path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep))
        throw new Error('Diretório temporário fora do alvo');
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}
