import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { codexLabPlan, disabledFeatures, buildCodexOverrides, inspectCodexConfig, runCodexLabSession, usingCodexAppServer } from '../../scripts/m4-codex-provider-lab.mjs';

const cwd = process.cwd();
function lab(change = {}) {
  const sent = [];
  const config = {features: {...Object.fromEntries(disabledFeatures.map(name => [name, false])), skip_host_skill_discovery: true},
    mcp_servers: {inherited: {enabled: false}}, web_search: 'disabled', approval_policy: 'never',
    sandbox_mode: 'read-only', project_doc_max_bytes: 0, developer_instructions: '', notify: [], model_provider: 'openai',
    history: {persistence: 'none'}, analytics: {enabled: false}, sqlite_home: path.join(cwd, 'state'), log_dir: path.join(cwd, 'log'),
    experimental_thread_store: {type: 'in_memory', id: 'wr3d-m4-codex-lab'},
    otel: {exporter: 'none', trace_exporter: 'none', log_user_prompt: false}, ...change.config};
  const channel = {connectionId: 'synthetic-connection', isOpen: true, async exchange(frame, matches) {
    sent.push(frame);
    if (change.serverRequest && frame.method === 'initialize') assert.equal(matches(change.serverRequest), false);
    if (change.bootstrapDisconnect && frame.method === 'initialize') throw new Error('delivery_unconfirmed');
    const result = frame.method === 'initialize' ? {userAgent: 'codex/0.166.0'} :
      frame.method === 'config/read' ? {config} : frame.method === 'thread/start' ? {
        cwd, approvalPolicy: 'never', sandbox: {type: 'readOnly', networkAccess: false}, instructionSources: [],
        thread: {id: 'synthetic-thread'}, ...change.thread} : {turn: {id: 'synthetic-turn', status: 'inProgress', items: []}};
    if (frame.method === 'turn/start' && change.sendError) throw new Error('connection_lost');
    return {id: frame.id, result};
  }};
  const notifications = [], audit = [], progress = [];
  return {sent, notifications, audit, progress, inspect: () => inspectCodexConfig({channel, cwd,
    signal: new AbortController().signal, notify: frame => notifications.push(frame), onProgress: stage => progress.push(stage)}), run: (auditOverride, trustedInstructionSources = []) => runCodexLabSession({channel, cwd,
    signal: new AbortController().signal, notify: frame => notifications.push(frame), onProgress: stage => progress.push(stage), trustedInstructionSources, audit: auditOverride ?? (state => audit.push(state))})};
}

test('plano Codex explicita ferramentas internas residuais, sem inventar limite financeiro', () => {
  assert.equal(codexLabPlan.userMessages, 1);
  assert.equal(codexLabPlan.sendsRealMessage, false);
  assert.equal(codexLabPlan.maxBudgetUsd, null);
  assert.equal(codexLabPlan.internalTools, 'may_remain_available_under_read_only_sandbox');
  assert.ok(disabledFeatures.includes('shell_tool') && disabledFeatures.includes('hooks'));
});

test('modo padrão não inicia CLI mesmo com caminho inexistente', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/m4-codex-provider-lab.mjs', import.meta.url))],
    {encoding: 'utf8', env: {...process.env, WR3D_CODEX_CLI_PATH: 'missing-cli'}, timeout: 5000});
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).sendsRealMessage, false);
});

test('cada MCP herdado recebe override explícito, sem exportar transportes ou credenciais', () => {
  const args = buildCodexOverrides([{name: 'server.with.dot', command: 'secret', enabled: true}, {name: 'second'}], cwd);
  assert.ok(args.includes('mcp_servers={"server.with.dot"={enabled=false},"second"={enabled=false}}'));
  assert.equal(args.filter(value => value.startsWith('mcp_servers=')).length, 1);
  assert.equal(args.join(' ').includes('secret'), false);
  for (const inventory of [null, {}, [{name: ''}], [{name: 'bad\nname'}]])
    assert.throws(() => buildCodexOverrides(inventory, cwd), /inventory_unverified/);
});

test('inventário usa somente config/read, sem mcp/list, thread ou transporte/credencial na saída', async () => {
  const fixture = lab({config: {mcp_servers: {inherited: {command: 'private-command', env: {TOKEN: 'private-token'}}}}});
  assert.deepEqual(await fixture.inspect(), [{name: 'inherited'}]);
  assert.deepEqual(fixture.sent.map(frame => frame.method), ['initialize', 'config/read']);
  assert.equal(fixture.audit.length, 0);
  await assert.rejects(lab({config: {mcp_servers: []}}).inspect(), /inventory_unverified/);
});

test('laboratório sintético inicializa, verifica escopo e envia uma única intenção pelo adaptador real', async () => {
  const fixture = lab();
  assert.equal((await fixture.run()).state, 'confirmed');
  assert.deepEqual(fixture.sent.map(frame => frame.method), ['initialize', 'config/read', 'thread/start', 'turn/start']);
  assert.deepEqual(fixture.notifications, [{method: 'initialized'}]);
  assert.deepEqual(fixture.audit, ['requested', 'sending', 'confirmed']);
  assert.equal(fixture.sent.at(-1).params.threadId, 'synthetic-thread');
  assert.equal(fixture.sent.at(-1).params.input[0].text, codexLabPlan.syntheticPrompt);
  assert.equal(fixture.sent[2].params.ephemeral, true);
});

test('MCP herdado ativo, feature ausente/ativa ou configuração permissiva impedem thread e envio', async () => {
  const badConfigs = [{mcp_servers: {lateServer: {enabled: true}}}, {mcp_servers: {lateServer: {}}},
    {features: {}}, {features: {...Object.fromEntries(disabledFeatures.map(name => [name, false])), hooks: true}},
    {web_search: 'live'}, {approval_policy: 'on-request'}, {sandbox_mode: 'workspace-write'},
    {project_doc_max_bytes: 100}, {developer_instructions: 'real context'}, {notify: ['command']}, {model_provider: 'custom'},
    {model_instructions_file: 'real-prompt.md'}, {history: {persistence: 'save-all'}}, {analytics: {enabled: true}},
    {sqlite_home: 'real-state'}, {experimental_thread_store: {type: 'local'}},
    {otel: {exporter: 'otlp-http', trace_exporter: 'none', log_user_prompt: false}}];
  for (const config of badConfigs) {
    const fixture = lab({config});
    await assert.rejects(fixture.run(), /isolation_unverified/);
    assert.deepEqual(fixture.sent.map(frame => frame.method), ['initialize', 'config/read']);
    assert.deepEqual(fixture.audit, []);
  }
});

test('thread com sandbox, instruções ou diretório divergentes nunca recebe mensagem', async () => {
  for (const thread of [{sandbox: {type: 'dangerFullAccess'}}, {sandbox: {type: 'readOnly', networkAccess: true}},
    {sandbox: {type: 'readOnly', networkAccess: 'unknown'}},
    {approvalPolicy: 'on-request'}, {cwd: cwd + '-other'}, {instructionSources: ['real/AGENTS.md']}, {thread: {id: ''}}]) {
    const fixture = lab({thread});
    await assert.rejects(fixture.run(), /isolation_unverified/);
    assert.equal(fixture.sent.some(frame => frame.method === 'turn/start'), false);
    assert.deepEqual(fixture.audit, []);
  }
});

test('perda de conexão após tentativa fica unknown e nunca cria segundo turno', async () => {
  const fixture = lab({sendError: true});
  assert.equal((await fixture.run()).state, 'unknown');
  assert.equal(fixture.sent.filter(frame => frame.method === 'turn/start').length, 1);
  assert.deepEqual(fixture.audit, ['requested', 'sending', 'unknown']);
});

test('unified_exec pode permanecer ativo; shell_tool falso é o bloqueio de execução nesta versão', async () => {
  const features = {...Object.fromEntries(disabledFeatures.map(name => [name, false])), skip_host_skill_discovery: true, unified_exec: true};
  assert.equal((await lab({config: {features}}).run()).state, 'confirmed');
  await assert.rejects(lab({config: {features: {...features, shell_tool: true}}}).run(), /isolation_unverified/);
});

test('falha da auditoria antes do envio impede turn/start', async () => {
  const fixture = lab();
  await assert.rejects(fixture.run(() => { throw new Error('disk_full'); }), /disk_full/);
  assert.equal(fixture.sent.some(frame => frame.method === 'turn/start'), false);
});

test('processo próprio é encerrado também após falha ou timeout, sem shell e com SQLite separado', async () => {
  for (const failure of ['body', 'timeout']) {
    const child = Object.assign(new EventEmitter(), {stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough()});
    let killed = 0, stopped = false;
    child.kill = () => { killed++; queueMicrotask(() => child.emit('exit', 1)); return true; };
    await assert.rejects(usingCodexAppServer({binary: 'fake-cli', overrides: [], cwd, timeoutMs: 5,
      onStopped: value => { stopped = value; }}, async ({signal}) => {
        if (failure === 'timeout') await new Promise(resolve => signal.addEventListener('abort', resolve, {once: true}));
        throw new Error('synthetic_failure');
      }, (_binary, args, options) => {
        assert.deepEqual(args, ['app-server', '--listen', 'stdio://']);
        assert.equal(options.windowsHide, true);
        assert.equal(options.shell, undefined);
        assert.equal(options.env.CODEX_SQLITE_HOME, path.join(cwd, 'state'));
        return child;
      }), /synthetic_failure/);
    assert.equal(killed, 1);
    assert.equal(stopped, true);
    assert.equal(child.stdin.writableEnded, true);
    child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
  }
});

test('fechamento no bootstrap é distinguido de uma tentativa de mensagem', async () => {
  const fixture = lab({bootstrapDisconnect: true});
  await assert.rejects(fixture.run(), /bootstrap_unconfirmed/);
  assert.deepEqual(fixture.sent.map(frame => frame.method), ['initialize']);
  assert.equal(fixture.audit.length, 0);
  assert.deepEqual(fixture.progress, ['initialize:requested']);
});

test('diagnóstico de timeout registra só contadores e prazo, sem conteúdo dos pipes', async () => {
  const child = Object.assign(new EventEmitter(), {stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough()});
  child.kill = () => { queueMicrotask(() => child.emit('exit', 1)); return true; };
  let diagnostics;
  await usingCodexAppServer({binary: 'fake-cli', overrides: [], cwd, timeoutMs: 5, onStopped: () => {},
    onDiagnostics: value => { diagnostics = value; }}, async ({signal}) => {
      child.stderr.write('synthetic-private-log');
      child.stdout.write('{"syntheticPrivateField":"private-value"}\n');
      await new Promise(resolve => signal.addEventListener('abort', resolve, {once: true}));
    }, () => child);
  assert.deepEqual(diagnostics, {stdoutBytes: 42, stderrBytes: 21, timedOut: true});
  assert.equal(JSON.stringify(diagnostics).includes('private'), false);
  child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
});

test('pedido inesperado de autenticação é diagnosticado sem resposta e sem gravar parâmetros', async () => {
  for (const method of ['account/chatgptAuthTokens/refresh', 'private-method-containing-data']) {
    const fixture = lab({bootstrapDisconnect: true, serverRequest: {id: 'private-id', method, params: {token: 'private-token'}}});
    await assert.rejects(fixture.run(), /bootstrap_unconfirmed/);
    assert.deepEqual(fixture.sent.map(frame => frame.method), ['initialize']);
    assert.deepEqual(fixture.progress, ['initialize:requested', 'server_request_unhandled:' +
      (method === 'account/chatgptAuthTokens/refresh' ? 'auth_refresh' : 'other')]);
    assert.equal(JSON.stringify(fixture.progress).includes('private'), false);
  }
});

test('política global nativa só é aceita por caminho exato explicitamente autorizado pelo host', async () => {
  const source = path.join(cwd, 'synthetic-native-home', 'AGENTS.md');
  const trusted = [source];
  await assert.rejects(lab({thread: {instructionSources: [source]}}).run(), /isolation_unverified/);
  assert.equal((await lab({thread: {instructionSources: [source]}}).run(undefined, trusted)).state, 'confirmed');
  for (const other of [path.join(cwd, 'other', 'AGENTS.md'), source + '.private']) {
    const fixture = lab({thread: {instructionSources: [source, other]}});
    await assert.rejects(fixture.run(undefined, trusted), /isolation_unverified/);
    assert.equal(fixture.sent.some(frame => frame.method === 'turn/start'), false);
  }
});
