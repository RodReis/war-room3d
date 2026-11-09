// Reaproveita spools e banco do laboratório anterior. Não inicia provedor ou Docker.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { SessionFileCollector } from '../src/sessions/file-source.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const [mode, previousDatabase, previousClaudeReport, codexReport, newClaudeReport, playerPath] = process.argv.slice(2);
if (mode !== '--run') {
  console.log(JSON.stringify({ executes: false, startsProvider: false, startsDocker: false,
    copiesPreviousDatabase: true, playerCaptures: ['plugin-claude-chat', 'plugin-claude-activity',
      'plugin-codex-chat', 'plugin-docker-log'] }));
  process.exit(0);
}
assert.ok([previousDatabase, previousClaudeReport, codexReport, newClaudeReport, playerPath]
  .every(value => value && path.isAbsolute(value) && existsSync(value)));
const priorClaude = JSON.parse(readFileSync(previousClaudeReport, 'utf8'));
const codex = JSON.parse(readFileSync(codexReport, 'utf8'));
const claude = JSON.parse(readFileSync(newClaudeReport, 'utf8'));
assert.equal(priorClaude.provider, 'claude');
assert.equal(codex.provider, 'codex');
assert.equal(claude.provider, 'claude');
assert.equal(claude.sessionNew, true);
assert.equal(claude.roundTrip, true);
assert.equal(claude.skillBodyObserved, true);
assert.ok([priorClaude.spool, codex.spool, claude.spool].every(existsSync));
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'Logs', `issue-35-claude-plugin-replay-${randomUUID()}`);
mkdirSync(output, { recursive: true });
const databasePath = path.join(output, 'state.sqlite');
copyFileSync(previousDatabase, databasePath);
const store = new EventStore(databasePath);
const projectId = 'lab-35-claude-plugin';
const sourceId = 'issue-35-claude-plugin-lab';
const consentRef = 'issue-35-synthetic-authorization';
const sources = [
  { sourceId: 'issue-35-claude-lab', sourceVersion: priorClaude.version, provider: 'claude',
    projectId: 'lab-35-claude', accountRef: 'disposable-35', filePath: priorClaude.spool,
    conversationContent: { consentRef, retentionDays: 1 } },
  { sourceId: 'issue-35-codex-lab', sourceVersion: codex.version, provider: 'codex',
    projectId: 'lab-35-codex', accountRef: 'disposable-35', filePath: codex.spool,
    conversationContent: { consentRef, retentionDays: 1 } },
  { sourceId, sourceVersion: claude.version, provider: 'claude', projectId,
    accountRef: 'disposable-35', filePath: claude.spool,
    skillCommands: ['wr3d-35:synthetic'],
    conversationContent: { consentRef, retentionDays: 1 } }
];
let api, player;
const summary = { status: 'fail', startsProvider: false, startsDocker: false,
  sourceDatabaseCopied: true, skillBodyObserved: claude.skillBodyObserved,
  skillHookObserved: claude.skillHookObserved, skillExpansionObserved: claude.skillExpansionObserved ?? false,
  skillEventInService: false, chatHttp: null, captures: {} };
try {
  store.registerProject({ projectId, name: 'LAB #35 · CLAUDE / PLUGIN', canonicalPath: claude.project });
  store.reconcileSessionSourceBindings(sources);
  new SessionFileCollector(store, [sources[2]]).poll();
  const snapshot = store.snapshot();
  assert.equal(snapshot.sessions.length, 4);
  assert.equal(snapshot.agents.filter(agent => agent.parentAgentKey).length, 1);
  assert.equal(store.operations.query({ environmentId: 'env-35-docker', projectId: 'lab-35-claude',
    category: 'log', requestId: 'req-35-docker' }).items.length, 1);
  assert.equal(snapshot.sources.find(source => source.sourceId === sourceId)?.status, 'atual');
  const session = snapshot.sessions.find(item => item.projectId === projectId && item.provider === 'claude');
  assert.ok(session);
  const agent = snapshot.agents.find(item => item.sessionKey === session.sessionKey && !item.parentAgentKey);
  assert.ok(agent?.agentKey);
  summary.skillEventInService = snapshot.invocations.some(item => item.sessionKey === session.sessionKey &&
    item.kind === 'skill');
  const token = randomBytes(32).toString('hex');
  api = await startReadOnlyServer(store, token, 0);
  const response = await fetch(`${api.url}/v1/conversations?projectId=${projectId}&sessionKey=${encodeURIComponent(session.sessionKey)}&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } });
  const page = await response.json();
  summary.chatHttp = { status: response.status, roles: page.items?.map(item => item.role),
    contentOptIn: page.items?.every(item => item.consentRef === consentRef),
    receiptIsResponse: page.receiptIsResponse,
    responseMarkerVisible: page.items?.some(item => item.role === 'assistant' &&
      item.content.includes('WR3D_35_CLAUDE_RESPOSTA')) };
  assert.equal(response.status, 200);
  assert.deepEqual(summary.chatHttp.roles, ['user', 'assistant']);
  assert.equal(summary.chatHttp.contentOptIn, true);
  assert.equal(summary.chatHttp.responseMarkerVisible, true);
  const capture = async (name, view, targetProjectId = projectId, targetAgentKey = agent.agentKey, marker = '') => {
    const reportPath = path.join(output, `${name}.json`);
    const outcome = await new Promise(resolve => {
      player = spawn(playerPath, ['-screen-width', '1920', '-screen-height', '1080',
        '-screen-fullscreen', '0', '-logFile', path.join(output, `${name}.log`)],
      { env: { ...process.env, WR3D_SERVICE_URL: api.url, WR3D_SERVICE_TOKEN: token,
        WR3D_COMMAND_TOKEN: '', WR3D_35_PROOF_DIR: '', WR3D_VALIDATION_CAPTURE_DIR: output,
        WR3D_VALIDATION_CAPTURE_NAME: name, WR3D_VALIDATION_VIEW: view,
        WR3D_VALIDATION_PROJECT_ID: targetProjectId, WR3D_VALIDATION_AGENT_KEY: targetAgentKey,
        WR3D_VALIDATION_ACTIVITY_MARKER: view === 'agent' ? 'wr3d-35:synthetic' : '',
        WR3D_VALIDATION_CHAT_MARKER: view === 'chat' ? marker : '',
        WR3D_VALIDATION_REQUEST_ID: view === 'logs' ? marker : '' }, stdio: 'ignore' });
      const timer = setTimeout(() => { player?.kill(); resolve({ timeout: true }); }, 30000);
      player.once('exit', code => { clearTimeout(timer); resolve({ code }); });
      player.once('error', error => { clearTimeout(timer); resolve({ error: error.code }); });
    });
    player = null;
    const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
    const playerLog = path.join(output, `${name}.log`);
    return { exitCode: outcome.code ?? null, timeout: !!outcome.timeout,
      error: outcome.error ?? null, view: report?.view ?? null,
      playerLogNoException: existsSync(playerLog) && !/(?:NullReferenceException|MissingReferenceException|Exception:)/.test(readFileSync(playerLog, 'utf8')),
      selectedAgentKey: report?.selectedAgentKey ?? null,
      linkedChildCount: report?.linkedChildCount ?? null,
      parentLinkVisible: report?.parentLinkVisible ?? false,
      chatMessageCount: report?.chatMessageCount ?? null,
      responseMarkerVisible: report?.chatExpectedMarkerVisible ?? false,
      activityMarkerVisible: report?.activityExpectedMarkerVisible ?? false,
      logResultCount: report?.logResultCount ?? null,
      requestIdVisible: report?.logRequestIdVisible ?? false,
      redacted: report?.logRedacted ?? false };
  };
  summary.captures.chat = await capture('plugin-claude-chat', 'chat', projectId, agent.agentKey,
    'WR3D_35_CLAUDE_RESPOSTA');
  summary.captures.activity = await capture('plugin-claude-activity', 'agent');
  const codexSession = snapshot.sessions.find(item => item.projectId === 'lab-35-codex' &&
    item.provider === 'codex' && snapshot.agents.some(candidate =>
      candidate.sessionKey === item.sessionKey && !candidate.parentAgentKey));
  const codexAgent = snapshot.agents.find(item => item.sessionKey === codexSession?.sessionKey && !item.parentAgentKey);
  assert.ok(codexAgent);
  const codexChild = snapshot.agents.find(item => item.parentAgentKey === codexAgent.agentKey);
  assert.equal(codexChild?.parentStatus, 'vinculado');
  summary.codexChildEnded = codexChild?.presence === 'encerrada';
  summary.captures.codexChat = await capture('plugin-codex-chat', 'chat', 'lab-35-codex', codexAgent.agentKey,
    'WR3D_35_MAIN_ACK');
  summary.captures.dockerLog = await capture('plugin-docker-log', 'logs', 'lab-35-claude', '',
    'req-35-docker');
  summary.status = Object.values(summary.captures).every(item => item.playerLogNoException) &&
    summary.captures.chat.exitCode === 0 &&
    summary.captures.chat.chatMessageCount === 2 && summary.captures.chat.responseMarkerVisible &&
    summary.captures.activity.exitCode === 0 && summary.captures.activity.activityMarkerVisible &&
    summary.captures.codexChat.exitCode === 0 && summary.captures.codexChat.responseMarkerVisible &&
    summary.captures.codexChat.linkedChildCount === 1 &&
    summary.captures.dockerLog.exitCode === 0 && summary.captures.dockerLog.requestIdVisible &&
    summary.captures.dockerLog.redacted ? 'pass' : 'fail';
  writeFileSync(path.join(output, 'result.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ output, ...summary }));
  if (summary.status === 'fail') process.exitCode = 1;
} finally {
  if (player && player.exitCode === null) player.kill();
  if (api) { api.server.closeAllConnections(); await new Promise(resolve => api.server.close(resolve)); }
  store.close();
}
