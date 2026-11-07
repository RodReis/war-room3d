// Laboratório opt-in. Sem --run não lê configuração, conta ou sessão e não inicia CLI.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JsonlChannel } from '../src/commands/providers/jsonl-channel.ts';
import { createCodexMessageAdapter } from '../src/commands/providers/codex.ts';
import { sessionKey } from '../src/domain/identity.ts';

export const disabledFeatures = Object.freeze(['hooks', 'apps', 'plugins', 'remote_plugin', 'plugin_discovery_prefetch',
  'plugin_sharing', 'memories', 'multi_agent', 'multi_agent_v2', 'shell_tool', 'shell_snapshot',
  'browser_use', 'computer_use', 'in_app_browser', 'image_generation', 'view_image', 'code_mode', 'code_mode_host',
  'goals', 'tool_suggest', 'skill_search', 'skill_mcp_dependency_install', 'request_permissions_tool', 'daemon_auto_start']);
export const codexLabPlan = Object.freeze({provider: 'codex', providerVersion: '0.166.0', newSession: true,
  existingSessions: false, userMessages: 1, syntheticPrompt: 'Teste sintético War-Room3D M4. Não use ferramentas. Responda somente WR3D_M4_ACK.',
  sendsRealMessage: false, disabledFeatures, mcpServers: 'each_inherited_server_explicitly_disabled_and_rechecked',
  sandbox: 'read-only', approvalPolicy: 'never', internalTools: 'may_remain_available_under_read_only_sandbox',
  maxBudgetUsd: null, cost: 'unmeasured_uses_current_cli_account_quota', metadataTimeoutMs: 10000,
  inspectionTimeoutMs: 10000, sessionTimeoutMs: 30000, appServerProcesses: 2, automaticRetry: false, inferenceCompletion: 'not_asserted'});

export function buildCodexOverrides(inventory, cwd) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('inventory_unverified');
  if (!Array.isArray(inventory) || inventory.length > 256 || inventory.some(server => !server ||
      typeof server.name !== 'string' || !server.name.length || server.name.length > 128 || /[\x00-\x1f\x7f]/.test(server.name)))
    throw new Error('inventory_unverified');
  const values = [...disabledFeatures.map(name => `features.${name}=false`), 'features.skip_host_skill_discovery=true',
    'web_search="disabled"', 'approval_policy="never"', 'sandbox_mode="read-only"', 'project_doc_max_bytes=0',
    'developer_instructions=""', 'notify=[]', 'model_provider="openai"', 'history.persistence="none"', 'analytics.enabled=false',
    `sqlite_home=${JSON.stringify(path.join(cwd, 'state'))}`, `log_dir=${JSON.stringify(path.join(cwd, 'log'))}`,
    'experimental_thread_store={type="in_memory",id="wr3d-m4-codex-lab"}',
    'otel.exporter="none"', 'otel.trace_exporter="none"', 'otel.log_user_prompt=false',
    // O CLI divide caminhos em pontos literais; IDs citados só funcionam dentro do valor TOML.
    'mcp_servers={' + inventory.map(server => `${JSON.stringify(server.name)}={enabled=false}`).join(',') + '}'];
  return values.flatMap(value => ['-c', value]);
}

function assertIsolation(config, cwd) {
  if (!config || disabledFeatures.some(name => config.features?.[name] !== false) || config.features?.skip_host_skill_discovery !== true ||
      config.web_search !== 'disabled' || config.approval_policy !== 'never' || config.sandbox_mode !== 'read-only' ||
      config.project_doc_max_bytes !== 0 || config.developer_instructions !== '' || config.model_provider !== 'openai' ||
      !Array.isArray(config.notify) || config.notify.length || config.model_instructions_file || config.instructions ||
      config.history?.persistence !== 'none' || config.analytics?.enabled !== false || !config.mcp_servers ||
      config.sqlite_home !== path.join(cwd, 'state') || config.log_dir !== path.join(cwd, 'log') ||
      config.experimental_thread_store?.type !== 'in_memory' || config.experimental_thread_store_endpoint ||
      config.otel?.exporter !== 'none' || config.otel?.trace_exporter !== 'none' || config.otel?.log_user_prompt !== false ||
      typeof config.mcp_servers !== 'object' || Array.isArray(config.mcp_servers) ||
      Object.values(config.mcp_servers).some(server => !server || server.enabled !== false)) throw new Error('isolation_unverified');
}

async function readConfig({channel, cwd, signal, notify, onProgress = () => {}}) {
  let observedRequests = 0;
  const rpc = async (method, params) => {
    const id = 'lab-' + randomUUID();
    onProgress(method + ':requested');
    let reply;
    try { reply = await channel.exchange({id, method, params}, frame => {
      if (typeof frame.method === 'string' && Object.hasOwn(frame, 'id') && observedRequests++ < 8) {
        const kind = frame.method === 'account/chatgptAuthTokens/refresh' ? 'auth_refresh' :
          frame.method === 'attestation/generate' ? 'attestation' : 'other';
        onProgress('server_request_unhandled:' + kind);
      }
      return frame.id === id && !Object.hasOwn(frame, 'method');
    }, signal); }
    catch { throw new Error('bootstrap_unconfirmed'); }
    if (Object.hasOwn(reply, 'error') || !reply.result || typeof reply.result !== 'object' || Array.isArray(reply.result))
      throw new Error('bootstrap_unconfirmed');
    onProgress(method + ':received');
    return reply.result;
  };
  await rpc('initialize', {clientInfo: {name: 'war-room3d-m4-lab', version: '1.0.0'}});
  notify({method: 'initialized'});
  const {config} = await rpc('config/read', {cwd, includeLayers: false});
  return {config, rpc};
}

// Sem thread ou consulta a status/autenticação de servidores MCP.
export async function inspectCodexConfig(options) {
  const {config} = await readConfig(options);
  if (!config?.mcp_servers || typeof config.mcp_servers !== 'object' || Array.isArray(config.mcp_servers))
    throw new Error('inventory_unverified');
  const inventory = Object.keys(config.mcp_servers).map(name => ({name}));
  buildCodexOverrides(inventory, options.cwd);
  assertIsolation({...config, mcp_servers: {}}, options.cwd);
  return inventory;
}

// Recebe canal já aberto: os testes exercitam este fluxo sem processos ou contas reais.
export async function runCodexLabSession({channel, cwd, signal, notify, audit, onProgress}) {
  const {config, rpc} = await readConfig({channel, cwd, signal, notify, onProgress});
  assertIsolation(config, cwd);
  const thread = await rpc('thread/start', {cwd, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only',
    developerInstructions: 'Laboratório sintético. Não use ferramentas nem leia arquivos. Responda somente ao texto sintético recebido.'});
  if (typeof thread.cwd !== 'string' || path.resolve(thread.cwd) !== path.resolve(cwd) || thread.approvalPolicy !== 'never' ||
      thread.sandbox?.type !== 'readOnly' || (thread.sandbox.networkAccess !== undefined && thread.sandbox.networkAccess !== false) ||
      !Array.isArray(thread.instructionSources) || thread.instructionSources.length ||
      typeof thread.thread?.id !== 'string' || !thread.thread.id.trim()) throw new Error('isolation_unverified');
  const owner = {provider: 'codex', providerVersion: codexLabPlan.providerVersion, projectId: 'm4-authorized-lab',
    accountRef: 'authorized-local-cli', providerSessionId: thread.thread.id, connectionId: channel.connectionId};
  const commandId = 'command-' + randomUUID();
  const localKey = sessionKey(owner.provider, owner.accountRef, owner.providerSessionId);
  let state = 'unknown';
  const identity = {commandId, sessionKey: localKey};
  audit('requested', identity);
  audit('sending', identity);
  try {
    const adapter = createCodexMessageAdapter(owner, channel, () => null);
    const receipt = await adapter.send({schemaVersion: '1.0', commandId, idempotencyKey: 'key-' + randomUUID(), mode: 'live',
      projectId: owner.projectId, sessionKey: localKey, provider: owner.provider, providerVersion: owner.providerVersion,
      action: 'send_message', requestId: null, deadlineAt: new Date(Date.now() + codexLabPlan.sessionTimeoutMs).toISOString(),
      payload: {text: codexLabPlan.syntheticPrompt}, confirmationId: null}, signal);
    state = receipt.status;
  } catch { /* O envio pode ter ocorrido. Nunca repetir. */ }
  audit(state, identity);
  return {state, commandId, sessionKey: localKey};
}

function metadata(binary, args, cwd) {
  const result = spawnSync(binary, args, {cwd, windowsHide: true, encoding: 'utf8', timeout: codexLabPlan.metadataTimeoutMs,
    maxBuffer: 4 * 1024 * 1024});
  if (result.error || result.status !== 0) throw new Error('metadata_unverified');
  return result.stdout;
}

export async function usingCodexAppServer({binary, overrides, cwd, timeoutMs, onStopped, onDiagnostics = () => {}}, body, spawnProcess = spawn) {
  // Chaves legadas ignoradas pelo CLI não invalidam o perfil do usuário. As condições de isolamento são verificadas via config/read.
  const child = spawnProcess(binary, [...overrides, 'app-server', '--listen', 'stdio://'],
    {cwd, windowsHide: true, env: {...process.env, CODEX_SQLITE_HOME: path.join(cwd, 'state')}, stdio: ['pipe', 'pipe', 'pipe']});
  const exited = new Promise(resolve => { child.once('exit', () => resolve(true)); child.once('error', () => resolve(true)); });
  let stdoutBytes = 0, stderrBytes = 0, timedOut = false;
  child.stdout.on('data', chunk => { stdoutBytes += chunk.length; });
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
  const channel = new JsonlChannel({input: child.stdin, output: child.stdout, connectionId: 'connection-' + randomUUID(),
    timeoutMs, maxFrameBytes: 1048576});
  const controller = new AbortController();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await body({channel, cwd, signal: controller.signal, notify: frame => child.stdin.write(JSON.stringify(frame) + '\n')});
  } finally {
    clearTimeout(timer);
    channel.close();
    child.stdin.end();
    child.kill();
    let stopTimer;
    const stopped = await Promise.race([exited, new Promise(resolve => { stopTimer = setTimeout(() => resolve(false), 5000); })]);
    clearTimeout(stopTimer);
    onStopped(stopped);
    onDiagnostics({stdoutBytes, stderrBytes, timedOut});
    if (!stopped) throw new Error('lab_cleanup_unverified');
  }
}

async function run() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const binary = process.env.WR3D_CODEX_CLI_PATH ?? path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@openai',
    'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
  const directory = path.join(root, 'Logs', 'm4-codex-real-' + randomUUID());
  const cwd = mkdtempSync(path.join(tmpdir(), 'wr3d-m4-codex-'));
  mkdirSync(directory, {recursive: true});
  let report = {...codexLabPlan, sendsRealMessage: false, state: 'not_sent', bootstrapError: true,
    inspectionProcessTerminated: null, processTerminated: null, stages: []};
  try {
    if (metadata(binary, ['--version'], cwd).trim() !== 'codex-cli ' + codexLabPlan.providerVersion)
      throw new Error('provider_version_unverified');
    const flags = metadata(binary, [...buildCodexOverrides([], cwd), 'features', 'list'], cwd);
    for (const name of disabledFeatures) {
      const line = flags.split(/\r?\n/).find(value => value.split(/\s+/)[0] === name);
      if (!line || line.trim().split(/\s+/).at(-1) !== 'false') throw new Error('features_unverified');
    }
    const inventory = await usingCodexAppServer({binary, overrides: buildCodexOverrides([], cwd), cwd, timeoutMs: codexLabPlan.inspectionTimeoutMs,
      onStopped: stopped => { report.inspectionProcessTerminated = stopped; },
      onDiagnostics: value => { report.inspectionTransport = value; }}, options => inspectCodexConfig({...options,
        onProgress: stage => report.stages.push('inspection/' + stage)}));
    const result = await usingCodexAppServer({binary, overrides: buildCodexOverrides(inventory, cwd), cwd, timeoutMs: codexLabPlan.sessionTimeoutMs,
      onStopped: stopped => { report.processTerminated = stopped; }, onDiagnostics: value => { report.sessionTransport = value; }},
      options => runCodexLabSession({...options, onProgress: stage => report.stages.push('session/' + stage), audit: (state, identity) => {
        if (state === 'sending') { report.sendsRealMessage = true; report.state = 'unknown'; }
        appendFileSync(path.join(directory, 'audit.jsonl'), JSON.stringify({at: new Date().toISOString(), state, ...identity,
          provider: 'codex', providerVersion: codexLabPlan.providerVersion,
          payloadRef: 'sha256:' + createHash('sha256').update(codexLabPlan.syntheticPrompt).digest('hex')}) + '\n');
      }}));
    report = {...report, ...result, bootstrapError: false};
  } catch (error) {
    const known = ['provider_version_unverified', 'metadata_unverified', 'features_unverified', 'inventory_unverified',
      'isolation_unverified', 'bootstrap_unconfirmed', 'lab_cleanup_unverified'];
    report.failureCode = known.includes(error?.message) ? error.message : 'lab_failed';
  }
  finally {
    writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify({directory, cwd, state: report.state, bootstrapError: report.bootstrapError,
      sendsRealMessage: report.sendsRealMessage, inspectionProcessTerminated: report.inspectionProcessTerminated,
      processTerminated: report.processTerminated, automaticRetry: false}) + '\n');
  }
  if (report.state !== 'confirmed' || report.bootstrapError || report.processTerminated !== true) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).length === 0) process.stdout.write(JSON.stringify(codexLabPlan, null, 2) + '\n');
  else if (process.argv.slice(2).length === 1 && process.argv[2] === '--run') await run();
  else { process.stderr.write('Uso: node service/scripts/m4-codex-provider-lab.mjs [--run]\n'); process.exitCode = 2; }
}
