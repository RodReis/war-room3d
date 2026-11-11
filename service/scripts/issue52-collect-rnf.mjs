import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const logs = path.join(root, 'Logs');
const [output, visual, reduced, sector] = process.argv.slice(2).map(value => value && path.resolve(value));
const insideLogs = value => value && value.toLowerCase().startsWith((logs + path.sep).toLowerCase());
if (![output, visual, reduced, sector].every(insideLogs) || existsSync(output))
  throw new Error('Informe saída nova e diretórios visual/reduced/sector absolutos dentro de Logs/');

const manifest = JSON.parse(readFileSync(path.join(logs, 'issue52-avatar-build-manifest.json'), 'utf8'));
const build = path.join(root, 'unity/Builds/WarRoom3D-Quartel/WarRoom3D.exe');
const requiredValidity = ['allSequencesCovered', 'burstRate100PerSecond', 'clockStable',
  'fullDuration', 'playerConnected', 'backgroundExecutionEnabled', 'resolution1080p', 'referenceRoom'];
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
for (const relative of ['WarRoom3D.exe', 'WarRoom3D_Data/Managed/Assembly-CSharp.dll']) {
  const expected = manifest.files.find(item => item.path === relative)?.sha256;
  if (!expected || await sha256(path.join(root, 'unity/Builds/WarRoom3D-Quartel', relative)) !== expected)
    throw new Error(`Build atual diverge do manifesto: ${relative}`);
}

const scenarios = {};
for (const [profile, directory] of Object.entries({ visual, reduced, sector })) {
  const resultPath = path.join(directory, 'result.json');
  const externalPath = path.join(directory, 'presentmon-summary.json');
  const internalName = readdirSync(directory).find(name => /^performance-600s-.*\.summary\.json$/.test(name));
  if (!internalName) throw new Error(`Resumo interno ausente: ${profile}`);
  const internalPath = path.join(directory, internalName);
  const csvPath = path.join(directory, 'presentmon.csv');
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  const external = JSON.parse(readFileSync(externalPath, 'utf8'));
  const internal = JSON.parse(readFileSync(internalPath, 'utf8'));
  const environment = JSON.parse(readFileSync(path.join(directory, 'environment.json'), 'utf8'));
  const target = profile === 'reduced' ? 33.33 : 16.67;
  if (result.profile !== profile || result.build?.toLowerCase() !== build.toLowerCase() ||
      environment.build?.toLowerCase() !== build.toLowerCase() || internal.referenceProfile !== profile ||
      result.durationSeconds !== 600 || result.acceptedEvents !== 7000 || result.coveredEvents !== 7000 ||
      internal.acceptedEvents !== 7000 || internal.sequenceCoveredEvents !== 7000 ||
      !requiredValidity.every(key => result.validity?.[key] === true && internal.validity?.[key] === true) ||
      !result.fullDuration || !external.fullDuration || external.capturedSpanSeconds < 599.9 ||
      external.source !== 'PresentMon 2.6.0 ETW' ||
      result.presentP95Ms !== external.intervalMs.p95 || result.presentP95Ms > target ||
      !Number.isSafeInteger(environment.processWorkingSetPointInTimeBytes))
    throw new Error(`Cenário inválido: ${profile}`);
  scenarios[profile] = {
    acceptedEvents: result.acceptedEvents, coveredEvents: result.coveredEvents,
    propagationP95Ms: result.propagationP95Ms, presentP95Ms: result.presentP95Ms,
    presentTargetMs: target, capturedSpanSeconds: external.capturedSpanSeconds,
    observedPresents: external.observedPresents, displayedIntervals: external.displayedIntervals,
    intervalUnavailable: external.intervalUnavailable, cpuBusyMeanMs: external.cpuBusyMs.mean,
    gpuTimeMeanMs: external.gpuTimeMs.mean,
    processWorkingSetPointInTimeBytes: environment.processWorkingSetPointInTimeBytes,
    raw: { directory: path.relative(root, directory).replaceAll('\\', '/'),
      csvSha256: await sha256(csvPath), resultSha256: await sha256(resultPath),
      externalSha256: await sha256(externalPath), internalSha256: await sha256(internalPath) }
  };
}
const summary = { schemaVersion: 'issue52-rnf-v1', buildTreeSha256: manifest.treeSha256,
  buildExeSha256: manifest.files.find(item => item.path === 'WarRoom3D.exe').sha256,
  scenarios };
writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ output, buildTreeSha256: summary.buildTreeSha256,
  p95Ms: Object.fromEntries(Object.entries(scenarios).map(([name, value]) => [name, value.presentP95Ms])) })}\n`);
