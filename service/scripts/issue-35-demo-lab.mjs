// Inspeciona a cena ilustrativa no mesmo build candidato G4, sem serviço ou comando.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [mode, playerPath, outputPath] = process.argv.slice(2);
if (mode !== '--run') {
  console.log(JSON.stringify({ executes: false, scene: 'QuartelM0', source: 'local-illustrative',
    commandCredential: false, timeoutMs: 30000 }));
  process.exit(0);
}
if (!playerPath || !path.isAbsolute(playerPath) || !existsSync(playerPath) ||
    !outputPath || !path.isAbsolute(outputPath))
  throw new Error('Informe caminhos absolutos do Player e da pasta de saída');
const resultPath = path.join(outputPath, 'demo-result.json');
if (existsSync(resultPath)) throw new Error('Prova anterior existe; use diretório novo');
mkdirSync(outputPath, { recursive: true });
let player;
try {
  const outcome = await new Promise(resolve => {
    player = spawn(playerPath, ['-screen-width', '1280', '-screen-height', '720',
      '-screen-fullscreen', '0', '-logFile', path.join(outputPath, 'player.log')],
    { env: { ...process.env, WR3D_35_DEMO_PROOF_DIR: outputPath,
      WR3D_35_PROOF_DIR: '', WR3D_VALIDATION_CAPTURE_DIR: '', WR3D_SERVICE_URL: '',
      WR3D_SERVICE_TOKEN: '', WR3D_COMMAND_TOKEN: '' }, stdio: 'ignore' });
    const timer = setTimeout(() => { player.kill(); resolve({ timeout: true }); }, 30000);
    player.once('exit', code => { clearTimeout(timer); resolve({ code }); });
    player.once('error', error => { clearTimeout(timer); resolve({ error: error.code }); });
  });
  const report = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : null;
  const result = { outcome, report, output: outputPath };
  console.log(JSON.stringify(result));
  if (outcome.code !== 0 || report?.status !== 'pass') process.exitCode = 1;
} finally {
  if (player && player.exitCode === null) player.kill();
}
