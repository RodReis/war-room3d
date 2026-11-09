// Reabre somente o banco do ensaio já encerrado. Não cria sessão nem contêiner.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const [mode, databasePath, playerPath] = process.argv.slice(2);
if (mode !== '--run') {
  console.log(JSON.stringify({ executes: false, createsProviderSession: false, createsDockerContainer: false }));
  process.exit(0);
}
assert.ok([databasePath, playerPath].every(value => value && path.isAbsolute(value) && existsSync(value)));
const output = path.dirname(databasePath);
const store = new EventStore(databasePath);
const token = randomBytes(32).toString('hex');
let api, player;
const summary = { status: 'fail', sourceDatabase: databasePath, createsProviderSession: false,
  createsDockerContainer: false, chatHttp: {}, captures: {} };
try {
  const snapshot = store.snapshot();
  assert.equal(snapshot.sessions.length, 3);
  assert.equal(snapshot.agents.filter(agent => agent.parentAgentKey).length, 1);
  const log = store.operations.query({ environmentId: 'env-35-docker', projectId: 'lab-35-claude',
    category: 'log', requestId: 'req-35-docker' });
  assert.equal(log.items.length, 1);
  assert.equal(log.items[0].fields.message,
    'WR3D35_DOCKER_SOURCE requestId=req-35-docker token=[REDACTED]');
  api = await startReadOnlyServer(store, token, 0);
  for (const provider of ['claude', 'codex']) {
    const session = snapshot.sessions.find(item => item.projectId === `lab-35-${provider}` &&
      snapshot.agents.some(agent => agent.sessionKey === item.sessionKey && !agent.parentAgentKey));
    assert.ok(session);
    const route = `/v1/conversations?projectId=${session.projectId}&sessionKey=${encodeURIComponent(session.sessionKey)}&limit=50`;
    const response = await fetch(api.url + route, { headers: { Authorization: `Bearer ${token}` } });
    const page = await response.json();
    summary.chatHttp[provider] = { status: response.status,
      roles: page.items?.map(item => item.role), receiptIsResponse: page.receiptIsResponse,
      contentOptIn: page.items?.every(item => item.consentRef === 'issue-35-synthetic-authorization') };
    assert.equal(response.status, 200);
    assert.ok(summary.chatHttp[provider].roles.includes('assistant'));
  }
  const capture = async (name, view, projectId, agentKey, marker) => {
    const reportPath = path.join(output, `${name}.json`);
    const outcome = await new Promise(resolve => {
      player = spawn(playerPath, ['-screen-width', '1920', '-screen-height', '1080',
        '-screen-fullscreen', '0', '-logFile', path.join(output, `${name}.log`)],
      { env: { ...process.env, WR3D_SERVICE_URL: api.url, WR3D_SERVICE_TOKEN: token,
        WR3D_COMMAND_TOKEN: '', WR3D_35_PROOF_DIR: '', WR3D_VALIDATION_CAPTURE_DIR: output,
        WR3D_VALIDATION_CAPTURE_NAME: name, WR3D_VALIDATION_VIEW: view,
        WR3D_VALIDATION_PROJECT_ID: projectId, WR3D_VALIDATION_AGENT_KEY: agentKey,
        WR3D_VALIDATION_CHAT_MARKER: view === 'chat' ? marker : '',
        WR3D_VALIDATION_REQUEST_ID: view === 'logs' ? marker : '' }, stdio: 'ignore' });
      const timer = setTimeout(() => { player?.kill(); resolve({ timeout: true }); }, 30000);
      player.once('exit', code => { clearTimeout(timer); resolve({ code }); });
      player.once('error', error => { clearTimeout(timer); resolve({ error: error.code }); });
    });
    player = null;
    const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
    return { exitCode: outcome.code ?? null, timeout: !!outcome.timeout,
      error: outcome.error ?? null, view: report?.view ?? null,
      selectedAgentKey: report?.selectedAgentKey ?? null,
      chatMessageCount: report?.chatMessageCount ?? null,
      markerVisible: report?.chatExpectedMarkerVisible ?? false,
      logResultCount: report?.logResultCount ?? null,
      requestIdVisible: report?.logRequestIdVisible ?? false,
      redacted: report?.logRedacted ?? false };
  };
  for (const provider of ['claude', 'codex']) {
    const session = snapshot.sessions.find(item => item.projectId === `lab-35-${provider}` &&
      snapshot.agents.some(agent => agent.sessionKey === item.sessionKey && !agent.parentAgentKey));
    const agent = snapshot.agents.find(item => item.sessionKey === session.sessionKey && !item.parentAgentKey);
    summary.captures[`${provider}Chat`] = await capture(`replay-${provider}-chat`, 'chat',
      session.projectId, agent.agentKey, provider === 'claude' ? 'não está instalado' : 'WR3D_35_MAIN_ACK');
  }
  summary.captures.dockerLog = await capture('replay-claude-room-docker-log', 'logs',
    'lab-35-claude', '', 'req-35-docker');
  const c = summary.captures;
  summary.status = c.claudeChat.exitCode === 0 && c.claudeChat.markerVisible &&
    c.codexChat.exitCode === 0 && c.codexChat.markerVisible &&
    c.dockerLog.exitCode === 0 && c.dockerLog.requestIdVisible && c.dockerLog.redacted ? 'partial' : 'fail';
  writeFileSync(path.join(output, 'replay-result.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (summary.status === 'fail') process.exitCode = 1;
} finally {
  if (player && player.exitCode === null) player.kill();
  if (api) { api.server.closeAllConnections(); await new Promise(resolve => api.server.close(resolve)); }
  store.close();
}
