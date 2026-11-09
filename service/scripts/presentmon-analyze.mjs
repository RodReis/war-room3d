import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';

const [csvPath, environmentPath, secondsText] = process.argv.slice(2);
const seconds = Number(secondsText);
if (!csvPath || !environmentPath || !Number.isSafeInteger(seconds) || seconds < 1)
  throw new Error('Uso: node presentmon-analyze.mjs <csv> <environment.json> <segundos>');
const environment = JSON.parse(readFileSync(environmentPath, 'utf8'));
const localClock = value => {
  const match = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) throw new Error(`Data inválida: ${value}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]),
    Number(match[5]), Number(match[6]), Number((match[7] ?? '').padEnd(3, '0').slice(0, 3)));
};
const signalMs = localClock(environment.signal);
const playerStartMs = localClock(environment.playerCreation);
const intervals = [];
const modes = new Map();
const tearing = new Map();
let header;
let clockOffsetMs;
let observed = 0;
let displayed = 0;
let unavailableInterval = 0;
let framesWithoutDisplayTimestamp = 0;
let firstFrameMs;
let lastFrameMs;
let gpuTimeSum = 0;
let gpuTimeCount = 0;
let cpuBusySum = 0;
let cpuBusyCount = 0;
let maxGpuTimeMs = 0;
const stream = createInterface({ input: createReadStream(csvPath, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of stream) {
  if (!line) continue;
  const fields = line.split(',');
  if (!header) { header = fields; header[0] = header[0].replace(/^\uFEFF/, ''); continue; }
  const row = Object.fromEntries(header.map((name, index) => [name, fields[index]]));
  if (row.Application !== 'WarRoom3D.exe' || Number(row.ProcessID) !== environment.playerPid) continue;
  const csvClockMs = localClock(row.TimeInDateTime);
  if (clockOffsetMs === undefined) clockOffsetMs = Math.round((playerStartMs - csvClockMs) / 3600000) * 3600000;
  const timeMs = csvClockMs + clockOffsetMs;
  if (timeMs < signalMs || timeMs >= signalMs + seconds * 1000) continue;
  observed++;
  firstFrameMs ??= timeMs;
  lastFrameMs = timeMs;
  modes.set(row.PresentMode, (modes.get(row.PresentMode) ?? 0) + 1);
  tearing.set(row.AllowsTearing, (tearing.get(row.AllowsTearing) ?? 0) + 1);
  if (row.MsUntilDisplayed === 'NA') framesWithoutDisplayTimestamp++;
  const interval = Number(row.MsBetweenDisplayChange);
  if (Number.isFinite(interval) && interval > 0) { intervals.push(interval); displayed++; }
  else unavailableInterval++;
  const gpu = Number(row.MsGPUTime);
  if (Number.isFinite(gpu) && gpu >= 0) { gpuTimeSum += gpu; gpuTimeCount++; maxGpuTimeMs = Math.max(maxGpuTimeMs, gpu); }
  const cpu = Number(row.MsCPUBusy);
  if (Number.isFinite(cpu) && cpu >= 0) { cpuBusySum += cpu; cpuBusyCount++; }
}
if (!observed || !displayed) throw new Error('PresentMon não capturou frames apresentados do Player na janela solicitada');
intervals.sort((a, b) => a - b);
const percentile = fraction => intervals[Math.ceil(intervals.length * fraction) - 1];
const summary = {
  source: 'PresentMon 2.6.0 ETW', processId: environment.playerPid,
  requestedSeconds: seconds, capturedSpanSeconds: (lastFrameMs - firstFrameMs) / 1000,
  firstFrameLocal: new Date(firstFrameMs).toISOString().replace('Z', ' local-clock'),
  lastFrameLocal: new Date(lastFrameMs).toISOString().replace('Z', ' local-clock'),
  csvClockOffsetHours: clockOffsetMs / 3600000,
  observedPresents: observed, displayedIntervals: displayed, intervalUnavailable: unavailableInterval,
  framesWithoutDisplayTimestamp, presentModes: Object.fromEntries(modes),
  allowsTearing: Object.fromEntries(tearing),
  intervalMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99),
    max: intervals.at(-1), over16_67: intervals.filter(value => value > 16.67).length,
    over33_33: intervals.filter(value => value > 33.33).length },
  gpuTimeMs: { mean: gpuTimeCount ? gpuTimeSum / gpuTimeCount : null, max: maxGpuTimeMs },
  cpuBusyMs: { mean: cpuBusyCount ? cpuBusySum / cpuBusyCount : null },
  fullDuration: lastFrameMs - firstFrameMs >= (seconds - 1) * 1000,
  sourceFile: path.basename(csvPath)
};
const output = path.join(path.dirname(csvPath), 'presentmon-summary.json');
writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ output, ...summary }));
