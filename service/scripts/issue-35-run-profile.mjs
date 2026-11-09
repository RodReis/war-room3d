// Mede um perfil por vez no Player visível. Sem --run apenas descreve o ensaio.
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, profile, playerPath, outputPath, secondsText] = process.argv.slice(2);
if (mode !== '--run') {
  console.log(JSON.stringify({ executes: false, profiles: ['visual', 'reduced', 'sector'],
    seconds: 600, events: 7000, presentMon: '2.6.0', playerVisible: true }));
  process.exit(0);
}
if (!['visual', 'reduced', 'sector'].includes(profile) || !playerPath || !path.isAbsolute(playerPath) ||
    !existsSync(playerPath) || !outputPath || !path.isAbsolute(outputPath) || existsSync(outputPath))
  throw new Error('Informe perfil, Player absoluto e diretório de saída novo/absoluto');
const seconds = Number(secondsText ?? 600);
if (!Number.isSafeInteger(seconds) || seconds < 5 || seconds > 600)
  throw new Error('Duração deve estar entre 5 e 600 s');
const presentMonPath = process.env.WR3D_PRESENTMON_PATH;
if (!presentMonPath || !path.isAbsolute(presentMonPath) || !existsSync(presentMonPath))
  throw new Error('WR3D_PRESENTMON_PATH 2.6.0 não encontrado');
const root = fileURLToPath(new URL('../../', import.meta.url));
mkdirSync(outputPath, { recursive: true });
const signalPath = path.join(outputPath, 'start.signal');
const csvPath = path.join(outputPath, 'presentmon.csv');
const monitorStdout = createWriteStream(path.join(outputPath, 'presentmon.out.txt'));
const monitorStderr = createWriteStream(path.join(outputPath, 'presentmon.err.txt'));
const proofStdout = createWriteStream(path.join(outputPath, 'proof.out.txt'));
const proofStderr = createWriteStream(path.join(outputPath, 'proof.err.txt'));
let monitor, proof, memoryTimer;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const finished = child => new Promise(resolve => {
  child.once('exit', (code, signal) => resolve({ code, signal }));
  child.once('error', error => resolve({ error: error.code }));
});
const localStamp = date => date.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false })
  .replace(' ', 'T') + '.' + String(date.getUTCMilliseconds()).padStart(3, '0') + '-03:00';
const playerProcesses = () => {
  const value = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    'Get-CimInstance Win32_Process -Filter "Name = \'WarRoom3D.exe\'" | ForEach-Object { [pscustomobject]@{ ProcessId = $_.ProcessId; CreationDate = $_.CreationDate.ToString("o"); ExecutablePath = $_.ExecutablePath } } | ConvertTo-Json -Compress'],
  { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
  if (!value) return [];
  const parsed = JSON.parse(value);
  return (Array.isArray(parsed) ? parsed : [parsed]).filter(item =>
    path.resolve(item.ExecutablePath ?? '').toLowerCase() === path.resolve(playerPath).toLowerCase());
};
try {
  proof = spawn(process.execPath, [path.join(root, 'service/scripts/m2-performance-proof.mjs'), String(seconds)],
  { cwd: root, env: { ...process.env, WR3D_REFERENCE_PROFILE: profile,
    WR3D_CAPTURE_DIR: outputPath, WR3D_PLAYER_PATH: playerPath,
    WR3D_VALIDATION_START_SIGNAL: signalPath, WR3D_35_PROOF_DIR: '',
    WR3D_35_DEMO_PROOF_DIR: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  proof.stdout.pipe(proofStdout); proof.stderr.pipe(proofStderr);
  const proofExit = finished(proof);
  let playerInfo;
  const readyUntil = Date.now() + 180000;
  while (Date.now() < readyUntil) {
    if (proof.exitCode !== null) throw new Error('Prova/Player encerrou antes do sinal');
    const screenshot = readdirSync(outputPath).some(name => name.startsWith(`performance-${seconds}s-`) && name.endsWith('.png'));
    if (screenshot) {
      playerInfo = playerProcesses()[0];
      if (playerInfo?.ProcessId) break;
    }
    await sleep(500);
  }
  if (!playerInfo?.ProcessId) throw new Error('Player visível/screenshot não confirmado antes do sinal');
  const sessionName = `WR3D35${profile}${Date.now().toString(36)}`;
  monitor = spawn(presentMonPath, ['--process_name', 'WarRoom3D.exe', '--output_file', csvPath,
    '--date_time', '--no_console_stats', '--no_track_input', '--timed', String(seconds + 80), '--terminate_after_timed',
    '--set_circular_buffer_size', '8192', '--session_name', sessionName],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  monitor.stdout.pipe(monitorStdout); monitor.stderr.pipe(monitorStderr);
  const monitorExit = finished(monitor);
  await sleep(2000);
  if (monitor.exitCode !== null || proof.exitCode !== null) throw new Error('PresentMon/Player encerrou antes do sinal');
  const videoText = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    'Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentRefreshRate | ConvertTo-Json -Compress'],
  { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
  const video = videoText ? JSON.parse(videoText) : [];
  const environment = { playerPid: playerInfo.ProcessId, playerCreation: playerInfo.CreationDate,
    presentmonPid: monitor.pid, video: Array.isArray(video) ? video : [video],
    signal: localStamp(new Date()), physicalDpi: 'verificado separadamente', build: playerPath };
  environment.playerCreation = localStamp(new Date(playerInfo.CreationDate));
  writeFileSync(path.join(outputPath, 'environment.json'), JSON.stringify(environment, null, 2));
  writeFileSync(signalPath, '1');
  memoryTimer = setTimeout(() => {
    try {
      const bytes = execFileSync('powershell.exe', ['-NoProfile', '-Command',
        `(Get-Process -Id ${Number(playerInfo.ProcessId)}).WorkingSet64`],
      { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
      environment.processWorkingSetPointInTimeBytes = Number(bytes);
      environment.memoryObservedAt = localStamp(new Date());
      writeFileSync(path.join(outputPath, 'environment.json'), JSON.stringify(environment, null, 2));
    } catch { environment.processWorkingSetPointInTimeBytes = null; }
  }, Math.max(1, seconds - 30) * 1000);
  console.log(JSON.stringify({ profile, output: outputPath, playerPid: playerInfo.ProcessId,
    presentmonPid: monitor.pid, signal: environment.signal }));
  const proofResult = await proofExit;
  if (proofResult.code !== 0) throw new Error(`Prova RNF-01/Player falhou: ${JSON.stringify(proofResult)}`);
  const monitorResult = await monitorExit;
  if (monitorResult.code !== 0) throw new Error(`PresentMon falhou: ${JSON.stringify(monitorResult)}`);
  const analyzed = execFileSync(process.execPath, [path.join(root, 'service/scripts/presentmon-analyze.mjs'),
    csvPath, path.join(outputPath, 'environment.json'), String(seconds)],
  { encoding: 'utf8', timeout: 120000, windowsHide: true });
  const external = JSON.parse(analyzed);
  const summaryName = readdirSync(outputPath).find(name => name.startsWith(`performance-${seconds}s-`) && name.endsWith('.summary.json'));
  const internal = summaryName ? JSON.parse(readFileSync(path.join(outputPath, summaryName), 'utf8')) : null;
  const result = { profile, build: playerPath, durationSeconds: seconds,
    acceptedEvents: internal?.acceptedEvents ?? null, coveredEvents: internal?.sequenceCoveredEvents ?? null,
    propagationP95Ms: internal?.latency?.p95Ms ?? null, presentP95Ms: external.intervalMs.p95,
    presentIntervalUnavailable: external.intervalUnavailable, fullDuration: external.fullDuration,
    processWorkingSetPointInTimeBytes: environment.processWorkingSetPointInTimeBytes ?? null,
    presentWithinTarget: external.intervalMs.p95 <= (profile === 'reduced' ? 33.33 : 16.67),
    validity: internal?.validity ?? null };
  writeFileSync(path.join(outputPath, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  const expectedEvents = seconds * 10 + 1000;
  if (!result.fullDuration || !result.presentWithinTarget || result.acceptedEvents !== expectedEvents ||
      result.coveredEvents !== expectedEvents || !Object.values(result.validity ?? {}).every(Boolean)) process.exitCode = 1;
} finally {
  if (memoryTimer) clearTimeout(memoryTimer);
  if (proof && proof.exitCode === null) proof.kill();
  if (monitor && monitor.exitCode === null) monitor.kill();
  for (const stream of [monitorStdout, monitorStderr, proofStdout, proofStderr]) stream.end();
}
