import { timingSafeEqual } from 'node:crypto';
import http, { type Server } from 'node:http';

export type DockerContainerState = 'created' | 'running' | 'paused' | 'restarting' | 'exited' | 'removing' | 'dead';
export type DockerHealth = 'healthy' | 'unhealthy' | 'starting' | 'none';
export interface DockerSnapshot {
  version: 1;
  observedAt: string;
  containers: { name: string; state: DockerContainerState; health: DockerHealth }[];
}
export interface DockerScope { composeProject: string; composeWorkingDir: string }
export interface DockerEngineReader { get(path: string, signal: AbortSignal): Promise<unknown> }

const states = new Set<DockerContainerState>(['created', 'running', 'paused', 'restarting', 'exited', 'removing', 'dead']);
const healthStates = new Set<DockerHealth>(['healthy', 'unhealthy', 'starting', 'none']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta Docker inválida');
  return value as Record<string, unknown>;
}

export function dockerEngineReader(socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'): DockerEngineReader {
  return {
    get(path, signal) {
      return new Promise((resolve, reject) => {
        const req = http.request({ socketPath, path, method: 'GET', signal, timeout: 5000, headers: { Accept: 'application/json' } }, response => {
          if (response.statusCode !== 200) { response.destroy(); reject(new Error('Docker Engine indisponível')); return; }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1024 * 1024) { response.destroy(new Error('Resposta Docker excedeu o limite')); return; }
            chunks.push(chunk);
          });
          response.on('error', reject);
          response.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); }
            catch { reject(new Error('JSON Docker inválido')); }
          });
        });
        req.on('timeout', () => req.destroy(new Error('Tempo limite do Docker Engine')));
        req.on('error', reject);
        req.end();
      });
    }
  };
}

export async function collectDockerSnapshot(engine: DockerEngineReader, scope: DockerScope, signal: AbortSignal,
  now: () => string = () => new Date().toISOString()): Promise<DockerSnapshot> {
  if (!scope.composeProject || scope.composeProject.length > 128 || !scope.composeWorkingDir || scope.composeWorkingDir.length > 1024)
    throw new Error('Escopo Docker inválido');
  const filters = JSON.stringify({ label: [
    `com.docker.compose.project=${scope.composeProject}`,
    `com.docker.compose.project.working_dir=${scope.composeWorkingDir}`
  ] });
  const result = await engine.get(`/containers/json?all=1&filters=${encodeURIComponent(filters)}`, signal);
  if (!Array.isArray(result) || result.length > 32) throw new Error('Inventário Docker inválido ou acima do limite');
  const containers = result.map(value => {
    const row = record(value);
    const labels = record(row.Labels);
    if (labels['com.docker.compose.project'] !== scope.composeProject ||
        labels['com.docker.compose.project.working_dir'] !== scope.composeWorkingDir)
      throw new Error('Docker retornou contêiner fora do escopo');
    const rawName = Array.isArray(row.Names) && row.Names.length === 1 ? row.Names[0] : null;
    if (typeof rawName !== 'string' || !/^\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(rawName))
      throw new Error('Nome de contêiner inválido');
    if (!states.has(row.State as DockerContainerState)) throw new Error('Estado Docker inválido');
    // Docker 29 acrescentou Health à listagem. Sem esse campo, não inferimos saúde de Status textual.
    const rawHealth = row.Health == null ? 'none' : record(row.Health).Status;
    if (!healthStates.has(rawHealth as DockerHealth)) throw new Error('Health Docker inválido');
    return { name: rawName.slice(1), state: row.State as DockerContainerState, health: rawHealth as DockerHealth };
  });
  return { version: 1, observedAt: now(), containers };
}

export async function startDockerSnapshotProxy(engine: DockerEngineReader, scope: DockerScope, token: string, port = 0): Promise<{ server: Server; url: string }> {
  if (Buffer.byteLength(token) < 32) throw new Error('Token do proxy deve ter pelo menos 32 bytes');
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Porta do proxy inválida');
  const expected = Buffer.from(token);
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const supplied = request.headers.authorization?.startsWith('Bearer ') ? Buffer.from(request.headers.authorization.slice(7)) : Buffer.alloc(0);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { response.writeHead(401).end(); return; }
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }).end(); return; }
    if (request.url !== '/v1/snapshot' || request.headers['content-length'] || request.headers['transfer-encoding']) {
      response.writeHead(404).end(); return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const snapshot = await collectDockerSnapshot(engine, scope, controller.signal);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(snapshot));
    } catch {
      response.writeHead(503).end();
    } finally { clearTimeout(timer); }
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Endereço do proxy inválido');
    return { server, url: `http://127.0.0.1:${address.port}/v1/snapshot` };
  } catch (error) { if (server.listening) server.close(); throw error; }
}
