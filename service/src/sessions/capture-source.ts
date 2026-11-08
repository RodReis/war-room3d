import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeProjectPath } from '../domain/identity.ts';

type RecordValue = Record<string,unknown>;
const object = (value: unknown): RecordValue | null => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const string = (value: unknown): string | null => typeof value === 'string' && value.length > 0 && value.length <= 160 ? value : null;

export function sanitizeSourceRecord(provider: 'claude'|'codex', raw: unknown): RecordValue | null {
  const input = object(raw);
  if (!input) return null;
  if (provider === 'claude') {
    const hook = string(input.hook_event_name);
    const session = string(input.session_id);
    if (!hook || !session || typeof input.cwd !== 'string' || !['SessionStart','SessionEnd','UserPromptSubmit','Stop','SubagentStart','SubagentStop','PreToolUse','PostToolUse','PostToolUseFailure','TaskCreated','TaskCompleted','PermissionRequest'].includes(hook)) return null;
    let cwdHash: string;
    try { cwdHash = createHash('sha256').update(normalizeProjectPath(input.cwd)).digest('hex'); }
    catch { return null; }
    return {hook_event_name:hook,session_id:session,cwdHash,
      ...(string(input.prompt_id) ? {prompt_id:string(input.prompt_id)} : {}),
      ...(string(input.source) ? {source:string(input.source)} : {}),
      ...(string(input.agent_id) ? {agent_id:string(input.agent_id)} : {}),
      ...(string(input.parent_agent_id) ? {parent_agent_id:string(input.parent_agent_id)} : {}),
      ...(string(input.tool_use_id) ? {tool_use_id:string(input.tool_use_id)} : {}),
      ...(string(input.tool_name) ? {tool_name:string(input.tool_name)} : {}),
      ...(string(input.task_id) ? {task_id:string(input.task_id)} : {}),
      ...(string(object(input.tool_input)?.skill) ? {tool_input:{skill:string(object(input.tool_input)?.skill)}} : {})};
  }
  const method = string(input.method);
  const params = object(input.params);
  if (!method || !params || !['thread/started','turn/started','turn/completed','item/started','item/completed'].includes(method)) return null;
  const thread = object(params.thread);
  const item = object(params.item);
  const receivers = Array.isArray(item?.receiverThreadIds) ? item.receiverThreadIds.filter(value => string(value)).slice(0,32) : [];
  const eventTimeMs = method === 'item/started' ? params.startedAtMs : method === 'item/completed' ? params.completedAtMs : null;
  const capturedAt = typeof eventTimeMs === 'number' && Number.isSafeInteger(eventTimeMs) && eventTimeMs >= 0 && eventTimeMs <= 8640000000000000
    ? new Date(eventTimeMs).toISOString() : null;
  return {method,params:{
    ...(string(params.threadId) ? {threadId:string(params.threadId)} : {}),
    ...(string(params.turnId) ? {turnId:string(params.turnId)} : {}),
    ...(string(object(params.turn)?.id) ? {turn:{id:string(object(params.turn)?.id)}} : {}),
    ...(string(thread?.id) ? {thread:{id:string(thread?.id),
      ...(typeof thread?.cwd === 'string' ? {cwdHash:createHash('sha256').update(normalizeProjectPath(thread.cwd)).digest('hex')} : {})}} : {}),
    ...(item && string(item.type) && string(item.id) ? {item:{type:string(item.type),id:string(item.id),
      ...(string(item.status) ? {status:string(item.status)} : {}),
      ...(string(item.senderThreadId) ? {senderThreadId:string(item.senderThreadId)} : {}),
      ...(receivers.length ? {receiverThreadIds:receivers} : {})}} : {})
  },...(capturedAt ? {capturedAt} : {})};
}

async function capture(): Promise<void> {
  const [provider,filename,mode] = process.argv.slice(2);
  if ((provider !== 'claude' && provider !== 'codex') || !filename || !path.isAbsolute(filename)) throw new Error('Provedor e arquivo absoluto obrigatórios');
  const persist = (raw: Buffer): void => {
    if (raw.length > 64*1024) throw new Error('Evento de fonte excede limite');
    const input = JSON.parse(raw.toString('utf8')) as unknown;
    const safe = sanitizeSourceRecord(provider,input);
    if (safe) appendFileSync(filename,`${JSON.stringify({...safe,capturedAt:safe.capturedAt ?? new Date().toISOString()})}\n`,{encoding:'utf8',flag:'a',mode:0o600});
  };
  if (mode === '--stream' && provider === 'codex') {
    let pending = Buffer.alloc(0);
    for await (const chunk of process.stdin) {
      pending = Buffer.concat([pending,chunk as Buffer]);
      let newline = pending.indexOf(10);
      while (newline >= 0) {
        const line = pending.subarray(0,newline);
        if (line.length) persist(line);
        pending = pending.subarray(newline+1);
        newline = pending.indexOf(10);
      }
      if (pending.length > 64*1024) throw new Error('Linha de fonte excede limite');
    }
    if (pending.length) persist(pending);
    return;
  }
  if (mode !== undefined) throw new Error('Modo de captura inválido');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += (chunk as Buffer).length;
    if (size > 64*1024) throw new Error('Evento de fonte excede limite');
    chunks.push(chunk as Buffer);
  }
  persist(Buffer.concat(chunks));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  capture().catch(error => { process.stderr.write(`Observação indisponível: ${error instanceof Error ? error.message : 'erro'}\n`); process.exitCode = 1; });
}
