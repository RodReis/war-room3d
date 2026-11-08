// Diagnóstico de bootstrap: não cria thread nem envia mensagem.
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCodexOverrides, inspectCodexConfig, usingCodexAppServer } from './m4-codex-provider-lab.mjs';

const project=mkdtempSync(path.join(tmpdir(),'wr3d-33-codex-inspect-'));
const binary=process.env.WR3D_CODEX_CLI_PATH??path.join(process.env.APPDATA??'','npm','node_modules','@openai',
  'codex','node_modules','@openai','codex-win32-x64','vendor','x86_64-pc-windows-msvc','bin','codex.exe');
const version=spawnSync(binary,['--version'],{cwd:project,windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:8192});
if(version.status!==0||version.stdout.trim()!=='codex-cli 0.166.0')throw new Error('provider_version_unverified');
const report={version:'0.166.0',threadStarted:false,messageSent:false,inventoryCount:null,stopped:null,
  stdoutBytes:0,stderrBytes:0,stages:[],failureCode:null};
try{
  const inventory=await usingCodexAppServer({binary,overrides:buildCodexOverrides([],project),cwd:project,
    timeoutMs:30000,onStopped:value=>{report.stopped=value;},
    onDiagnostics:value=>{report.stdoutBytes=value.stdoutBytes;report.stderrBytes=value.stderrBytes;}},
    options=>inspectCodexConfig({...options,onProgress:value=>report.stages.push(value)}));
  report.inventoryCount=inventory.length;
}catch(error){report.failureCode=error instanceof Error?error.message:'inspect_failed';}
process.stdout.write(JSON.stringify(report)+'\n');
if(report.failureCode)process.exitCode=1;
