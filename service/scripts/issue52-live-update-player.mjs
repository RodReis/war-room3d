import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const [configPath, playerPath, output, changedProject = 'issue52-arenahub',
  stableProject = 'issue52-forjaos'] = process.argv.slice(2);
if ([configPath, playerPath, output].some(value => !value || !path.isAbsolute(value)) ||
    !existsSync(configPath) || !existsSync(playerPath) ||
    !['issue52-arenahub', 'issue52-forjaos'].includes(changedProject) ||
    !['issue52-arenahub', 'issue52-forjaos'].includes(stableProject) || changedProject === stableProject)
  throw new Error('Uso: issue52-live-update-player.mjs <service.json> <Player.exe> <saída nova> [projeto alterado] [projeto estável]');
if (existsSync(output) && readdirSync(output).length)
  throw new Error('Saída já contém arquivos; escolha outro diretório');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.url) || typeof config.token !== 'string' || config.token.length < 32)
  throw new Error('Configuração do serviço local inválida');
mkdirSync(output, { recursive: true });
const child = spawn(playerPath, ['-screen-width', '1366', '-screen-height', '768',
  '-logFile', path.join(output, 'player.log')], {
  env: { ...process.env, WR3D_SERVICE_URL:config.url, WR3D_SERVICE_TOKEN:config.token,
    WR3D_COMMAND_TOKEN:'', WR3D_ISSUE52_WATCH_DIR:output,
    WR3D_ISSUE52_CHANGED_PROJECT:changedProject,
    WR3D_ISSUE52_STABLE_PROJECT:stableProject },
  windowsHide:false, stdio:'ignore'
});
let finished = false;
const status = new Promise(resolve => {
  child.once('error', error => { finished = true; resolve({kind:'spawn_error',code:error.code}); });
  child.once('exit', (code, signal) => { finished = true; resolve({kind:'exit',code,signal}); });
});
const ready = path.join(output, 'ready');
for (let elapsed = 0; elapsed < 40 && !finished && !existsSync(ready); elapsed++)
  await new Promise(resolve => setTimeout(resolve, 1000));
if (!existsSync(ready)) {
  child.kill();
  throw new Error('Player não produziu baseline em 40 segundos');
}
process.stdout.write(`PLAYER_READY pid=${child.pid} output=${output}\n`);
const timer = setTimeout(() => child.kill(), 340000);
const result = await status;
clearTimeout(timer);
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.kind !== 'exit' || result.code !== 0 || !existsSync(path.join(output, 'result.json')) ||
    JSON.parse(readFileSync(path.join(output, 'result.json'), 'utf8')).status !== 'pass') process.exitCode = 1;
