import http, { type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { EventStore, StreamChange } from '../store/event-store.ts';

const schema = JSON.parse(readFileSync(new URL('../../../contracts/schemas/snapshot.v1.schema.json', import.meta.url), 'utf8'));
const validateSnapshot = new Ajv2020({ strict: true }).compile(schema);
const maxReplay = 1000;
const maxQueuedBytes = 8 * 1024 * 1024;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

function parseCursor(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export async function startReadOnlyServer(store: EventStore, token: string, port = 0): Promise<{ server: Server; url: string }> {
  if (Buffer.byteLength(token) < 32 || !Number.isSafeInteger(port) || port < 0 || port > 65535)
    throw new Error('Token ou porta do serviço inválidos');
  const expected = Buffer.from(token);
  const clients = new Set<ServerResponse>();
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const supplied = request.headers.authorization?.startsWith('Bearer ') ? Buffer.from(request.headers.authorization.slice(7)) : Buffer.alloc(0);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { response.writeHead(401).end(); return; }
    if (!request.url) { response.writeHead(404).end(); return; }
    if ((request.method === 'POST' && request.url === '/v1/github/repositories') || (request.method === 'DELETE' && request.url === '/v1/github/repositories')) {
      const length = Number(request.headers['content-length'] ?? 0);
      if (!Number.isSafeInteger(length) || length < 1 || length > 4096 || request.headers['transfer-encoding']) { response.writeHead(413).end(); return; }
      let raw = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { raw += chunk; if (Buffer.byteLength(raw) > 4096) request.destroy(); });
      request.on('end', () => {
        try {
          const input = JSON.parse(raw) as { repositoryId: string; owner?: string; name?: string; projectId: string };
          if (!input || typeof input.repositoryId !== 'string' || typeof input.projectId !== 'string') throw new Error('Corpo inválido');
          if (request.method === 'DELETE') { sendJson(response, 200, { removed: store.history.unlinkRepository(input.repositoryId, input.projectId) }); return; }
          if (typeof input.owner !== 'string' || typeof input.name !== 'string') throw new Error('Vínculo precisa de owner e name');
          sendJson(response, 201, store.history.linkRepository({ repositoryId: input.repositoryId, owner: input.owner, name: input.name, projectId: input.projectId }));
        } catch (error) { sendJson(response, 400, { code: 'invalid_repository_link', message: error instanceof Error ? error.message : 'Entrada inválida' }); }
      });
      return;
    }
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET, POST, DELETE' }).end(); return; }
    if (request.headers['content-length'] || request.headers['transfer-encoding']) { response.writeHead(404).end(); return; }
    try {
      const parsedUrl = new URL(request.url, 'http://127.0.0.1');
      if (parsedUrl.pathname === '/v1/history/day') {
        const date = parsedUrl.searchParams.get('date');
        const timeZone = parsedUrl.searchParams.get('timeZone');
        const projectId = parsedUrl.searchParams.get('projectId');
        if (!date || !timeZone || (projectId !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(projectId)) ||
            [...parsedUrl.searchParams.keys()].some(k => !['date','timeZone','projectId'].includes(k))) { sendJson(response, 400, { code: 'invalid_query' }); return; }
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(NaN);
        if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== date) { sendJson(response, 400, { code: 'invalid_query' }); return; }
        try { new Intl.DateTimeFormat('pt-BR', {timeZone}).format(parsedDate); }
        catch (error) { if (error instanceof RangeError) { sendJson(response, 400, {code:'invalid_query'}); return; } throw error; }
        try { sendJson(response, 200, store.history.daySummary(date, timeZone, new Date().toISOString(), projectId??undefined)); }
        catch (error) { if (error instanceof Error && error.message==='Projeto desconhecido') sendJson(response, 400, {code:'invalid_query'}); else throw error; }
        return;
      }
      if (parsedUrl.pathname === '/v1/history/replay') {
        const cursor = parseCursor(parsedUrl.searchParams.get('cursor') ?? '0');
        const limit = Number(parsedUrl.searchParams.get('limit') ?? '500');
        if (cursor === null || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || [...parsedUrl.searchParams.keys()].some(k => !['cursor','limit'].includes(k))) { sendJson(response, 400, { code: 'invalid_query' }); return; }
        try { sendJson(response, 200, store.history.replay(cursor, limit)); }
        catch (error) { if (error instanceof Error && error.message==='Cursor de replay indisponível') sendJson(response, 409, {code:'resync_required'}); else throw error; }
        return;
      }
      if (parsedUrl.pathname === '/v1/history/replay/state') {
        const at = parsedUrl.searchParams.get('at');
        if (!at || [...parsedUrl.searchParams.keys()].some(k => k !== 'at') ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(at) || !Number.isFinite(Date.parse(at)) ||
            new Date(at).toISOString().slice(0,19) !== at.slice(0,19)) {
          sendJson(response, 400, { code: 'invalid_query' }); return;
        }
        sendJson(response, 200, store.historicalSnapshot(at)); return;
      }
      if (parsedUrl.pathname === '/v1/github/repositories') { sendJson(response, 200, store.history.repositories()); return; }
      if (parsedUrl.search) { response.writeHead(404).end(); return; }
      if (request.url === '/v1/health') { sendJson(response, 200, { status: 'ok' }); return; }
      if (request.url === '/v1/capabilities') {
        sendJson(response, 200, { schemaVersion: '1.0', capabilities: store.snapshot().capabilities }); return;
      }
      if (request.url === '/v1/snapshot') {
        const snapshot = store.snapshot();
        if (!validateSnapshot(snapshot)) throw new Error('Snapshot fora do contrato');
        sendJson(response, 200, snapshot); return;
      }
      if (request.url !== '/v1/events') { response.writeHead(404).end(); return; }
      const cursor = parseCursor(request.headers['last-event-id']);
      if (cursor === null) { sendJson(response, 409, { code: 'resync_required' }); return; }
      const window = store.changeWindow(cursor, maxReplay + 1);
      if (cursor > window.current || cursor <= window.baseline) {
        sendJson(response, 409, { code: 'resync_required' }); return;
      }
      const backlog = window.changes;
      if (backlog.length > maxReplay || clients.size >= 16) {
        sendJson(response, backlog.length > maxReplay ? 409 : 503,
          { code: backlog.length > maxReplay ? 'resync_required' : 'too_many_clients' }); return;
      }
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      clients.add(response);
      let last = cursor;
      const write = (change: StreamChange): void => {
        if (change.streamSequence <= last || response.destroyed) return;
        if (response.writableLength > maxQueuedBytes) { response.destroy(); return; }
        response.write(`id: ${change.streamSequence}\nevent: ${change.type}\ndata: ${JSON.stringify(change)}\n\n`);
        last = change.streamSequence;
      };
      response.write(': connected\n\n');
      for (const change of backlog) write(change);
      const poll = setInterval(() => {
        try {
          const next = store.changeWindow(last, maxReplay + 1);
          if (last <= next.baseline) { response.write('event: resync.required\ndata: {"code":"resync_required"}\n\n'); response.end(); return; }
          for (const change of next.changes) write(change);
        }
        catch { response.destroy(); }
      }, 250);
      const heartbeat = setInterval(() => { if (!response.destroyed) response.write(': heartbeat\n\n'); }, 15000);
      response.on('close', () => { clearInterval(poll); clearInterval(heartbeat); clients.delete(response); });
    } catch {
      if (!response.headersSent) sendJson(response, 503, { code: 'service_unavailable' });
      else response.destroy();
    }
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Endereço do serviço inválido');
    return { server, url: `http://127.0.0.1:${address.port}` };
  } catch (error) { if (server.listening) server.close(); throw error; }
}
