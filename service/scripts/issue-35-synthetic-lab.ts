// Prova G2 da sala: serviço efêmero, sem credencial de comando ou fonte real.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EventStore, type NormalizedEvent } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import type { Observation } from '../src/operations/operations-store.ts';

const player = process.env.WR3D_35_PLAYER;
const output = process.env.WR3D_35_PROOF_DIR;
if (!player || !existsSync(player) || !output) throw new Error('Informe WR3D_35_PLAYER e WR3D_35_PROOF_DIR');
const resolvedOutput = path.resolve(output);
const reportPath = path.join(resolvedOutput, 'issue-35-result.json');
if (existsSync(reportPath)) throw new Error('Prova anterior existe; use diretório novo');
mkdirSync(resolvedOutput, { recursive: true });

const store = new EventStore(':memory:');
let server: Awaited<ReturnType<typeof startReadOnlyServer>>['server'] | undefined;
let child: ReturnType<typeof spawn> | undefined;
let control: ReturnType<typeof setInterval> | undefined;
try {
  const projectId = 'lab-35';
  store.registerProject({ projectId: 'lab-35-slot-1', name: 'Setor sintético 1', canonicalPath: 'C:/synthetic/lab-35-slot-1' });
  store.registerProject({ projectId: 'lab-35-slot-2', name: 'Setor sintético 2', canonicalPath: 'C:/synthetic/lab-35-slot-2' });
  store.registerProject({ projectId, name: 'LAB #35 · SINTÉTICO', canonicalPath: 'C:/synthetic/lab-35' });
  store.infrastructure.replaceInventory({ schemaVersion: '1.0',
    environments: [{ environmentId: 'env-35', name: 'Laboratório sintético' }],
    resources: [{ resourceId: 'api-35', environmentId: 'env-35', kind: 'api', name: 'API sintética',
      sourceId: 'probe-35', staleAfterMs: 600000 }],
    projectResources: [{ projectId, resourceId: 'api-35', origin: 'configured', confidence: 'confirmed' }],
    dependencies: [] });
  store.operations.registerSource({ sourceId: 'logs-35', sourceVersion: 'fixture-35', environmentId: 'env-35',
    enabled: true, permissions: ['log'], staleAfterMs: 600000, retentionDays: 1 });
  const now = Date.now();
  let serial = 0;
  function apply(type: string, provider: 'claude' | 'codex', sessionKey: string, agentKey?: string,
    payload: NormalizedEvent['payload'] = {}) {
    const n = ++serial;
    const instant = new Date(now + n).toISOString();
    const sourceId = `source-${provider}`;
    const event: NormalizedEvent = { schemaVersion: '1.0', eventId: `event-35-${n}`, sourceId,
      sourceEventId: `native-35-${n}`, sourceVersion: 'fixture-35', type, observedAt: instant,
      receivedAt: instant, projectId, provider, sessionKey, ...(agentKey ? { agentKey } : {}),
      provenance: 'observed', ingestionMode: 'live', payload, evidenceRefs: [`fixture-35-event-${n}`] };
    const applied = store.apply(event, { sourceId, fileKey: `fixture-${provider}`, generation: 0, offset: n });
    if (!applied.applied) throw new Error(`Evento sintético rejeitado: ${type} ${applied.reason}`);
  }
  apply('session.observed', 'codex', 'session-parent');
  apply('agent.observed', 'codex', 'session-parent', 'agent-parent');
  apply('session.working', 'codex', 'session-parent');
  apply('session.observed', 'codex', 'session-child');
  apply('agent.observed', 'codex', 'session-child', 'agent-child', { parentAgentKey: 'agent-parent' });
  apply('session.working', 'codex', 'session-child');
  apply('task.working', 'codex', 'session-child', 'agent-child', { taskId: 'task-35', title: 'Revisar resposta sintética' });
  apply('tool.observed', 'codex', 'session-child', 'agent-child', { invocationId: 'tool-35', name: 'Read' });
  apply('skill.observed', 'codex', 'session-child', 'agent-child', { invocationId: 'skill-35', name: 'review' });
  apply('session.observed', 'claude', 'session-claude');
  apply('agent.observed', 'claude', 'session-claude', 'agent-claude');
  apply('session.waiting', 'claude', 'session-claude');
  const observedAt = new Date(now + 100).toISOString();
  for (const [messageId, role, content] of [
    ['message-user', 'user', 'Pedido sintético: revisar estado.'],
    ['message-assistant', 'assistant', 'Resposta sintética: revisão observada.']
  ] as const) {
    store.conversations.record({ messageId, projectId, sessionKey: 'session-child', sourceId: 'source-codex',
      provider: 'codex', role, content, observedAt, receivedAt: observedAt, nativeRef: messageId,
      turnRef: 'turn-35', consentRef: 'synthetic-35', retentionDays: 1, truncated: false });
  }
  const observation: Observation = { schemaVersion: '1.0', observationId: 'log-35', sourceId: 'logs-35',
    sourceVersion: 'fixture-35', environmentId: 'env-35', resourceId: 'api-35', observedAt,
    receivedAt: observedAt, category: 'log', classification: 'synthetic_api_log', confidence: 'observed',
    evidenceRef: 'fixture://35/log-35', coverage: 'covered', correlation: { requestId: 'request-35' },
    fields: { severity: 'info', message: 'LAB #35 SINTÉTICO · token=synthetic-canary' } };
  store.operations.record(observation);
  const token = randomBytes(32).toString('hex');
  const live = await startReadOnlyServer(store, token, 0); server = live.server;
  let sourceLost = false;
  let sourceRecovered = false;
  control = setInterval(() => {
    if (!sourceLost && existsSync(path.join(resolvedOutput, 'source-loss.request'))) {
      apply('source.unavailable', 'codex', 'session-child', undefined, { reason: 'source_lost' });
      sourceLost = true;
      writeFileSync(path.join(resolvedOutput, 'source-loss.done'), '1');
    }
    if (sourceLost && !sourceRecovered && existsSync(path.join(resolvedOutput, 'source-recovery.request'))) {
      apply('source.recovered', 'codex', 'session-child', undefined, { reason: 'source_recovered' });
      sourceRecovered = true;
      writeFileSync(path.join(resolvedOutput, 'source-recovery.done'), '1');
    }
  }, 100);
  const outcome = await new Promise<{ code?: number; error?: string }>(resolve => {
    child = spawn(player, ['-screen-width', '1280', '-screen-height', '720', '-screen-fullscreen', '0',
      '-logFile', path.join(resolvedOutput, 'player.log')], {
      env: { ...process.env, WR3D_SERVICE_URL: live.url, WR3D_SERVICE_TOKEN: token,
        WR3D_35_PROOF_DIR: resolvedOutput, WR3D_COMMAND_TOKEN: '' }, stdio: 'ignore' });
    const timeout = setTimeout(() => { child?.kill(); resolve({ error: 'timeout' }); }, 60000);
    child.once('exit', code => { clearTimeout(timeout); resolve({ code: code ?? -1 }); });
    child.once('error', error => { clearTimeout(timeout); resolve({ error: error.message }); });
  });
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const result = { playerExit: outcome.code, playerError: outcome.error, report, sourceLost,
    sourceRecovered, output: resolvedOutput };
  console.log(JSON.stringify(result));
  if (outcome.code !== 0 || report?.status !== 'pass') process.exitCode = 1;
} finally {
  if (control) clearInterval(control);
  if (child && child.exitCode === null) child.kill();
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
  store.close();
}
