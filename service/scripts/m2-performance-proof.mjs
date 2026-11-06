import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const seconds = Number(process.argv[2] ?? 600);
if (!Number.isSafeInteger(seconds) || seconds < 5 || seconds > 600)
  throw new Error('Duração de carga deve estar entre 5 e 600 segundos');
const captureDir = process.env.WR3D_CAPTURE_DIR ?? fileURLToPath(new URL('../../unity/Builds/WarRoom3D-M2-Live/capture/', import.meta.url));
const name = `performance-${seconds}s-${Date.now()}`;
const artifact = extension => path.join(captureDir, `${name}.${extension}`);
const executable = process.env.WR3D_PLAYER_PATH ?? fileURLToPath(new URL('../../unity/Builds/WarRoom3D-M2-Live/WarRoom3D.exe', import.meta.url));
if (!existsSync(executable)) throw new Error('Player Windows não encontrado');
const store = new EventStore(':memory:');
let server;
let child;
let childExit;

function percentile(sorted, fraction) {
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

try {
  store.registerProjectsAndReplaceInventory(
    [{ projectId: 'p1', name: 'Projeto sintético', canonicalPath: 'C:/Synthetic/p1' }],
    { schemaVersion: '1.0', environments: [{ environmentId: 'local', name: 'Ambiente local' }],
      resources: [{ resourceId: 'synthetic-api', environmentId: 'local', kind: 'api', name: 'API sintética',
        sourceId: 'synthetic-source', staleAfterMs: 120000 }],
      projectResources: [{ projectId: 'p1', resourceId: 'synthetic-api', origin: 'configured', confidence: 'unverified' }],
      dependencies: [] });
  const firstAt = new Date().toISOString();
  store.infrastructure.recordReading({ resourceId: 'synthetic-api', sourceId: 'synthetic-source', sourceVersion: '1',
    health: 'saudavel', observedAt: firstAt, evidenceRef: 'synthetic-baseline' }, firstAt);
  const token = randomBytes(32).toString('hex');
  const live = await startReadOnlyServer(store, token);
  server = live.server;
  let snapshotRequests = 0;
  let eventRequests = 0;
  server.on('request', request => {
    if (request.url === '/v1/snapshot') snapshotRequests++;
    if (request.url === '/v1/events') eventRequests++;
  });
  childExit = new Promise(resolve => {
    child = spawn(executable, ['-screen-width', '1920', '-screen-height', '1080', '-screen-fullscreen', '0',
      '-logFile', artifact('player.log')], {
      env: { ...process.env, WR3D_SERVICE_URL: live.url, WR3D_SERVICE_TOKEN: token,
        WR3D_VALIDATION_CAPTURE_DIR: captureDir, WR3D_VALIDATION_CAPTURE_NAME: name,
        WR3D_VALIDATION_VIEW: 'center', WR3D_VALIDATION_DURATION_SECONDS: String(seconds + 5) },
      stdio: 'ignore'
    });
    child.on('error', error => resolve({ event: 'spawn_error', code: error.code }));
    child.on('exit', (code, signal) => resolve({ event: 'exit', code, signal }));
  });
  const readyDeadline = performance.now() + 30000;
  while (!existsSync(artifact('ready')) && performance.now() < readyDeadline) {
    if (child.exitCode !== null) throw new Error('Player encerrou antes de iniciar a medição');
    await pause(100);
  }
  if (!existsSync(artifact('ready'))) throw new Error('Player não sinalizou início da medição');

  const accepted = [];
  const planned = seconds * 10;
  const startMonotonic = performance.now();
  const startWall = Date.now();
  let maxClockDriftMs = 0;
  let maxScheduleLagMs = 0;
  for (let index = 0; index < planned; index++) {
    const due = startMonotonic + index * 100;
    await pause(Math.max(0, due - performance.now()));
    maxScheduleLagMs = Math.max(maxScheduleLagMs, Math.max(0, performance.now() - due));
    const now = new Date().toISOString();
    const applied = store.infrastructure.recordReading({ resourceId: 'synthetic-api', sourceId: 'synthetic-source',
      sourceVersion: '1', health: index % 2 === 0 ? 'degradado' : 'saudavel', observedAt: now,
      evidenceRef: `synthetic-${index + 1}` }, now);
    if (!applied) throw new Error('Leitura sintética não foi aceita pelo serviço');
    const sequence = store.changeWindow(0, 1).current;
    accepted.push({ sequence, acceptedUtcUnixMs: Date.now() });
    maxClockDriftMs = Math.max(maxClockDriftMs,
      Math.abs(Date.now() - startWall - (performance.now() - startMonotonic)));
    if ((index + 1) % 600 === 0)
      console.log(JSON.stringify({ progressSeconds: (index + 1) / 10, accepted: index + 1, planned }));
  }
  const timeout = Symbol('timeout');
  let timeoutId;
  const status = await Promise.race([childExit, new Promise(resolve => {
    timeoutId = setTimeout(() => resolve(timeout), 60000);
  })]);
  clearTimeout(timeoutId);
  if (status === timeout || status.event !== 'exit' || status.code !== 0)
    throw new Error(`Player não concluiu a captura: ${status === timeout ? 'timeout' : JSON.stringify(status)}`);
  writeFileSync(artifact('accepted.jsonl'), accepted.map(event => JSON.stringify(event)).join('\n') + '\n');
  const report = JSON.parse(readFileSync(artifact('json'), 'utf8'));
  const trace = readFileSync(artifact('trace.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  let maxRenderGapMs = 0;
  for (let index = 1; index < trace.length; index++)
    maxRenderGapMs = Math.max(maxRenderGapMs, trace[index].utcUnixMs - trace[index - 1].utcUnixMs);
  const latencies = [];
  let traceIndex = 0;
  // A later snapshot covers the sequence, but intermediate resource states can be coalesced.
  for (const event of accepted) {
    while (traceIndex < trace.length && trace[traceIndex].sequence < event.sequence) traceIndex++;
    if (traceIndex >= trace.length) break;
    latencies.push(trace[traceIndex].utcUnixMs - event.acceptedUtcUnixMs);
  }
  latencies.sort((a, b) => a - b);
  const summary = {
    mode: 'synthetic-local', durationSeconds: seconds, resolution: [report.imageWidth, report.imageHeight],
    coverageDefinition: 'first end-of-frame HUD snapshot with sequence at or beyond the accepted event',
    frameMeasurement: 'Unity Time.unscaledDeltaTime; not presented-display FPS',
    plannedEvents: planned, acceptedEvents: accepted.length, sequenceCoveredEvents: latencies.length,
    snapshotRequests, eventRequests, renderTraceCount: trace.length, maxRenderGapMs,
    disconnectCount: report.disconnectCount,
    maxClockDriftMs, maxScheduleLagMs, frame: {
      sampledFrames: report.sampledFrames, sampledDurationSeconds: report.sampledDurationSeconds,
      meanMs: report.meanFrameMs, p95Ms: report.p95FrameMs, maxMs: report.maxFrameMs,
      framesOver16Ms: report.framesOver16Ms, framesOver33Ms: report.framesOver33Ms,
      framesOver100Ms: report.framesOver100Ms, vSyncCount: report.vSyncCount,
      targetFrameRate: report.targetFrameRate, runInBackground: report.runInBackground
    }, latency: { p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95),
      p99Ms: percentile(latencies, 0.99), maxMs: latencies.at(-1),
      over2s: latencies.filter(milliseconds => milliseconds > 2000).length, samplesMs: latencies },
    sequenceCoverageP95Within2s: percentile(latencies, 0.95) <= 2000,
    frameIntervalP95Within16_67Ms: report.p95FrameMs <= 1000 / 60,
    validity: { allSequencesCovered: latencies.length === planned, clockStable: maxClockDriftMs <= 50,
      fullDuration: report.sampledDurationSeconds >= seconds, playerConnected: report.connected,
      backgroundExecutionEnabled: report.runInBackground === true,
      resolution1080p: report.imageWidth === 1920 && report.imageHeight === 1080 }
  };
  writeFileSync(artifact('summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ artifact: path.basename(artifact('summary.json')), ...summary,
    latency: { ...summary.latency, samplesMs: `${latencies.length} samples in artifact` } }));
  if (Object.values(summary.validity).some(value => !value)) process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    let killTimeoutId;
    await Promise.race([childExit, new Promise(resolve => {
      killTimeoutId = setTimeout(resolve, 3000);
    })]);
    clearTimeout(killTimeoutId);
  }
  if (server) {
    const closing = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await closing;
  }
  store.close();
}
