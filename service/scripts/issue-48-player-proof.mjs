import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/store/event-store.ts';
import { startReadOnlyServer } from '../src/http/server.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const player = process.env.WR3D_PLAYER_PATH ?? path.join(root, 'unity/Builds/WarRoom3D-Quartel/WarRoom3D.exe');
const captureDir = process.argv[2] ?? path.join(root, 'Logs/issue-48-player');
const name = 'issue-48-two-rooms';
const imagePath = path.join(captureDir, `${name}.png`);
const reportPath = path.join(captureDir, `${name}.json`);
if (!existsSync(player)) throw new Error('Build Windows quartel não encontrado');
if (existsSync(imagePath) || existsSync(reportPath)) throw new Error('Prova anterior existe; escolha outro diretório');
mkdirSync(captureDir, { recursive: true });

const store = new EventStore(':memory:');
let server, child, timer;
try {
  for (const [projectId, drive] of [['atlas','C'],['orion','D']])
    store.registerProject({projectId,name:'API',canonicalPath:`${drive}:\\Projetos\\api`});
  store.reconcileSessionSourceBindings(['atlas','orion'].map(projectId => ({
    sourceId:`fonte-${projectId}`,sourceVersion:'fixture-48',provider:'claude',projectId,
    accountRef:'conta-sintetica',filePath:`C:\\fixture\\${projectId}.jsonl`
  })));
  let index = 0;
  for (const projectId of ['atlas','orion']) {
    index++;
    const sourceId = `fonte-${projectId}`;
    const observedAt = new Date(Date.now() + index).toISOString();
    store.apply({schemaVersion:'1.0',eventId:`abertura-${projectId}`,sourceId,sourceEventId:`abertura-${projectId}`,
      sourceVersion:'fixture-48',type:'workspace.opened',observedAt,receivedAt:observedAt,projectId,
      provenance:'observed',ingestionMode:'live',payload:{workspaceKey:`janela-${projectId}`},evidenceRefs:[]},
      {sourceId,fileKey:'fixture',generation:1,offset:1});
  }
  const snapshot = store.snapshot();
  if (snapshot.roomPlacements.length !== 2 || snapshot.roomPlacements.some(item => item.status !== 'active'))
    throw new Error('Fixture não produziu duas salas ativas');
  const token = randomBytes(32).toString('hex');
  const started = await startReadOnlyServer(store, token);
  server = started.server;
  const status = await new Promise(resolve => {
    child = spawn(player, ['-screen-width','1280','-screen-height','720','-logFile','-'], {
      env:{...process.env,WR3D_SERVICE_URL:started.url,WR3D_SERVICE_TOKEN:token,
        WR3D_VALIDATION_CAPTURE_DIR:captureDir,WR3D_VALIDATION_CAPTURE_NAME:name,WR3D_VALIDATION_VIEW:'project',
        WR3D_COMMAND_TOKEN:''},stdio:'ignore'
    });
    child.on('error',error=>resolve({kind:'spawn_error',code:error.code}));
    child.on('exit',(code,signal)=>resolve({kind:'exit',code,signal}));
    timer = setTimeout(()=>resolve({kind:'timeout'}),45000);
  });
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath,'utf8')) : null;
  const result = {status,projectIds:snapshot.roomPlacements.map(item=>item.projectId),
    sectors:snapshot.roomPlacements.map(item=>item.sectorId),imageExists:existsSync(imagePath),report};
  console.log(JSON.stringify(result));
  if (status.kind !== 'exit' || status.code !== 0 || !result.imageExists || !report?.connected ||
      report.view !== 'project' || report.imageWidth !== 1280 || report.imageHeight !== 720) process.exitCode = 1;
} finally {
  if (timer) clearTimeout(timer);
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => { child.once('exit',resolve); setTimeout(resolve,3000); });
  }
  if (server) await new Promise(resolve => server.close(resolve));
  store.close();
}
