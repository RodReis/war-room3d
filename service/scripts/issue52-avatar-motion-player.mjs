import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const [configPath, playerPath, output] = process.argv.slice(2);
if ([configPath, playerPath, output].some(value => !value || !path.isAbsolute(value)) ||
    !existsSync(configPath) || !existsSync(playerPath))
  throw new Error('Uso: issue52-avatar-motion-player.mjs <service.json> <Player.exe> <saída nova>');
if (existsSync(output) && readdirSync(output).length)
  throw new Error('Saída já contém arquivos; escolha outro diretório');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.url) || typeof config.token !== 'string' || config.token.length < 32)
  throw new Error('Configuração do serviço local inválida');
mkdirSync(output, { recursive: true });
const child = spawn(playerPath, ['-screen-width','1366','-screen-height','768',
  '-logFile',path.join(output,'player.log')], {
  env: { ...process.env, WR3D_SERVICE_URL:config.url, WR3D_SERVICE_TOKEN:config.token,
    WR3D_COMMAND_TOKEN:'', WR3D_ISSUE52_AVATAR_DIR:output },
  stdio:'ignore', windowsHide:false
});
const timer = setTimeout(() => child.kill(), 75000);
const status = await new Promise(resolve => {
  child.once('error', error => resolve({kind:'spawn_error',code:error.code}));
  child.once('exit', (code, signal) => resolve({kind:'exit',code,signal}));
});
clearTimeout(timer);
const resultPath = path.join(output,'result.json');
const report = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath,'utf8')) : null;
process.stdout.write(`${JSON.stringify({status,report})}\n`);
if (status.kind !== 'exit' || status.code !== 0 || report?.status !== 'pass' || report.frames !== 20)
  process.exitCode = 1;
