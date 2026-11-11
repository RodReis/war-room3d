import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [configPath, playerPath, output, name, widthText, heightText, view = 'project', durationText = '30'] = process.argv.slice(2);
const width = Number(widthText), height = Number(heightText), duration = Number(durationText);
if ([configPath, playerPath, output].some(value => !value || !path.isAbsolute(value)) ||
    !/^[A-Za-z0-9_-]{1,40}$/.test(name ?? '') || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
    width < 800 || height < 600 || !['center','project','project-bottom','room','room-opposite','room-reduced'].includes(view) ||
    !Number.isSafeInteger(duration) || duration < 5 || duration > 900) {
  throw new Error('Uso: issue52-player-capture.mjs <service.json> <Player.exe> <saída> <nome> <largura> <altura> [vista] [segundos]');
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.url) || typeof config.token !== 'string' || config.token.length < 32)
  throw new Error('Configuração do serviço local inválida');
if (!existsSync(playerPath)) throw new Error('Player não encontrado');
mkdirSync(output, { recursive:true });
const imagePath = path.join(output, `${name}.png`);
const reportPath = path.join(output, `${name}.json`);
if (existsSync(imagePath) || existsSync(reportPath)) throw new Error('Captura anterior existe; escolha outro nome');
const child = spawn(playerPath, ['-screen-width',String(width),'-screen-height',String(height),'-logFile','-'], {
  env:{...process.env,WR3D_SERVICE_URL:config.url,WR3D_SERVICE_TOKEN:config.token,WR3D_COMMAND_TOKEN:'',
    WR3D_VALIDATION_CAPTURE_DIR:output,WR3D_VALIDATION_CAPTURE_NAME:name,
    WR3D_VALIDATION_VIEW:view,WR3D_VALIDATION_DURATION_SECONDS:String(duration)},
  stdio:'ignore',windowsHide:false
});
const status = await new Promise(resolve => {
  let finished = false;
  const done = value => { if (finished) return; finished = true; clearTimeout(timer); resolve(value); };
  const timer = setTimeout(() => { child.kill(); done({kind:'timeout'}); }, (duration + 45)*1000);
  child.once('error', error => done({kind:'spawn_error',code:error.code}));
  child.once('exit', (code, signal) => done({kind:'exit',code,signal}));
});
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath,'utf8')) : null;
const imageSha256 = existsSync(imagePath) ? createHash('sha256').update(readFileSync(imagePath)).digest('hex') : null;
const result = {status,connected:report?.connected ?? false,view:report?.view ?? null,
  width:report?.imageWidth ?? null,height:report?.imageHeight ?? null,
  sessions:report?.sessionCount ?? null,agents:report?.agentCount ?? null,
  disconnects:report?.disconnectCount ?? null,imageSha256};
process.stdout.write(`${JSON.stringify(result)}\n`);
if (status.kind !== 'exit' || status.code !== 0 || !report?.connected ||
    report.imageWidth !== width || report.imageHeight !== height || !imageSha256) process.exitCode = 1;
