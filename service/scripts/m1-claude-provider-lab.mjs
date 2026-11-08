// Ensaio explicitamente autorizado: uma sessão nova em projeto temporário.
// O spool contém somente o resultado de capture-source.ts; não há retry.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 3 || process.argv[2] !== '--run') {
  process.stdout.write(JSON.stringify({provider:'claude',sendsRealMessage:false,usage:'node service/scripts/m1-claude-provider-lab.mjs --run'})+'\n');
  process.exit(0);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = mkdtempSync(path.join(tmpdir(), 'wr3d-31-claude-'));
const output = path.join(root, 'Logs', `issue-31-claude-${randomUUID()}`);
const settingsDir = path.join(project, '.claude');
const settingsPath = path.join(settingsDir, 'settings.local.json');
const spool = path.join(output, 'claude.jsonl');
const capture = path.join(root, 'service', 'src', 'sessions', 'capture-source.ts');
const binary = process.env.WR3D_CLAUDE_CLI_PATH ?? 'claude';
const hookCommand = `node "${capture}" claude "${spool}"`;
const events = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Stop', 'SubagentStart', 'SubagentStop',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'TaskCreated', 'TaskCompleted', 'PermissionRequest'];
mkdirSync(output, {recursive: true});
mkdirSync(settingsDir, {recursive: true});
writeFileSync(settingsPath, JSON.stringify({hooks:Object.fromEntries(events.map(event =>
  [event,[{hooks:[{type:'command',command:hookCommand,timeout:5}]}]]))}));
const args = ['--restricted', '--print', '--tools', 'Agent', '--allowedTools', 'Agent', '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
  '--no-session-persistence', '--session-id', randomUUID(), '--settings', settingsPath,
  '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '0.10',
  'Ensaio sintético. Use Agent exatamente uma vez com general-purpose para responder WR3D_CHILD_ACK. ' +
  'Não use outras ferramentas nem leia arquivos. Depois responda somente WR3D_MAIN_ACK.'];
const report = {provider:'claude',version:'2.1.319',project,output,spool,hookScope:settingsPath,
  timeoutMs:60000,budgetUsd:0.10,sessionNew:true,spawned:false,exitCode:null,timedOut:false,
  outputKinds:{},costUsd:null,errorKind:null,spoolEvents:{},revoked:false};
const child = spawn(binary,args,{cwd:project,windowsHide:true,stdio:['ignore','pipe','pipe']});
report.spawned = true;
let stdout = '', stderrBytes = 0;
child.stdout.on('data', chunk => {
  stdout += chunk.toString('utf8');
  let newline;
  while ((newline = stdout.indexOf('\n')) >= 0) {
    const line = stdout.slice(0,newline); stdout = stdout.slice(newline+1);
    try {
      const frame = JSON.parse(line);
      const kind = typeof frame.type === 'string' ? frame.type : 'unknown';
      report.outputKinds[kind] = (report.outputKinds[kind] ?? 0)+1;
      if (kind === 'result') {
        report.costUsd = typeof frame.total_cost_usd === 'number' ? frame.total_cost_usd : null;
        report.errorKind = frame.is_error ? (frame.subtype ?? 'result_error') : null;
      }
    } catch { report.outputKinds.invalid = (report.outputKinds.invalid ?? 0)+1; }
  }
});
child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
const timer = setTimeout(() => { report.timedOut = true; child.kill(); },60000);
try {
  report.exitCode = await new Promise(resolve => {
    child.once('exit', code => resolve(code));
    child.once('error', () => resolve(null));
  });
} finally {
  clearTimeout(timer);
  rmSync(settingsPath,{force:true});
  report.revoked = true;
  report.stderrBytes = stderrBytes;
  try {
    for (const line of readFileSync(spool,'utf8').split(/\r?\n/).filter(Boolean)) {
      const event = JSON.parse(line).hook_event_name;
      report.spoolEvents[event] = (report.spoolEvents[event] ?? 0)+1;
    }
  } catch { report.spoolReadError = true; }
  writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
  process.stdout.write(JSON.stringify(report)+'\n');
}
