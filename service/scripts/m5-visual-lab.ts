import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import type { Observation } from '../src/operations/operations-store.ts';

const directory = mkdtempSync(path.join(os.tmpdir(), 'wr3d-m5-visual-'));
const store = new EventStore(path.join(directory, 'state.sqlite'));
const token = randomBytes(32).toString('hex');
const environmentId = 'm5-lab';
const resourceId = 'm5-api';
const sourceId = 'm5-synthetic-source';
const sourceVersion = '1.0';

store.registerProject({ projectId: 'm5-project', name: 'LAB M5 SINTÉTICO', canonicalPath: 'C:\\Projetos\\m5-visual-sintetico' });
store.infrastructure.replaceInventory({
  schemaVersion: '1.0',
  environments: [{ environmentId, name: 'Laboratório visual sintético' }],
  resources: [{ resourceId, environmentId, kind: 'api', name: 'API sintética M5', sourceId: 'm5-api-probe', staleAfterMs: 600_000 }],
  projectResources: [{ projectId: 'm5-project', resourceId, origin: 'configured', confidence: 'confirmed' }],
  dependencies: []
});
store.operations.registerSource({ sourceId, sourceVersion, environmentId, enabled: true,
  permissions: ['log', 'trace', 'network', 'security_detection', 'security_report'], staleAfterMs: 600_000, retentionDays: 1 });
store.operations.registerRule({ ruleId: 'm5-visual-alert', version: 1, category: 'security_detection', field: 'signature',
  operator: 'eq', expectedValue: 'fixture-alert', severity: 'medium', enabled: true });

const now = Date.now();
function record(observationId: string, category: Observation['category'], fields: Observation['fields'], offsetSeconds: number,
  correlation?: Observation['correlation']) {
  const instant = new Date(now - offsetSeconds * 1000).toISOString();
  store.operations.record({ schemaVersion: '1.0', observationId, sourceId, sourceVersion, environmentId, resourceId,
    observedAt: instant, receivedAt: instant, category, classification: `synthetic_${category}`, confidence: 'observed',
    evidenceRef: `fixture://m5/${observationId}`, coverage: 'covered', fields, ...(correlation ? { correlation } : {}) });
}
for (let index = 1; index <= 13; index++) {
  const number = String(index).padStart(2, '0');
  record(`m5-log-${number}`, 'log', { message: `LAB SINTÉTICO · linha ${number} · Authorization: Bearer synthetic-secret`, service: 'api' }, 14 - index);
}
record('m5-trace-01', 'trace', { message: 'LAB SINTÉTICO · rastro ligado por Request ID explícito' }, 1,
  { traceId: '0123456789abcdef0123456789abcdef', requestId: 'req-m5-lab' });
record('m5-detection-01', 'security_detection', { signature: 'fixture-alert', message: 'LAB SINTÉTICO · detecção ilustrativa' }, 1);

const { server, url } = await startReadOnlyServer(store, token, 0);
process.stdout.write(JSON.stringify({ url, token, synthetic: true, logs: 13, traces: 1, incidents: 1 }) + '\n');
const close = () => server.close(() => {
  store.close();
  if (path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`))
    rmSync(directory, { recursive: true, force: true });
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, close);
