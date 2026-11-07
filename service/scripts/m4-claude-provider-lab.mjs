// Ensaio opt-in de uma sessão NOVA. Sem --run, só mostra o plano; não inicia o CLI.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonlChannel } from '../src/commands/providers/jsonl-channel.ts';
import { createClaudeMessageAdapter } from '../src/commands/providers/claude.ts';
import { sessionKey } from '../src/domain/identity.ts';

const version = '2.1.319';
const prompt = 'Teste sintético War-Room3D M4. Não use ferramentas. Responda somente WR3D_M4_ACK.';
const binary = process.env.WR3D_CLAUDE_CLI_PATH ?? path.join(homedir(), '.local', 'bin', 'claude.exe');
const root = fileURLToPath(new URL('../../', import.meta.url));
const sessionId = randomUUID();
const args = ['--print', '--safe-mode', '--restricted', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
  '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--no-session-persistence', '--session-id', sessionId,
  '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--replay-user-messages', '--max-budget-usd', '0.10'];
const plan = {provider: 'claude', providerVersion: version, binary, newSession: true, existingSessions: false,
  syntheticPrompt: prompt, userMessages: 1, maxBudgetUsd: 0.10, tools: [], hooks: 'safe-mode', mcpServers: [],
  sessionPersistence: false, timeoutMs: 30000, sendsRealMessage: process.argv.includes('--run')};
if (!process.argv.includes('--run')) {
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
} else {
  const checked = spawnSync(binary, ['--version'], {encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8192});
  if (checked.status !== 0 || !checked.stdout.startsWith(version + ' ')) throw new Error('provider_version_unverified');
  const directory = path.join(root, 'Logs', 'm4-claude-real-' + randomUUID());
  mkdirSync(directory, {recursive: true});
  const commandId = 'command-' + randomUUID();
  const owner = {provider: 'claude', providerVersion: version, projectId: 'm4-authorized-lab', accountRef: 'authorized-local-cli',
    providerSessionId: sessionId, connectionId: 'connection-' + randomUUID()};
  const localKey = sessionKey(owner.provider, owner.accountRef, owner.providerSessionId);
  const ledger = path.join(directory, 'audit.jsonl');
  const log = state => appendFileSync(ledger, JSON.stringify({at: new Date().toISOString(), commandId, provider: owner.provider,
    providerVersion: version, sessionKey: localKey, payloadRef: 'sha256:' + createHash('sha256').update(prompt).digest('hex'), state}) + '\n');
  log('requested');
  const child = spawn(binary, args, {cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
  let bootstrapError = false;
  child.on('error', () => { bootstrapError = true; });
  child.stderr.on('data', () => { /* Sem gravar saída bruta, credenciais ou caminhos pessoais. */ });
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', () => resolve(null)); });
  const channel = new JsonlChannel({input: child.stdin, output: child.stdout, connectionId: owner.connectionId, timeoutMs: 30000});
  const adapter = createClaudeMessageAdapter(owner, channel);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let state = 'unknown';
  try {
    log('sending');
    const receipt = await adapter.send({schemaVersion: '1.0', commandId, idempotencyKey: 'key-' + randomUUID(), mode: 'live', projectId: owner.projectId,
      sessionKey: localKey, provider: owner.provider, providerVersion: version, action: 'send_message', requestId: null,
      deadlineAt: new Date(Date.now() + 30000).toISOString(), payload: {text: prompt}, confirmationId: null}, controller.signal);
    state = receipt.status;
  } catch { /* Ausência de recibo é incerta. Nunca tentar novamente com esta intenção. */ }
  finally {
    clearTimeout(timer);
    try { log(state); }
    finally {
      channel.close();
      child.stdin.end();
      child.kill();
      await exited;
    }
  }
  const report = {...plan, binary: path.basename(binary), sessionKey: localKey, state, bootstrapError, inferenceCompletion: 'not_asserted',
    permissionAndQuestion: 'unavailable', automaticRetry: false};
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify({directory, state, bootstrapError, automaticRetry: false}) + '\n');
  if (state !== 'confirmed' || bootstrapError) process.exitCode = 1;
}
