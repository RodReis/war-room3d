import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';
import { SessionFileCollector } from '../src/sessions/file-source.ts';
import { normalizeProjectPath } from '../src/domain/identity.ts';

// Read-only local lab. The ArenaHub source is already sanitized; copy only records
// appended after the approved baseline so an older session cannot count for #52.
const [output, arenaSource, arenaProject, codexSource, codexProject, baselineText, prefixHash] = process.argv.slice(2);
const baseline = Number(baselineText);
if (!output || !arenaSource || !arenaProject || !codexSource || !codexProject || !prefixHash ||
    [output, arenaSource, arenaProject, codexSource, codexProject].some(value => !path.isAbsolute(value)) ||
    !Number.isSafeInteger(baseline) || baseline < 0 || !/^[a-fA-F0-9]{64}$/.test(prefixHash)) {
  throw new Error('Uso: issue52-live-lab.ts <saída> <spool Claude> <projeto ArenaHub> <spool Codex> <projeto ForjaOS> <bytes-base> <sha256-prefixo>');
}

mkdirSync(output, { recursive: true });
const arenaCopy = path.join(output, 'arena-new.ndjson');
const offsetFile = path.join(output, 'arena-offset.txt');
if (existsSync(arenaCopy) !== existsSync(offsetFile)) throw new Error('Cópia e cursor ArenaHub divergentes');
if (!existsSync(arenaCopy)) {
  writeFileSync(arenaCopy, '', { mode:0o600, flag:'wx' });
  writeFileSync(offsetFile, String(baseline), { mode:0o600, flag:'wx' });
}
let offset = existsSync(offsetFile) ? Number(readFileSync(offsetFile, 'utf8')) : baseline;
if (!Number.isSafeInteger(offset) || offset < baseline) throw new Error('Cursor ArenaHub inválido');
const arenaHash = createHash('sha256').update(normalizeProjectPath(arenaProject)).digest('hex');
const acceptedSessions = new Set<string>();
for (const line of readFileSync(arenaCopy, 'utf8').split('\n').filter(Boolean)) {
  const record = JSON.parse(line) as {hook_event_name?:unknown;session_id?:unknown;source?:unknown};
  if (record.hook_event_name === 'SessionStart' && record.source === 'startup' && typeof record.session_id === 'string')
    acceptedSessions.add(record.session_id);
}
const store = new EventStore(path.join(output, 'state.sqlite'));
const sources = [
  { sourceId:'issue52-claude-arenahub', sourceVersion:'2.1.322', provider:'claude' as const,
    projectId:'issue52-arenahub', accountRef:'vscode-local', filePath:arenaCopy, staleAfterMs:600000 },
  { sourceId:'issue52-codex-forjaos', sourceVersion:'0.167.0-alpha.4.1', provider:'codex' as const,
    projectId:'issue52-forjaos', accountRef:'vscode-local', filePath:codexSource, staleAfterMs:600000 }
];
store.configureSessionSources([
  {projectId:'issue52-arenahub', name:'ArenaHub', canonicalPath:arenaProject},
  {projectId:'issue52-forjaos', name:'ForjaOS', canonicalPath:codexProject}
], sources);
const collector = new SessionFileCollector(store, sources);
function tailArena(): void {
  let bytes: Buffer;
  try { bytes = readFileSync(arenaSource); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (bytes.length < offset || createHash('sha256').update(bytes.subarray(0, baseline)).digest('hex').toLowerCase() !== prefixHash.toLowerCase())
    throw new Error('Spool ArenaHub foi substituído ou truncado; não reutilizar o baseline');
  const added = bytes.subarray(offset);
  const lastLine = added.lastIndexOf(10);
  if (lastLine >= 0) {
    const complete = added.subarray(0, lastLine + 1);
    const accepted = complete.toString('utf8').split('\n').slice(0,-1).filter(line => {
      const record = JSON.parse(line) as {cwdHash?:unknown;hook_event_name?:unknown;session_id?:unknown;source?:unknown};
      if (record.cwdHash !== arenaHash || typeof record.session_id !== 'string') return false;
      if (record.hook_event_name === 'SessionStart' && record.source === 'startup') acceptedSessions.add(record.session_id);
      return acceptedSessions.has(record.session_id);
    });
    if (accepted.length) appendFileSync(arenaCopy, `${accepted.join('\n')}\n`, { flag:'a', mode:0o600 });
    offset += lastLine + 1;
    writeFileSync(offsetFile, String(offset), { mode:0o600 });
  }
}
const token = randomBytes(32).toString('hex');
const service = await startReadOnlyServer(store, token);
writeFileSync(path.join(output, 'service.json'), JSON.stringify({url:service.url, token}), { mode:0o600 });
let failed = false;
const poll = (): void => {
  if (failed) return;
  try { tailArena(); collector.poll(); }
  catch (error) { failed = true; process.stderr.write(`LAB_ERROR ${error instanceof Error ? error.message : 'erro'}\n`); }
};
poll();
const timer = setInterval(poll, 500);
process.stdout.write(`LAB_READY ${service.url}\n`);
process.on('SIGINT', () => {
  clearInterval(timer);
  service.server.close(() => { store.close(); process.exit(failed ? 1 : 0); });
});
