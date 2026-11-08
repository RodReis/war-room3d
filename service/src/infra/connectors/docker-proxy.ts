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
export interface DockerEngineReader {
  get(path: string, signal: AbortSignal): Promise<unknown>;
  getRaw?(path: string, signal: AbortSignal): Promise<Buffer>;
}
export interface DockerLogEntry { observedAt: string; stream: 'stdout' | 'stderr'; message: string; requestId?: string }
export interface DockerLogsSnapshot { version: 1; observedAt: string; service: 'api'; containerName: string; containerState: DockerContainerState; entries: DockerLogEntry[] }

const states = new Set<DockerContainerState>(['created', 'running', 'paused', 'restarting', 'exited', 'removing', 'dead']);
const healthStates = new Set<DockerHealth>(['healthy', 'unhealthy', 'starting', 'none']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta Docker inválida');
  return value as Record<string, unknown>;
}

export function dockerEngineReader(socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'): DockerEngineReader {
  const getRaw = (path: string, signal: AbortSignal): Promise<Buffer> => new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path, method: 'GET', signal, timeout: 5000, headers: { Accept: 'application/json, application/vnd.docker.raw-stream' } }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error('Docker Engine indisponível')); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) { response.destroy(new Error('Resposta Docker excedeu o limite')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('Tempo limite do Docker Engine')));
    req.on('error', reject);
    req.end();
  });
  return {
    getRaw,
    get(path, signal) {
      return getRaw(path, signal).then(buffer => {
        try { return JSON.parse(buffer.toString('utf8')) as unknown; }
        catch { throw new Error('JSON Docker inválido'); }
      });
    }
  };
}

function dockerLogFrames(buffer: Buffer): Array<{ stream: 'stdout' | 'stderr'; text: string }> {
  const frames: Array<{ stream: 'stdout' | 'stderr'; text: string }> = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 8) throw new Error('Quadro de log Docker incompleto');
    const stream = buffer[offset] === 1 ? 'stdout' : buffer[offset] === 2 ? 'stderr' : null;
    if (!stream || buffer[offset + 1] !== 0 || buffer[offset + 2] !== 0 || buffer[offset + 3] !== 0)
      throw new Error('Quadro de log Docker inválido');
    const size = buffer.readUInt32BE(offset + 4);
    offset += 8;
    if (size > 1024 * 1024 || buffer.length - offset < size) throw new Error('Payload de log Docker inválido');
    frames.push({ stream, text: buffer.subarray(offset, offset + size).toString('utf8') });
    offset += size;
  }
  return frames;
}

function parseDockerLogFrames(buffer: Buffer): DockerLogEntry[] {
  const entries: DockerLogEntry[] = [];
  for (const frame of dockerLogFrames(buffer)) for (const line of frame.text.split(/\r?\n/)) {
    if (!line) continue;
    const timestamp = line.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (.*)$/);
    if (!timestamp || !Number.isFinite(Date.parse(timestamp[1]!))) throw new Error('Timestamp de log Docker inválido');
    const message = timestamp[2]!.slice(0, 4096);
    const correlation = message.match(/(?:correlationId|requestId)\s*[=:]\s*["']?([A-Za-z0-9][A-Za-z0-9._:-]{0,159})/i) ??
      message.match(/\[(corr-[A-Za-z0-9._:-]{1,150})\]/i);
    entries.push({ observedAt: timestamp[1]!, stream: frame.stream, message,
      ...(correlation ? { requestId: correlation[1] } : {}) });
  }
  return entries.slice(-100);
}

export async function collectDockerApiLogs(engine: DockerEngineReader, scope: DockerScope, since: string,
  signal: AbortSignal, now: () => string = () => new Date().toISOString()): Promise<DockerLogsSnapshot> {
  if (!scope.composeProject || scope.composeProject.length > 128 || !scope.composeWorkingDir || scope.composeWorkingDir.length > 1024 ||
      !Number.isFinite(Date.parse(since)) || Date.parse(since) < Date.now() - 7 * 86_400_000 || Date.parse(since) > Date.now())
    throw new Error('Escopo ou janela de logs Docker inválidos');
  if (!engine.getRaw) throw new Error('Leitura de logs Docker não configurada');
  const filters = JSON.stringify({ label: [
    `com.docker.compose.project=${scope.composeProject}`,
    `com.docker.compose.project.working_dir=${scope.composeWorkingDir}`,
    'com.docker.compose.service=api'
  ] });
  const result = await engine.get(`/containers/json?all=1&filters=${encodeURIComponent(filters)}`, signal);
  if (!Array.isArray(result) || result.length > 32) throw new Error('Inventário Docker inválido ou acima do limite');
  const matches = result.map(value => {
    const row = record(value), labels = record(row.Labels);
    if (labels['com.docker.compose.project'] !== scope.composeProject ||
        labels['com.docker.compose.project.working_dir'] !== scope.composeWorkingDir || labels['com.docker.compose.service'] !== 'api')
      throw new Error('Docker retornou contêiner fora do escopo');
    const name = Array.isArray(row.Names) && row.Names.length === 1 && typeof row.Names[0] === 'string' ? row.Names[0] as string : '';
    if (!/^\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name) || typeof row.Id !== 'string' || !/^[a-fA-F0-9]{12,64}$/.test(row.Id) || !states.has(row.State as DockerContainerState))
      throw new Error('Identidade do contêiner API inválida');
    return { id: row.Id, name: name.slice(1), state: row.State as DockerContainerState };
  });
  if (matches.length !== 1) throw new Error('Contêiner API não encontrado de forma única no checkout autorizado');
  const container = matches[0]!;
  const query = new URLSearchParams({ follow: '0', stdout: '1', stderr: '1', since: String(Math.floor(Date.parse(since) / 1000)), timestamps: '1', tail: '100' });
  const raw = await engine.getRaw(`/containers/${container.id}/logs?${query}`, signal);
  return { version: 1, observedAt: now(), service: 'api', containerName: container.name, containerState: container.state,
    entries: parseDockerLogFrames(raw) };
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

export async function startDockerSnapshotProxy(engine: DockerEngineReader, scope: DockerScope, token: string, port = 0, logsEnabled = false): Promise<{ server: Server; url: string }> {
  if (Buffer.byteLength(token) < 32) throw new Error('Token do proxy deve ter pelo menos 32 bytes');
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Porta do proxy inválida');
  const expected = Buffer.from(token);
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const supplied = request.headers.authorization?.startsWith('Bearer ') ? Buffer.from(request.headers.authorization.slice(7)) : Buffer.alloc(0);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { response.writeHead(401).end(); return; }
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }).end(); return; }
    const url = new URL(request.url ?? '', 'http://127.0.0.1');
    if (request.headers['content-length'] || request.headers['transfer-encoding']) { response.writeHead(404).end(); return; }
    if (url.pathname === '/v1/logs' && logsEnabled) {
      const keys = [...url.searchParams.keys()];
      const service = url.searchParams.get('service'), since = url.searchParams.get('since');
      if (new Set(keys).size !== keys.length || keys.length !== 2 || !keys.includes('service') || !keys.includes('since') || service !== 'api' || !since ||
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(since)) { response.writeHead(400).end(); return; }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const logs = await collectDockerApiLogs(engine, scope, since, controller.signal);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(logs));
      } catch { response.writeHead(503).end(); }
      finally { clearTimeout(timer); }
      return;
    }
    if (url.pathname !== '/v1/snapshot' || url.search) {
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
