import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { collectDockerApiLogs, collectDockerSnapshot, startDockerSnapshotProxy, type DockerEngineReader, type DockerScope } from '../src/infra/connectors/docker-proxy.ts';
import { dockerContainerProbe } from '../src/infra/connectors/docker.ts';

const scope: DockerScope = { composeProject: 'laboratorio', composeWorkingDir: 'C:\\Projetos\\laboratorio' };
const at = '2026-11-06T16:00:00.000Z';
const row = (name: string, state: string, health: string, workingDir = scope.composeWorkingDir) => ({
  Names: [`/${name}`], State: state, Health: { Status: health },
  Id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  Labels: { 'com.docker.compose.project': scope.composeProject, 'com.docker.compose.project.working_dir': workingDir, 'com.docker.compose.service':'api' },
  Command: 'segredo que não deve atravessar o proxy', Ports: [{ PublicPort: 1234 }]
});

function frame(stream:1|2,text:string):Buffer{
  const payload=Buffer.from(text,'utf8'),header=Buffer.alloc(8);header[0]=stream;header.writeUInt32BE(payload.length,4);return Buffer.concat([header,payload]);
}

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

test('logs Docker leem somente serviço api do projeto e checkout exatos, com janela e limite',async()=>{
  const calls:string[]=[];
  const engine:DockerEngineReader={
    async get(path){calls.push(path);return [row('contaia-api','exited','none')];},
    async getRaw(path){calls.push(path);return Buffer.concat([frame(1,'2026-11-06T19:41:58.6768968Z [Nest] 1 - ERROR [Filtro] falha [corr-abc-123]\n'),frame(2,'2026-11-06T19:41:59.0000000Z conexão recusada\n')]);}
  };
  const logs=await collectDockerApiLogs(engine,scope,'2026-11-06T19:00:00.000Z',new AbortController().signal,()=>at);
  assert.equal(logs.service,'api');assert.equal(logs.containerName,'contaia-api');assert.equal(logs.containerState,'exited');assert.equal(logs.entries.length,2);
  assert.equal(logs.entries[0]?.stream,'stdout');assert.equal(logs.entries[0]?.requestId,'corr-abc-123');assert.equal(logs.entries[1]?.stream,'stderr');
  const listUrl=new URL(calls[0]!, 'http://docker');
  assert.deepEqual(JSON.parse(listUrl.searchParams.get('filters')!).label,[
    'com.docker.compose.project=laboratorio',`com.docker.compose.project.working_dir=${scope.composeWorkingDir}`,'com.docker.compose.service=api'
  ]);
  const logUrl=new URL(calls[1]!, 'http://docker');
  assert.equal(logUrl.searchParams.get('follow'),'0');assert.equal(logUrl.searchParams.get('tail'),'100');assert.equal(logUrl.searchParams.get('stdout'),'1');assert.equal(logUrl.searchParams.get('stderr'),'1');
  assert.match(logUrl.pathname,/^\/containers\/[a-f0-9]{64}\/logs$/);
});

test('proxy de logs fica desligado por padrão e, ligado, exige token e serviço api',async t=>{
  const token=randomBytes(32).toString('hex');
  const engine:DockerEngineReader={async get(){return [row('contaia-api','running','none')];},async getRaw(){return frame(1,'2026-11-06T19:41:58.0000000Z [Nest] [corr-abc]\n');}};
  const off=await startDockerSnapshotProxy(engine,scope,token);
  const offResponse=await fetch(`${off.url.replace('/v1/snapshot','/v1/logs')}?service=api&since=${encodeURIComponent(at)}`,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(offResponse.status,404);off.server.close();
  const on=await startDockerSnapshotProxy(engine,scope,token,0,true);t.after(()=>on.server.close());
  const noToken=await fetch(`${on.url.replace('/v1/snapshot','/v1/logs')}?service=api&since=${encodeURIComponent(at)}`);
  assert.equal(noToken.status,401);
  const wrongService=await fetch(`${on.url.replace('/v1/snapshot','/v1/logs')}?service=workers&since=${encodeURIComponent(at)}`,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(wrongService.status,400);
  const allowed=await fetch(`${on.url.replace('/v1/snapshot','/v1/logs')}?service=api&since=${encodeURIComponent(at)}`,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(allowed.status,200);assert.deepEqual((await allowed.json() as {entries:Array<{requestId?:string}>}).entries.map(item=>item.requestId),['corr-abc']);
});

test('logs Docker falham fechados em checkout, identidade ou quadro inválidos',async()=>{
  const wrong:DockerEngineReader={async get(){return [row('api','running','none','C:\\Projetos\\outro')];},async getRaw(){return Buffer.alloc(0);}};
  await assert.rejects(collectDockerApiLogs(wrong,scope,at,new AbortController().signal),/fora do escopo/);
  const badId:DockerEngineReader={async get(){return [{...row('api','running','none'),Id:'nao-hex'}];},async getRaw(){return Buffer.alloc(0);}};
  await assert.rejects(collectDockerApiLogs(badId,scope,at,new AbortController().signal),/Identidade/);
  const badFrame:DockerEngineReader={async get(){return [row('api','running','none')];},async getRaw(){return Buffer.from('TTY sem multiplexação');}};
  await assert.rejects(collectDockerApiLogs(badFrame,scope,at,new AbortController().signal),/Quadro/);
  await assert.rejects(collectDockerApiLogs(badId,scope,'2020-01-01T00:00:00.000Z',new AbortController().signal),/janela/);
});
