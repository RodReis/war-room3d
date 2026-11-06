import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { collectDockerSnapshot, startDockerSnapshotProxy, type DockerEngineReader, type DockerScope } from '../src/infra/connectors/docker-proxy.ts';
import { dockerContainerProbe } from '../src/infra/connectors/docker.ts';

const scope: DockerScope = { composeProject: 'laboratorio', composeWorkingDir: 'C:\\Projetos\\laboratorio' };
const at = '2026-11-06T16:00:00.000Z';
const row = (name: string, state: string, health: string, workingDir = scope.composeWorkingDir) => ({
  Names: [`/${name}`], State: state, Health: { Status: health },
  Labels: { 'com.docker.compose.project': scope.composeProject, 'com.docker.compose.project.working_dir': workingDir },
  Command: 'segredo que não deve atravessar o proxy', Ports: [{ PublicPort: 1234 }]
});

test('proxy Docker consulta somente lista filtrada e publica campos sanitizados', async t => {
  const paths: string[] = [];
  const engine: DockerEngineReader = { async get(path) { paths.push(path); return [row('api-lab', 'running', 'healthy')]; } };
  const token = randomBytes(32).toString('hex');
  const { server, url } = await startDockerSnapshotProxy(engine, scope, token);
  t.after(() => server.close());
  const noToken = await fetch(url);
  assert.equal(noToken.status, 401);
  const forbiddenMethod = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(forbiddenMethod.status, 405);
  const rawApi = await fetch(new URL('/containers/json', url), { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(rawApi.status, 404);
  const query = await fetch(`${url}?all=1`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(query.status, 404);
  const allowed = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json() as { containers: unknown[] }).containers,
    [{ name: 'api-lab', state: 'running', health: 'healthy' }]);
  assert.equal(paths.length, 1);
  assert.equal(new URL(paths[0], 'http://docker').pathname, '/containers/json');
  const filters = JSON.parse(new URL(paths[0], 'http://docker').searchParams.get('filters')!) as { label: string[] };
  assert.deepEqual(filters.label, [
    'com.docker.compose.project=laboratorio',
    `com.docker.compose.project.working_dir=${scope.composeWorkingDir}`
  ]);
  assert.ok(!JSON.stringify(await collectDockerSnapshot(engine, scope, new AbortController().signal, () => at)).includes('segredo'));
});

test('proxy falha fechado quando Engine retorna contêiner de outro checkout', async () => {
  const engine: DockerEngineReader = { async get() { return [row('fora', 'running', 'healthy', 'C:\\Projetos\\outro')]; } };
  await assert.rejects(collectDockerSnapshot(engine, scope, new AbortController().signal), /fora do escopo/);
});

test('sonda Docker distingue healthcheck, ausência de healthcheck, parada e perda de proxy', async t => {
  let rows = [row('api-lab', 'running', 'healthy')];
  const engine: DockerEngineReader = { async get() { return rows; } };
  const token = randomBytes(32).toString('hex');
  const { server, url } = await startDockerSnapshotProxy(engine, scope, token);
  t.after(() => server.close());
  const probe = dockerContainerProbe('docker-lab', 'docker-proxy', 'api-lab', url, token);
  assert.equal((await probe.collect(new AbortController().signal)).health, 'saudavel');
  rows = [row('api-lab', 'running', 'unhealthy')];
  assert.equal((await probe.collect(new AbortController().signal)).health, 'degradado');
  rows = [row('api-lab', 'running', 'none')];
  assert.equal((await probe.collect(new AbortController().signal)).health, 'sem_dados');
  rows = [row('api-lab', 'exited', 'none')];
  assert.equal((await probe.collect(new AbortController().signal)).health, 'indisponivel');
  rows = [];
  await assert.rejects(probe.collect(new AbortController().signal), /não observado/);
  const badToken = dockerContainerProbe('docker-lab', 'docker-proxy', 'api-lab', url, randomBytes(32).toString('hex'));
  await assert.rejects(badToken.collect(new AbortController().signal), /indisponível/);
});

test('sonda Docker recusa endpoint externo e token fraco', () => {
  assert.throws(() => dockerContainerProbe('r', 's', 'api-lab', 'http://example.invalid/v1/snapshot', 'x'.repeat(64)), /inválida/);
  assert.throws(() => dockerContainerProbe('r', 's', 'api-lab', 'http://127.0.0.1:1234/v1/snapshot', 'fraco'), /inválida/);
});
