import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const scenario = process.argv[2];
const cases = {
  empty: { view: 'room', expected: 0 },
  working: { view: 'room', expected: 3 },
  opposite: { view: 'room-opposite', expected: 3 },
  reduced: { view: 'room-reduced', expected: 3 },
  child: { view: 'agent', expected: 3 },
  childFocus: { view: 'agent-focus', expected: 3 },
  waiting: { view: 'room', expected: 3 },
  unknown: { view: 'room', expected: 3 },
  ended: { view: 'room', expected: 0 },
  overflow: { view: 'room', expected: 12, grouped: 2 }
};
if (!cases[scenario]) throw new Error('Cenário sintético inválido');
const selected = cases[scenario];
const captureDir = process.argv[3] ?? process.env.WR3D_CAPTURE_DIR ??
  fileURLToPath(new URL('../../Logs/issue-32-player-captures/', import.meta.url));
const player = process.env.WR3D_PLAYER_PATH ?? fileURLToPath(new URL('../../unity/Builds/WarRoom3D-M2-Live/WarRoom3D.exe', import.meta.url));
const name = `issue-32-${scenario}`;
const imagePath = path.join(captureDir, `${name}.png`);
const reportPath = path.join(captureDir, `${name}.json`);
if (existsSync(imagePath) || existsSync(reportPath)) throw new Error('Prova anterior existe; preservar e escolher novo diretório');
mkdirSync(captureDir, { recursive: true });

const store = new EventStore(':memory:');
let server, child, timer;
try {
  for (let i = 1; i <= 3; i++)
    store.registerProject({ projectId: `p${i}`, name: i === 3 ? 'Sala sintética' : `Projeto sintético ${i}`, canonicalPath: `C:/synthetic/p${i}` });
  let serial = 0;
  function apply(type, provider, sessionKey, agentKey, payload = {}) {
    serial++;
    const sourceId = `source-${provider}`;
    const timestamp = new Date(Date.now() + serial).toISOString();
    const event = {
      schemaVersion: '1.0', eventId: `synthetic-${serial}`, sourceId, sourceEventId: `synthetic-${serial}`,
      sourceVersion: 'fixture-1', type, observedAt: timestamp, receivedAt: timestamp,
      ...(type === 'source.unavailable' ? {} : { projectId: 'p3', provider, sessionKey }),
      ...(agentKey ? { agentKey } : {}),
      provenance: 'observed', ingestionMode: 'live', payload, evidenceRefs: []
    };
    store.apply(event, { sourceId, fileKey: `${sourceId}.jsonl`, generation: 0, offset: serial });
  }
  function main(provider, suffix, state = 'working') {
    const s = `session-${suffix}`, a = `agent-${suffix}`;
    apply('session.observed', provider, s, undefined);
    apply('agent.observed', provider, s, a);
    if (state !== 'observed') {
      apply(state === 'waiting' ? 'session.waiting' : 'session.working', provider, s, undefined);
      apply(state === 'waiting' ? 'agent.waiting' : 'agent.working', provider, s, a);
    }
    return { s, a };
  }
  if (scenario !== 'empty') {
    const state = scenario === 'waiting' ? 'waiting' : 'working';
    const codex = main('codex', 'codex', state);
    const claude = main('claude', 'claude', state);
    const childAgent = 'agent-child';
    apply('session.observed', 'codex', 'session-child', undefined);
    apply('agent.observed', 'codex', 'session-child', childAgent, { parentAgentKey: codex.a });
    apply(state === 'waiting' ? 'session.waiting' : 'session.working', 'codex', 'session-child', undefined);
    apply(state === 'waiting' ? 'agent.waiting' : 'agent.working', 'codex', 'session-child', childAgent);
    apply('task.working', 'codex', 'session-child', childAgent, { taskId: 'task-child', title: 'Tarefa sintética' });
    apply('tool.failed', 'codex', 'session-child', childAgent, { invocationId: 'tool-child', name: 'Ferramenta sintética' });
    apply('skill.observed', 'claude', claude.s, claude.a, { invocationId: 'skill-claude', name: 'Skill sintética' });
    if (scenario === 'unknown') {
      apply('source.unavailable', 'codex', undefined, undefined, { reason: 'source_lost' });
      apply('source.unavailable', 'claude', undefined, undefined, { reason: 'source_lost' });
    }
    if (scenario === 'ended') {
      apply('session.ended', 'codex', codex.s, undefined);
      apply('session.ended', 'claude', claude.s, undefined);
      apply('session.ended', 'codex', 'session-child', undefined);
    }
    if (scenario === 'overflow')
      for (let i = 0; i < 11; i++) main('codex', `extra-${i}`);
  }
  const before = store.snapshot();
  const token = randomBytes(32).toString('hex');
  const started = await startReadOnlyServer(store, token);
  server = started.server;
  const outcome = new Promise(resolve => {
    child = spawn(player, ['-screen-width', '1280', '-screen-height', '720', '-logFile', '-'], {
      env: { ...process.env, WR3D_SERVICE_URL: started.url, WR3D_SERVICE_TOKEN: token,
        WR3D_VALIDATION_CAPTURE_DIR: captureDir, WR3D_VALIDATION_CAPTURE_NAME: name,
        WR3D_VALIDATION_VIEW: selected.view, WR3D_VALIDATION_PROJECT_ID: 'p3',
        WR3D_VALIDATION_AGENT_KEY: 'agent-child' }, stdio: 'ignore'
    });
    child.on('error', error => resolve({ kind: 'spawn_error', code: error.code }));
    child.on('exit', (code, signal) => resolve({ kind: 'exit', code, signal }));
    timer = setTimeout(() => resolve({ kind: 'timeout' }), 45000);
  });
  const status = await outcome;
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const result = { scenario, status, sourceSessions: before.sessions.length, sourceAgents: before.agents.length,
    linkedChildren: before.agents.filter(item => item.parentStatus === 'vinculado').length,
    imageExists: existsSync(imagePath), report };
  console.log(JSON.stringify(result));
  if (status.kind !== 'exit' || status.code !== 0 || !result.imageExists || !report?.connected ||
      report.view !== selected.view || report.avatarCount !== selected.expected ||
      ((scenario === 'child' || scenario === 'childFocus') &&
        (report.selectedAgentKey !== 'agent-child' || !report.parentLinkVisible)) ||
      report.groupedAgentCount !== (selected.grouped ?? 0)) process.exitCode = 1;
} finally {
  if (timer) clearTimeout(timer);
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 3000); });
  }
  if (server) await new Promise(resolve => server.close(resolve));
  store.close();
}
