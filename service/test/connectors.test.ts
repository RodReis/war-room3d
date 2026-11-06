import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventStore } from '../src/store/event-store.ts';
import { CollectorRunner, type Probe } from '../src/infra/connectors/probe.ts';
import { httpProbe } from '../src/infra/connectors/http.ts';
import { localHostProbe } from '../src/infra/connectors/host.ts';
import type { Inventory } from '../src/infra/inventory.ts';

const at = '2026-11-06T16:00:00Z';
const later = '2026-11-06T16:00:01Z';
const inventory = JSON.parse(readFileSync(new URL('../../contracts/fixtures/m2/shared-infrastructure.v1.json', import.meta.url), 'utf8')) as Inventory;

function storeForTest(t: { after: (fn: () => void) => void }): EventStore {
  const directory = mkdtempSync(path.join(tmpdir(), 'war-room3d-probe-'));
  const store = new EventStore(path.join(directory, 'state.db'));
  t.after(() => { store.close(); if (!path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`)) throw new Error('Alvo temporário inválido'); rmSync(directory, { recursive: true, force: true }); });
  for (let i = 1; i <= 3; i++) store.registerProject({ projectId: `p${i}`, name: `Projeto ${i}`, canonicalPath: `C:\\Projects\\p${i}` });
  store.infrastructure.replaceInventory({ ...inventory, resources: [...inventory.resources,
    { resourceId: 'host-lab', environmentId: 'lab', kind: 'host', name: 'Host', sourceId: 'probe-host', staleAfterMs: 60000 }] });
  return store;
}

test('sonda local mede memória sem inferir saúde do host', async t => {
  const store = storeForTest(t);
  const runner = new CollectorRunner(store.infrastructure, [localHostProbe('host-lab', 'probe-host', () => at)], 1000, () => later);
  assert.deepEqual(await runner.collectOnce(), { collected: ['host-lab'], failed: [] });
  const state = (store.snapshot(later).resourceStates as { resourceId: string; health: string; coverage: string; indicator: string; unit: string }[]).find(item => item.resourceId === 'host-lab');
  assert.deepEqual([state?.health, state?.coverage, state?.indicator, state?.unit], ['sem_dados', 'atual', 'memory_used', 'percent']);
});

test('sonda HTTP aceita URL explícita, não segue redirect e distingue 503 de 401', async t => {
  const store = storeForTest(t);
  assert.throws(() => httpProbe('api-lab', 'probe-api', 'https://user:password@example.invalid/health'), /credenciais/);
  assert.throws(() => httpProbe('api-lab', 'probe-api', 'https://example.invalid/health?token=x'), /parâmetros/);
  let observedRedirect: RequestRedirect | undefined;
  const fetch503 = (async (_url: RequestInfo | URL, init?: RequestInit) => { observedRedirect = init?.redirect; return new Response(null, { status: 503 }); }) as typeof fetch;
  const failedProbe = httpProbe('api-lab', 'probe-api', 'https://example.invalid/health', fetch503, () => at);
  assert.deepEqual(await new CollectorRunner(store.infrastructure, [failedProbe], 1000, () => later).collectOnce(), { collected: ['api-lab'], failed: [] });
  assert.equal(observedRedirect, 'manual');
  assert.equal((store.snapshot(later).incidents as unknown[]).length, 1);
  const fetch401 = (async () => new Response(null, { status: 401 })) as typeof fetch;
  assert.deepEqual(await new CollectorRunner(store.infrastructure, [httpProbe('api-lab', 'probe-api', 'https://example.invalid/health', fetch401, () => later)], 1000, () => '2026-11-06T16:00:02Z').collectOnce(),
    { collected: [], failed: ['api-lab'] });
  const state = (store.snapshot('2026-11-06T16:00:03Z').resourceStates as { resourceId: string; health: string; coverage: string }[]).find(item => item.resourceId === 'api-lab');
  assert.deepEqual([state?.health, state?.coverage], ['sem_dados', 'perdida']);
  assert.equal((store.snapshot('2026-11-06T16:00:03Z').incidents as unknown[]).length, 1);
});

test('timeout perde cobertura sem criar incidente; identidade da sonda é verificada', async t => {
  const store = storeForTest(t);
  const hanging: Probe = { resourceId: 'api-lab', sourceId: 'probe-api', collect: async () => new Promise(() => {}) };
  const result = await new CollectorRunner(store.infrastructure, [hanging], 100, () => at).collectOnce();
  assert.deepEqual(result, { collected: [], failed: ['api-lab'] });
  assert.equal((store.snapshot(later).incidents as unknown[]).length, 0);
  const forged: Probe = { resourceId: 'api-lab', sourceId: 'probe-api', collect: async () => ({ resourceId: 'db-lab', sourceId: 'probe-api', sourceVersion: '1', health: 'saudavel', observedAt: at, evidenceRef: 'fake' }) };
  assert.deepEqual(await new CollectorRunner(store.infrastructure, [forged], 1000, () => later).collectOnce(), { collected: [], failed: ['api-lab'] });
});

test('sonda HTTP cancela corpo mesmo em resposta rejeitada', async () => {
  for (const status of [200, 401]) {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1])); },
      cancel() { cancelled = true; }
    });
    const fetcher = (async () => new Response(body, { status })) as typeof fetch;
    const probe = httpProbe('api-lab', 'probe-api', 'https://example.invalid/health', fetcher, () => at);
    if (status === 200) await probe.collect(new AbortController().signal);
    else await assert.rejects(probe.collect(new AbortController().signal));
    assert.equal(cancelled, true, `Corpo HTTP ${status} permaneceu aberto`);
  }
});
