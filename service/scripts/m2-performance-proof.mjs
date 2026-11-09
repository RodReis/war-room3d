import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import { performanceGate } from './m2-performance-gate.mjs';

const seconds = Number(process.argv[2] ?? 600);
if (!Number.isSafeInteger(seconds) || seconds < 5 || seconds > 600)
  throw new Error('Duração de carga deve estar entre 5 e 600 segundos');
const referenceProfile = process.env.WR3D_REFERENCE_PROFILE;
if (referenceProfile && !['visual', 'reduced', 'sector'].includes(referenceProfile))
  throw new Error('WR3D_REFERENCE_PROFILE deve ser visual, reduced ou sector');
const referenceProjectId = referenceProfile ? 'reference-lab' : 'p1';
const frameTargetMs = referenceProfile === 'reduced' ? 33.33 : 16.67;
const captureDir = process.env.WR3D_CAPTURE_DIR ?? fileURLToPath(new URL('../../unity/Builds/WarRoom3D-M2-Live/capture/', import.meta.url));
const name = `performance-${seconds}s-${Date.now()}`;
const artifact = extension => path.join(captureDir, `${name}.${extension}`);
const executable = process.env.WR3D_PLAYER_PATH ?? fileURLToPath(new URL('../../unity/Builds/WarRoom3D-M2-Live/WarRoom3D.exe', import.meta.url));
if (!existsSync(executable)) throw new Error('Player Windows não encontrado');
const startSignal = process.env.WR3D_VALIDATION_START_SIGNAL;
if (startSignal && existsSync(startSignal)) throw new Error('Sinal de início já existe; use arquivo novo');
const projects = referenceProfile ? Array.from({ length: 30 }, (_, index) => ({
  projectId: index === 2 ? referenceProjectId : `reference-project-${String(index + 1).padStart(2, '0')}`,
  name: index === 2 ? 'LAB #35 · SINTÉTICO' : `Projeto sintético ${index + 1}`,
  canonicalPath: `C:/Synthetic/reference-${index + 1}`
})) : [{ projectId: 'p1', name: 'Projeto sintético', canonicalPath: 'C:/Synthetic/p1' }];
const resources = referenceProfile ? Array.from({ length: 200 }, (_, index) => ({
  resourceId: index === 0 ? 'synthetic-api' : `resource-${String(index + 1).padStart(3, '0')}`,
  environmentId: 'local', kind: 'api', name: `API sintética ${index + 1}`,
  sourceId: 'synthetic-source', staleAfterMs: 900000
})) : [{ resourceId: 'synthetic-api', environmentId: 'local', kind: 'api', name: 'API sintética',
  sourceId: 'synthetic-source', staleAfterMs: 120000 }];
const store = new EventStore(':memory:');
let server;
let child;
let childExit;
let lastReadingTimeMs = 0;

function nextReadingAt() {
  lastReadingTimeMs = Math.max(Date.now(), lastReadingTimeMs + 1);
  return new Date(lastReadingTimeMs).toISOString();
}

function percentile(sorted, fraction) {
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

try {
  store.registerProjectsAndReplaceInventory(
    projects,
    { schemaVersion: '1.0', environments: [{ environmentId: 'local', name: 'Ambiente local' }],
      resources,
      projectResources: resources.map((resource, index) => ({ projectId: projects[index === 0 && referenceProfile ? 2 : index % projects.length].projectId,
        resourceId: resource.resourceId, origin: 'configured', confidence: 'unverified' })),
      dependencies: [] });
  const firstAt = new Date().toISOString();
  for (const resource of resources)
    store.infrastructure.recordReading({ resourceId: resource.resourceId, sourceId: 'synthetic-source', sourceVersion: '1',
      health: 'saudavel', observedAt: firstAt, evidenceRef: 'synthetic-baseline' }, firstAt);
  if (referenceProfile) {
    let serial = 0;
    for (let index = 0; index < 50; index++) {
      const project = index < 12 ? projects[2] : projects[3 + (index - 12) % 27];
      const provider = index % 2 ? 'claude' : 'codex';
      const sourceId = `synthetic-${provider}`;
      const sessionKey = `load-session-${index + 1}`;
      const agentKey = `load-agent-${index + 1}`;
      for (const type of ['session.observed', 'agent.observed']) {
        const number = ++serial;
        const at = new Date(Date.now() + number).toISOString();
        const event = { schemaVersion: '1.0', eventId: `load-event-${number}`, sourceId,
          sourceEventId: `load-native-${number}`, sourceVersion: 'synthetic-35', type,
          observedAt: at, receivedAt: at, projectId: project.projectId, provider, sessionKey,
          ...(type === 'agent.observed' ? { agentKey } : {}), provenance: 'observed',
          ingestionMode: 'live', payload: {}, evidenceRefs: [] };
        if (!store.apply(event, { sourceId, fileKey: `load-${provider}`, generation: 0, offset: number }).applied)
          throw new Error(`Agente de carga rejeitado: ${number}`);
      }
    }
  }
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
        WR3D_VALIDATION_VIEW: referenceProfile === 'reduced' ? 'room-reduced' : referenceProfile === 'visual' ? 'room' : 'center',
        WR3D_VALIDATION_PROJECT_ID: referenceProfile ? referenceProjectId : '',
        WR3D_VALIDATION_DURATION_SECONDS: String(seconds + (referenceProfile ? 60 : 5)) },
      stdio: 'ignore'
    });
    child.on('error', error => resolve({ event: 'spawn_error', code: error.code }));
    child.on('exit', (code, signal) => resolve({ event: 'exit', code, signal }));
  });
  const readyDeadline = performance.now() + (startSignal ? 210000 : 180000);
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
    const now = nextReadingAt();
    const applied = store.infrastructure.recordReading({ resourceId: 'synthetic-api', sourceId: 'synthetic-source',
      sourceVersion: '1', health: index % 2 === 0 ? 'degradado' : 'saudavel', observedAt: now,
      evidenceRef: `synthetic-${index + 1}` }, now);
    if (!applied) throw new Error('Leitura sintética não foi aceita pelo serviço');
    const sequence = store.changeWindow(0, 1).current;
    accepted.push({ sequence, acceptedUtcUnixMs: Date.now(), phase: 'steady' });
    maxClockDriftMs = Math.max(maxClockDriftMs,
      Math.abs(Date.now() - startWall - (performance.now() - startMonotonic)));
    if ((index + 1) % 600 === 0)
      console.log(JSON.stringify({ progressSeconds: (index + 1) / 10, accepted: index + 1, planned }));
  }
  let burstEvents = 0;
  let burstMaxScheduleLagMs = 0;
  let burstDurationMs = 0;
  if (referenceProfile) {
    const burstStart = performance.now();
    for (let index = 0; index < 1000; index++) {
      const due = burstStart + index * 10;
      await pause(Math.max(0, due - performance.now()));
      burstMaxScheduleLagMs = Math.max(burstMaxScheduleLagMs, Math.max(0, performance.now() - due));
      const now = nextReadingAt();
      const applied = store.infrastructure.recordReading({ resourceId: 'synthetic-api', sourceId: 'synthetic-source',
        sourceVersion: '1', health: index % 2 === 0 ? 'degradado' : 'saudavel', observedAt: now,
        evidenceRef: `synthetic-burst-${index + 1}` }, now);
      if (!applied) throw new Error('Rajada sintética rejeitada');
      const sequence = store.changeWindow(0, 1).current;
      accepted.push({ sequence, acceptedUtcUnixMs: Date.now(), phase: 'burst' });
      burstEvents++;
    }
    burstDurationMs = performance.now() - burstStart;
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
  if (!existsSync(artifact('json')) || !existsSync(artifact('trace.jsonl')))
    throw new Error(`Player saiu sem relatório/trace após ${seconds}s: ${JSON.stringify(status)}`);
  const report = JSON.parse(readFileSync(artifact('json'), 'utf8'));
  const trace = readFileSync(artifact('trace.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  let maxRenderGapMs = 0;
  for (let index = 1; index < trace.length; index++)
    maxRenderGapMs = Math.max(maxRenderGapMs, trace[index].utcUnixMs - trace[index - 1].utcUnixMs);
  const latencies = [];
  const burstLatencies = [];
  let traceIndex = 0;
  // A later snapshot covers the sequence, but intermediate resource states can be coalesced.
  for (const event of accepted) {
    while (traceIndex < trace.length && trace[traceIndex].sequence < event.sequence) traceIndex++;
    if (traceIndex >= trace.length) break;
    (event.phase === 'burst' ? burstLatencies : latencies).push(trace[traceIndex].utcUnixMs - event.acceptedUtcUnixMs);
  }
  latencies.sort((a, b) => a - b);
  burstLatencies.sort((a, b) => a - b);
  const summary = {
    mode: 'synthetic-local', referenceProfile: referenceProfile ?? null,
    view: report.view, durationSeconds: seconds, resolution: [report.imageWidth, report.imageHeight],
    baseline: { projects: projects.length, visibleRooms: 6, agents: referenceProfile ? 50 : 0,
      resources: resources.length, burstEvents, burstDurationMs, burstMaxScheduleLagMs,
      burstCoveredEvents: burstLatencies.length, burstLatencyP95Ms: burstLatencies.length ? percentile(burstLatencies, 0.95) : null },
    coverageDefinition: 'first end-of-frame HUD snapshot with sequence at or beyond the accepted event',
    frameMeasurement: 'Unity Time.unscaledDeltaTime; not presented-display FPS',
    plannedEvents: planned + burstEvents, acceptedEvents: accepted.length,
    sequenceCoveredEvents: latencies.length + burstLatencies.length,
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
    frameIntervalP95Within16_67Ms: report.p95FrameMs <= 16.67,
    frameTargetMs, frameIntervalP95WithinTargetMs: report.p95FrameMs <= frameTargetMs,
    validity: { allSequencesCovered: latencies.length === planned && burstLatencies.length === burstEvents,
      burstRate100PerSecond: !referenceProfile || burstEvents === 1000 && burstDurationMs <= 11000,
      clockStable: maxClockDriftMs <= 50,
      fullDuration: report.sampledDurationSeconds >= seconds, playerConnected: report.connected,
      backgroundExecutionEnabled: report.runInBackground === true,
      resolution1080p: report.imageWidth === 1920 && report.imageHeight === 1080,
      referenceRoom: !referenceProfile || report.view === (referenceProfile === 'reduced' ? 'room-reduced' :
        referenceProfile === 'visual' ? 'room' : 'center') }
  };
  writeFileSync(artifact('summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ artifact: path.basename(artifact('summary.json')), ...summary,
    latency: { ...summary.latency, samplesMs: `${latencies.length} samples in artifact` } }));
  if (!performanceGate(summary)) process.exitCode = 1;
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
