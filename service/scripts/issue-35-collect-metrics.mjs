import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const g3 = process.argv[2] === '--g3';
if (process.argv[2] && !g3) throw new Error('Uso: issue-35-collect-metrics.mjs [--g3]');
const scenarios = g3 ? {
  visual: 'issue-35-g3-visual-final',
  reduced: 'issue-35-g3-reduced-final',
  sector: 'issue-35-g3-sector-final'
} : {
  visual: 'issue-35-visual-rnf03-clean',
  reduced: 'issue-35-reduced-final',
  sector: 'issue-35-sector-final'
};
const build = JSON.parse(readFileSync(path.join(root, 'docs/validation/sala-referencia',
  g3 ? 'player-build-manifest-g3.json' : 'player-build-manifest.json'), 'utf8'));
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const result = { date: '2026-11-08', unityVersion: '6000.3.27f1', nodeVersion: process.version,
  buildTreeSha256: build.treeSha256, source: 'synthetic-local', scenarios: {} };
for (const [name, directoryName] of Object.entries(scenarios)) {
  const directory = path.join(root, 'Logs', directoryName);
  const summaryFile = readdirSync(directory).find(file => /^performance-600s-.*\.summary\.json$/.test(file));
  if (!summaryFile) throw new Error(`Relatório interno ausente: ${name}`);
  const internalPath = path.join(directory, summaryFile);
  const csvPath = path.join(directory, 'presentmon.csv');
  const internal = JSON.parse(readFileSync(internalPath, 'utf8'));
  const external = JSON.parse(readFileSync(path.join(directory, 'presentmon-summary.json'), 'utf8'));
  const environment = JSON.parse(readFileSync(path.join(directory, 'environment.json'), 'utf8'));
  const targetMs = name === 'reduced' ? 33.33 : 16.67;
  if (internal.referenceProfile !== name || !external.fullDuration ||
      internal.plannedEvents !== 7000 || internal.acceptedEvents !== 7000 ||
      internal.sequenceCoveredEvents !== 7000 || !Object.values(internal.validity).every(Boolean) ||
      (g3 && (external.intervalMs.p95 > targetMs ||
        !Number.isSafeInteger(environment.processWorkingSetPointInTimeBytes))))
    throw new Error(`Cenário inválido: ${name}`);
  const { samplesMs, ...latency } = internal.latency;
  if (g3 && (!path.isAbsolute(environment.build) ||
      !environment.build.replaceAll('\\', '/').includes('/WarRoom3D-M5-G3/')))
    throw new Error(`Build G3 divergente: ${name}`);
  result.scenarios[name] = {
    view: internal.view, resolution: internal.resolution, physicalDpi: environment.appliedDpi ?? 96,
    monitorHz: environment.video?.[0]?.CurrentRefreshRate ?? null,
    baseline: internal.baseline, durationSeconds: internal.durationSeconds,
    plannedEvents: internal.plannedEvents, acceptedEvents: internal.acceptedEvents,
    sequenceCoveredEvents: internal.sequenceCoveredEvents, disconnectCount: internal.disconnectCount,
    latency: { ...latency, sampleCount: samplesMs.length },
    presentTargetMs: targetMs, presentP95Ms: external.intervalMs.p95,
    presentWithinTarget: external.intervalMs.p95 <= targetMs,
    internalFrameP95Ms: internal.frame.p95Ms, internalFrameIsNotPresentMetric: true,
    external, processWorkingSetPointInTimeBytes: g3 ?
      environment.processWorkingSetPointInTimeBytes ?? null : name === 'visual' ? 731938816 :
      name === 'reduced' ? 692129792 : 694681600,
    raw: { directory: `Logs/${directoryName}`, csvSha256: await sha256(csvPath),
      internalSummarySha256: await sha256(internalPath) }
  };
}
const output = path.join(root, 'docs/validation/sala-referencia',
  g3 ? 'metricas-player-g3.json' : 'metricas-player.json');
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, buildTreeSha256: result.buildTreeSha256,
  p95Ms: Object.fromEntries(Object.entries(result.scenarios).map(([name, value]) => [name, value.presentP95Ms])) }));
