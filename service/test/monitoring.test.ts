import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import { configureMonitoring } from '../src/infra/monitoring.ts';
import { startDockerSnapshotProxy, type DockerEngineReader } from '../src/infra/connectors/docker-proxy.ts';

const inventory = JSON.parse(readFileSync(new URL('../../contracts/fixtures/m2/shared-infrastructure.v1.json', import.meta.url), 'utf8'));
const projects = [1, 2, 3].map(number => ({ projectId: `p${number}`, name: `Projeto ${number}`, canonicalPath: `C:\\Projects\\p${number}` }));
const token = 'token-sintetico-com-trinta-e-dois-bytes';
type MonitorSnapshot = { sessions: unknown[]; resourceStates: { resourceId: string; health: string; coverage: string }[] };

test('configuração local liga coleta HTTP ao snapshot sem sessões e mantém impacto exato', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-monitoring-'));
  const store = new EventStore(path.join(directory, 'state.db'));
  let status = 503;
  const source = http.createServer((_request, response) => response.writeHead(status).end());
  await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve));
  const sourceAddress = source.address();
  if (!sourceAddress || typeof sourceAddress === 'string') throw new Error('Porta sintética inválida');
  t.after(async () => {
    await new Promise<void>(resolve => source.close(() => resolve()));
    store.close();
    if (!path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`)) throw new Error('Alvo temporário inválido');
    rmSync(directory, { recursive: true, force: true });
  });
  const config = {
    schemaVersion: '1.0', projects, inventory, intervalMs: 1000, timeoutMs: 1000, m5NetworkSignals:true, m5NetworkRetentionDays:14,
    m5Rules:[{ruleId:'http-degraded',version:1,category:'network',field:'health',operator:'eq',expectedValue:'degradado',severity:'medium',enabled:true}],
    probes: [{ kind: 'api', resourceId: 'api-lab', url: `http://127.0.0.1:${sourceAddress.port}/health` }]
  };
  const { runner } = configureMonitoring(store, config);
  assert.deepEqual(await runner.collectOnce(), { collected: ['api-lab'], failed: [] });
  assert.equal(store.operations.coverage('lab','network'),'covered');
  const network=store.operations.query({environmentId:'lab',category:'network',resourceId:'api-lab'});
  assert.equal(network.items[0]?.fields.health,'degradado');
  assert.equal(network.items[0]?.evidenceRef,'http-status-503');
  assert.equal(store.operations.incidents('lab')[0]?.status,'open');
  status=401;
  assert.deepEqual(await runner.collectOnce(),{collected:[],failed:['api-lab']});
  assert.equal(store.operations.coverage('lab','network'),'unavailable');
  assert.equal(store.operations.incidents('lab')[0]?.status,'open');
  status=200;
  assert.deepEqual(await runner.collectOnce(),{collected:['api-lab'],failed:[]});
  assert.equal(store.operations.coverage('lab','network'),'covered');
  assert.equal(store.operations.incidents('lab')[0]?.status,'open');
  status=503;
  assert.deepEqual(await runner.collectOnce(),{collected:['api-lab'],failed:[]});
  const first = store.snapshot();
  assert.equal((first.sessions as unknown[]).length, 0);
  assert.deepEqual((first.incidents as { projectIds: string[] }[])[0].projectIds, ['p1', 'p2']);
  const { server, url } = await startReadOnlyServer(store, token);
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const response = await fetch(`${url}/v1/snapshot`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const snapshot = await response.json() as { incidents: { projectIds: string[] }[] };
  assert.deepEqual(snapshot.incidents[0].projectIds, ['p1', 'p2']);
  status = 200;
  assert.deepEqual(await runner.collectOnce(), { collected: ['api-lab'], failed: [] });
  assert.equal((store.snapshot().incidents as unknown[]).length, 0);
});

test('configuração recusa sonda fora do inventário antes de cadastrar projetos', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-monitoring-'));
  const store = new EventStore(path.join(directory, 'state.db'));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const config = {
    schemaVersion: '1.0', projects, inventory, intervalMs: 1000, timeoutMs: 1000,
    probes: [{ kind: 'docker', resourceId: 'api-lab', url: 'http://127.0.0.1:12345/v1/snapshot' }]
  };
  assert.throws(() => configureMonitoring(store, config), /Sonda não autorizada/);
  assert.deepEqual(store.snapshot().projects, []);
  assert.deepEqual(store.snapshot().resources, []);
  assert.throws(() => configureMonitoring(store, {
    ...config, projects: [{ ...projects[0], name: 'X'.repeat(81) }, projects[1], projects[2]],
    probes: [{ kind: 'api', resourceId: 'api-lab', url: 'http://127.0.0.1:12345/health' }]
  }), /Projeto de monitoração inválido/);
  assert.deepEqual(store.snapshot().projects, []);
});

test('fonte Docker M5 exige proxy local válido antes de alterar inventário',t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'war-room3d-monitoring-docker-'));
  const store=new EventStore(path.join(directory,'state.db'));
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  const config={schemaVersion:'1.0',projects,inventory,intervalMs:1000,timeoutMs:1000,
    probes:[{kind:'api',resourceId:'api-lab',url:'http://127.0.0.1:12345/health'}],
    m5DockerLogs:{enabled:true,composeProject:'contaia',composeWorkingDir:'C:\\Desenv\\Projetos\\rrb-contaia\\infra\\docker',service:'api',
      environmentId:'lab',resourceId:'api-lab',retentionDays:1,initialLookbackMinutes:10,intervalMs:60000}};
  assert.throws(()=>configureMonitoring(store,config),/sem proxy Docker/);
  assert.throws(()=>configureMonitoring(store,config,{dockerLogsProxy:{url:'http://example.invalid/v1/logs',token:'x'.repeat(64)}}),/loopback/);
  assert.deepEqual(store.snapshot().projects,[]);
  assert.deepEqual(store.snapshot().resources,[]);
  const configured=configureMonitoring(store,config,{dockerLogsProxy:{url:'http://127.0.0.1:12345/v1/logs',token:'x'.repeat(64)}});
  assert.ok(configured.dockerLogs);
  assert.equal(store.operations.sources('lab').find(source=>source.sourceId===configured.dockerLogs!.sourceId)?.coverage.log,'no_data');
});

test('monitoração Docker coleta estados sucessivos pelo proxy sintético sem sessões', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-monitoring-docker-'));
  const store = new EventStore(path.join(directory, 'state.db'));
  const scope = { composeProject: 'laboratorio', composeWorkingDir: 'C:\\Projetos\\laboratorio' };
  let state = 'running';
  let health = 'healthy';
  const engine: DockerEngineReader = { async get() { return [{
    Names: ['/api-lab'], State: state, Health: { Status: health },
    Labels: { 'com.docker.compose.project': scope.composeProject,
      'com.docker.compose.project.working_dir': scope.composeWorkingDir }
  }]; } };
  const { server, url } = await startDockerSnapshotProxy(engine, scope, token);
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const dockerInventory = { ...inventory, resources: [...inventory.resources, {
    resourceId: 'docker-lab', environmentId: 'lab', kind: 'docker', name: 'Contêiner sintético',
    sourceId: 'docker-proxy', staleAfterMs: 60000
  }] };
  const config = { schemaVersion: '1.0', projects, inventory: dockerInventory, intervalMs: 1000, timeoutMs: 1000,
    probes: [{ kind: 'docker', resourceId: 'docker-lab', containerName: 'api-lab', proxyUrl: url }] };
  assert.throws(() => configureMonitoring(store, config), /Configuração do conector Docker inválida/);
  assert.deepEqual(store.snapshot().projects, []);
  assert.throws(() => configureMonitoring(store, { ...config, probes: [{ ...config.probes[0], token }] },
    { dockerToken: token }), /Sonda não autorizada/);
  assert.deepEqual(store.snapshot().projects, []);
  assert.throws(() => configureMonitoring(store, { ...config, probes: [{ ...config.probes[0],
    proxyUrl: 'http://example.invalid/v1/snapshot' }] }, { dockerToken: token }), /Configuração do conector Docker inválida/);
  assert.deepEqual(store.snapshot().projects, []);
  const { runner } = configureMonitoring(store, config, { dockerToken: token });
  const dockerState = () => (store.snapshot().resourceStates as MonitorSnapshot['resourceStates'])
    .filter(item => item.resourceId === 'docker-lab');
  assert.deepEqual(await runner.collectOnce(), { collected: ['docker-lab'], failed: [] });
  assert.deepEqual(store.snapshot().sessions, []);
  assert.deepEqual(dockerState().map(item => [item.health, item.coverage]), [['saudavel', 'atual']]);
  state = 'exited'; health = 'none';
  runner.start(1000);
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && dockerState()[0]?.health !== 'indisponivel')
    await new Promise(resolve => setTimeout(resolve, 25));
  await runner.stop();
  assert.deepEqual(dockerState().map(item => [item.health, item.coverage]), [['indisponivel', 'atual']]);
  assert.deepEqual(store.snapshot().sessions, []);
  server.close();
  assert.deepEqual(await runner.collectOnce(), { collected: [], failed: ['docker-lab'] });
  assert.deepEqual(dockerState().map(item => item.coverage), ['perdida']);
});

test('caminho novo em projeto existente falha antes de cadastrar outros projetos', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-monitoring-'));
  const store = new EventStore(path.join(directory, 'state.db'));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  store.registerProject(projects[0]);
  assert.throws(() => configureMonitoring(store, {
    schemaVersion: '1.0', projects: [{ ...projects[0], aliases: ['C:\\Projects\\unregistered'] }, projects[1], projects[2]],
    inventory, intervalMs: 1000, timeoutMs: 1000,
    probes: [{ kind: 'api', resourceId: 'api-lab', url: 'http://127.0.0.1:12345/health' }]
  }), /Caminho de projeto existente/);
  assert.deepEqual(store.snapshot().projects, [{ projectId: 'p1', name: 'Projeto 1' }]);
  assert.deepEqual(store.snapshot().resources, []);
});

test('inventário incompatível reverte projeto, sala e eventos da mesma configuração', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-monitoring-'));
  const store = new EventStore(path.join(directory, 'state.db'));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  for (const project of projects) store.registerProject(project);
  store.infrastructure.replaceInventory(inventory);
  const before = store.snapshot();
  const incompatible = { ...inventory, resources: inventory.resources.map((resource: { resourceId: string }) =>
    resource.resourceId === 'db-homolog' ? { ...resource, environmentId: 'lab' } : resource) };
  assert.throws(() => configureMonitoring(store, {
    schemaVersion: '1.0', projects: [...projects, { projectId: 'p4', name: 'Projeto 4', canonicalPath: 'C:\\Projects\\p4' }],
    inventory: incompatible, intervalMs: 1000, timeoutMs: 1000,
    probes: [{ kind: 'api', resourceId: 'api-lab', url: 'http://127.0.0.1:12345/health' }]
  }), /Identidade de recurso não pode mudar de ambiente/);
  assert.deepEqual(store.snapshot(), before);
});

test('processo standalone inicia coleta real do host local e serve snapshot sem agentes', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-monitoring-main-'));
  const config = JSON.parse(readFileSync(new URL('../examples/monitoring.example.json', import.meta.url), 'utf8'));
  const configPath = path.join(directory, 'host.monitoring.local.json');
  writeFileSync(configPath, JSON.stringify(config));
  const listener = http.createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Porta de teste inválida');
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const mainPath = fileURLToPath(new URL('../src/http/main.ts', import.meta.url));
  const child = spawn(process.execPath, [mainPath], {
    cwd: path.dirname(path.dirname(path.dirname(mainPath))),
    env: { ...process.env, WR3D_DATABASE_PATH: path.join(directory, 'state.db'),
      WR3D_SERVICE_PORT: String(address.port), WR3D_SERVICE_TOKEN: token,
      WR3D_MONITORING_CONFIG_PATH: configPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
      child.kill();
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  const deadline = Date.now() + 10000;
  let snapshot: MonitorSnapshot | null = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Serviço encerrou antes da coleta: ${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/snapshot`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(500)
      });
      if (response.ok) {
        const current = await response.json() as MonitorSnapshot;
        if (current?.resourceStates.some(item => item.resourceId === 'host-example' && item.coverage === 'atual')) {
          snapshot = current;
          break;
        }
      }
    } catch { /* o processo ainda está iniciando */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(snapshot, `Coleta local não apareceu no snapshot: ${output}`);
  assert.deepEqual(snapshot.sessions, []);
  assert.deepEqual(snapshot.resourceStates.filter(item => item.resourceId === 'host-example').map(item => [item.health, item.coverage]),
    [['sem_dados', 'atual']]);
});
