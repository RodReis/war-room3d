import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const directory = process.argv[2];
if (!directory) throw new Error('Informe o diretório dos artefatos M2');
const readJsonl = name => gunzipSync(readFileSync(path.join(directory, name)))
  .toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const accepted = readJsonl('accepted-600s.jsonl.gz');
const trace = readJsonl('trace-600s.jsonl.gz');
const expected = JSON.parse(readFileSync(path.join(directory, 'metrics-600s.json'), 'utf8'));
assert.equal(accepted.length, expected.acceptedEvents);
assert.equal(trace.length, expected.renderTraceCount);
for (const items of [accepted, trace])
  for (let index = 0; index < items.length; index++) {
    assert(Number.isSafeInteger(items[index].sequence) && items[index].sequence >= 0);
    assert(Number.isSafeInteger(items[index].utcUnixMs ?? items[index].acceptedUtcUnixMs));
    if (index > 0) assert(items[index].sequence > items[index - 1].sequence);
  }
const latencies = [];
let traceIndex = 0;
for (const event of accepted) {
  while (traceIndex < trace.length && trace[traceIndex].sequence < event.sequence) traceIndex++;
  if (traceIndex === trace.length) break;
  latencies.push(trace[traceIndex].utcUnixMs - event.acceptedUtcUnixMs);
}
latencies.sort((a, b) => a - b);
const percentile = fraction => latencies[Math.ceil(latencies.length * fraction) - 1];
const actual = {
  sequenceCoveredEvents: latencies.length,
  p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
  maxMs: latencies.at(-1), over2s: latencies.filter(value => value > 2000).length
};
assert.equal(actual.sequenceCoveredEvents, expected.sequenceCoveredEvents);
for (const key of ['p50Ms', 'p95Ms', 'p99Ms', 'maxMs', 'over2s'])
  assert.equal(actual[key], expected.latency[key], `Métrica divergente: ${key}`);
console.log(JSON.stringify(actual));
