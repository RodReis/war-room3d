import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const service = process.argv[2];
if (!['blender', 'tripo'].includes(service)) {
  throw new Error('Uso: node tools/mcp-smoke.mjs blender|tripo');
}

const command = service === 'blender'
  ? { file: 'uvx', args: ['mcp-for-blender'] }
  : process.platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/s', '/c', path.join(process.env.APPDATA, 'npm', 'tripo.cmd') + ' mcp'] }
    : { file: 'tripo', args: ['mcp'] };
const child = spawn(command.file, command.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
const pending = new Map();
let buffer = '';
let sequence = 0;
let stderr = '';

child.stdout.setEncoding('utf8');
child.stdout.on('data', chunk => {
  buffer += chunk;
  for (let newline = buffer.indexOf('\n'); newline >= 0; newline = buffer.indexOf('\n')) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    try {
      const message = JSON.parse(line);
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        request.resolve(message);
      }
    } catch { /* Diagnostic text is not an MCP response. */ }
  }
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });

function request(method, params = {}, timeoutMs = 20000) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout em ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve: message => { clearTimeout(timer); resolve(message); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', error => {
      if (!error) return;
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    });
  });
}

try {
  const initialized = await request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'war-room3d-smoke', version: '1.0' }
  });
  if (initialized.error) throw new Error(`initialize: ${initialized.error.message}`);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listed = await request('tools/list');
  if (listed.error) throw new Error(`tools/list: ${listed.error.message}`);
  const names = listed.result?.tools?.map(tool => tool.name) ?? [];
  const result = { service, server: initialized.result?.serverInfo, tools: names };
  if (process.argv.includes('--schemas')) {
    result.schemas = listed.result?.tools?.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema })) ?? [];
  }
  if (service === 'blender' && names.includes('get_scene_info')) {
    const scene = await request('tools/call', { name: 'get_scene_info', arguments: { limit: 4 } });
    result.sceneReadSucceeded = !scene.error && !scene.result?.isError;
    result.sceneReadType = scene.result?.content?.[0]?.type ?? null;
  }
  const codeFileIndex = process.argv.indexOf('--code-file');
  if (service === 'blender' && codeFileIndex >= 0) {
    const codePath = process.argv[codeFileIndex + 1];
    if (!codePath) throw new Error('Informe o arquivo após --code-file');
    const outputDirIndex = process.argv.indexOf('--output-dir');
    const outputDir = outputDirIndex >= 0 ? process.argv[outputDirIndex + 1] : null;
    let code = await readFile(codePath, 'utf8');
    if (code.includes('__OUTPUT_DIR__')) {
      if (!outputDir) throw new Error('Informe --output-dir para o script de arte');
      code = code.replaceAll('__OUTPUT_DIR__', JSON.stringify(path.resolve(outputDir)));
    }
    const executed = await request('tools/call', {
      name: 'execute_blender_code',
      arguments: { code, user_prompt: 'Ensaio local de peça modular sintética M0; sem conteúdo externo.' }
    }, 120000);
    if (executed.error || executed.result?.isError) {
      throw new Error(`execute_blender_code: ${JSON.stringify(executed.error ?? executed.result?.content).slice(0, 1000)}`);
    }
    result.codeExecution = executed.result?.content?.filter(item => item.type === 'text').map(item => item.text).join('\n').slice(0, 3000);
    if (result.codeExecution.startsWith('Error executing code:')) {
      throw new Error(result.codeExecution.slice(0, 1000));
    }
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ service, error: error.message, stderr: stderr.split('\n').slice(-2) }));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  child.kill();
  child.stdout.destroy();
  child.stderr.destroy();
  await Promise.race([once(child, 'exit').catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
}
