import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { configureMonitoring } from '../src/infra/monitoring.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const scenario = process.argv[2];
const scenarios = {
  'healthy-center': { urlEnv: 'WR3D_PROOF_HEALTH_URL', resourceName: 'API de laboratório', projects: 1, linked: 1, view: 'center', expectedHealth: 'saudavel' },
  'incident-center': { urlEnv: 'WR3D_PROOF_DEGRADED_URL', resourceName: 'Serviço de laboratório', projects: 3, linked: 2, view: 'center', expectedHealth: 'degradado' },
  'incident-project': { urlEnv: 'WR3D_PROOF_DEGRADED_URL', resourceName: 'Serviço de laboratório', projects: 3, linked: 2, view: 'project', expectedHealth: 'degradado' },
  'incident-project-bottom': { urlEnv: 'WR3D_PROOF_DEGRADED_URL', resourceName: 'Serviço de laboratório', projects: 3, linked: 2, view: 'project-bottom', expectedHealth: 'degradado' },
  'no-data-center': { urlEnv: 'WR3D_PROOF_UNAVAILABLE_URL', resourceName: 'Serviço sem resposta', projects: 1, linked: 1, view: 'center', expectedHealth: 'sem_dados' }
};
const selected = scenarios[scenario];
if (!selected) throw new Error('Cenário inválido');
const sourceUrl = process.env[selected.urlEnv];
if (!sourceUrl) throw new Error(`Fonte local não configurada: ${selected.urlEnv}`);
const target = new URL(sourceUrl);
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.username || target.password || target.search || target.hash)
  throw new Error('Fonte de prova deve ser HTTP em loopback, sem credenciais ou parâmetros');
const suffix = process.argv[3] ?? '';
if (suffix && !/^[A-Za-z0-9_-]{1,20}$/.test(suffix)) throw new Error('Sufixo inválido');
const captureName = suffix ? `${scenario}-${suffix}` : scenario;

const captureDir = process.env.WR3D_CAPTURE_DIR ?? fileURLToPath(new URL('../../unity/Builds/WarRoom3D-M2-Live/capture/', import.meta.url));
const imagePath = path.join(captureDir, `${captureName}.png`);
const reportPath = path.join(captureDir, `${captureName}.json`);
if (existsSync(imagePath) || existsSync(reportPath)) throw new Error('Captura já existe; preserve a prova anterior');

const store = new EventStore(':memory:');
let server;
let child;
let timer;
let snapshots = 0;
let events = 0;
try {
  const projects = Array.from({ length: selected.projects }, (_, index) => ({
    projectId: `p${index + 1}`, name: `Projeto ${String.fromCharCode(65 + index)}`,
    canonicalPath: `C:/Synthetic/p${index + 1}`
  }));
  const config = {
    schemaVersion: '1.0', projects,
    inventory: {
      schemaVersion: '1.0', environments: [{ environmentId: 'local', name: 'Ambiente local' }],
      resources: [{ resourceId: 'http-lab', environmentId: 'local', kind: 'api', name: selected.resourceName,
        sourceId: 'http-local', staleAfterMs: 120000 }],
      projectResources: projects.slice(0, selected.linked).map(project => ({
        projectId: project.projectId, resourceId: 'http-lab', origin: 'configured', confidence: 'unverified'
      })), dependencies: []
    },
    probes: [{ kind: 'api', resourceId: 'http-lab', url: sourceUrl }], intervalMs: 5000, timeoutMs: 3000
  };
  const { runner } = configureMonitoring(store, config);
  const collection = await runner.collectOnce();
  const beforePlayer = store.snapshot();
  if (beforePlayer.resourceStates[0]?.health !== selected.expectedHealth)
    throw new Error('Fonte local não produziu o estado esperado para o cenário');
  const token = randomBytes(32).toString('hex');
  const started = await startReadOnlyServer(store, token);
  server = started.server;
  server.on('request', request => {
    if (request.url === '/v1/snapshot') snapshots++;
    if (request.url === '/v1/events') events++;
  });
  const executable = process.env.WR3D_PLAYER_PATH ?? fileURLToPath(new URL('../../unity/Builds/WarRoom3D-M2-Live/WarRoom3D.exe', import.meta.url));
  const outcome = new Promise(resolve => {
    child = spawn(executable, ['-screen-width', '1280', '-screen-height', '720', '-logFile', '-'], {
      env: { ...process.env, WR3D_SERVICE_URL: started.url, WR3D_SERVICE_TOKEN: token,
        WR3D_VALIDATION_CAPTURE_DIR: captureDir, WR3D_VALIDATION_CAPTURE_NAME: captureName,
        WR3D_VALIDATION_VIEW: selected.view }, stdio: 'ignore'
    });
    child.on('error', error => resolve({ event: 'spawn_error', code: error.code }));
    child.on('exit', (code, signal) => resolve({ event: 'exit', code, signal }));
    timer = setTimeout(() => resolve({ event: 'timeout' }), 45000);
  });
  const status = await outcome;
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const result = {
    scenario: captureName, status, collection, sourceHealth: beforePlayer.resourceStates[0]?.health,
    sourceCoverage: beforePlayer.resourceStates[0]?.coverage,
    affectedProjects: beforePlayer.incidents.map(incident => incident.projectIds),
    snapshots, events, imageExists: existsSync(imagePath), report
  };
  console.log(JSON.stringify(result));
  if (status.event !== 'exit' || status.code !== 0 || !result.imageExists || !report?.connected ||
      snapshots !== 1 || events !== 1 || report.resourceCount !== 1 || report.sessionCount !== 0 ||
      report.health !== selected.expectedHealth || report.view !== selected.view ||
      report.sampledFrames !== 120 || !(report.p95FrameMs > 0) || !(report.snapshotToHudMs > 0))
    process.exitCode = 1;
} finally {
  if (timer) clearTimeout(timer);
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 3000); });
  }
  if (server) await new Promise(resolve => server.close(resolve));
  store.close();
}
