import { createHash } from 'node:crypto';
import { sessionKey, type Provider } from '../domain/identity.ts';
import type { NormalizedEvent } from '../store/event-store.ts';
import type { ObservedMessage } from './conversation-store.ts';

export interface SessionSource {
  sourceId: string;
  sourceVersion: string;
  provider: Provider;
  projectId: string;
  accountRef: string;
  filePath: string;
  staleAfterMs?: number;
  conversationContent?: { consentRef: string; retentionDays: number };
}

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const string = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null;
const id = (...parts: string[]): string => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const safeName = (value: unknown): string | null => {
  const name = string(value);
  return name && /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/.test(name) ? name : null;
};

// Conteúdo fica fora do evento M1 e só é persistido quando a fonte foi autorizada por configuração.
export function adaptConversationRecord(source: SessionSource, raw: unknown, recordId: string, receivedAt: string): ObservedMessage | null {
  if (!source.conversationContent?.consentRef) return null;
  const input = object(raw);
  if (!input) return null;
  const params = source.provider === 'codex' ? object(input.params) : input;
  const method = source.provider === 'codex' ? string(input.method) : string(input.hook_event_name);
  const nativeSessionId = source.provider === 'codex'
    ? string(params?.threadId) ?? string(object(params?.thread)?.id) : string(input.session_id);
  if (!nativeSessionId || !method) return null;
  let role: 'user' | 'assistant';
  let content: string | null = null;
  let nativeRef: string | null = null;
  let turnRef: string | null = null;
  let captureTruncated = false;
  if (source.provider === 'claude') {
    if (method === 'UserPromptSubmit') {role = 'user'; content = string(input.prompt); nativeRef = string(input.prompt_id);}
    else if (method === 'Stop') {role = 'assistant'; content = string(input.last_assistant_message); nativeRef = string(input.turn_id);}
    else return null;
    captureTruncated = input.contentTruncated === true;
    turnRef = string(input.prompt_id);
  } else {
    const item = object(params?.item);
    const itemType = string(item?.type);
    if (method !== 'item/completed' || (itemType !== 'userMessage' && itemType !== 'agentMessage')) return null;
    role = itemType === 'userMessage' ? 'user' : 'assistant';
    nativeRef = string(item?.id);
    if (!nativeRef) return null;
    const parts = Array.isArray(item?.content) ? item.content.map(value => string(object(value)?.text)).filter((value):value is string => !!value) : [];
    content = string(item?.text) ?? (parts.length ? parts.join('\n') : null);
    captureTruncated = item?.contentTruncated === true;
    turnRef = string(params?.turnId);
  }
  if (!content?.trim()) return null;
  const key = sessionKey(source.provider,source.accountRef,nativeSessionId);
  const capturedAt = string(input.capturedAt);
  if (!capturedAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(capturedAt) ||
    !Number.isFinite(Date.parse(capturedAt))) return null;
  const observedAt = capturedAt;
  return {messageId:`m-${id(source.sourceId,key,role,nativeRef ?? recordId)}`,projectId:source.projectId,sessionKey:key,
    sourceId:source.sourceId,provider:source.provider,role,content:content.slice(0,8000),observedAt,receivedAt,nativeRef,turnRef,
    consentRef:source.conversationContent.consentRef,retentionDays:source.conversationContent.retentionDays,
    truncated:captureTruncated || content.length>8000};
}

export function adaptSessionRecord(source: SessionSource, raw: unknown, recordId: string, receivedAt: string): NormalizedEvent[] {
  const input = object(raw);
  if (!input || !recordId) return [];
  const params = source.provider === 'codex' ? object(input.params) : input;
  if (!params) return [];
  const method = source.provider === 'codex' ? string(input.method) : string(input.hook_event_name);
  const thread = source.provider === 'codex' ? object(params.thread) : null;
  const nativeSessionId = source.provider === 'codex' ? string(params.threadId) ?? string(thread?.id) : string(params.session_id);
  if (!nativeSessionId || !method) return [];
  const capturedAt = string(input.capturedAt);
  const observedAt = capturedAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(capturedAt) && Number.isFinite(Date.parse(capturedAt)) ? capturedAt : receivedAt;
  const item = source.provider === 'codex' ? object(params.item) : null;
  const stableNativeId = source.provider === 'codex'
    ? string(item?.id) ?? string(params.turnId) ?? string(object(params.turn)?.id)
    : string(input.tool_use_id) ?? string(input.task_id) ?? string(input.agent_id) ?? string(input.prompt_id);
  const eventRecordId = stableNativeId ? `native-${id(nativeSessionId,method,stableNativeId)}` : recordId;
  const key = sessionKey(source.provider, source.accountRef, nativeSessionId);
  const base = (type: string, suffix: string, payload: NormalizedEvent['payload'] = {}, agentKey?: string): NormalizedEvent => ({
    schemaVersion: '1.0', eventId: `e-${id(source.sourceId,eventRecordId,suffix)}`, sourceId: source.sourceId,
    sourceEventId: `r-${id(source.sourceId,eventRecordId,suffix)}`, sourceVersion: source.sourceVersion, type,
    observedAt, receivedAt, projectId: source.projectId, provider: source.provider,
    sessionKey: key, ...(agentKey ? { agentKey } : {}), provenance: 'observed', ingestionMode: 'live', payload, evidenceRefs: []
  });
  const mainAgent = `a-${id(key,nativeSessionId)}`;
  const agent = (native: string) => `a-${id(key,native)}`;
  const codexAgent = (native: string) => `a-${id(sessionKey('codex',source.accountRef,native),native)}`;
  if (source.provider === 'claude') {
    const subagentId = string(input.agent_id);
    const currentAgent = subagentId ? agent(subagentId) : mainAgent;
    if (method === 'SessionStart') return [base('session.observed','session',input.source === 'resume' ? {reason:'source_recovered'} : {}),base('agent.observed','main-agent',input.source === 'resume' ? {reason:'source_recovered'} : {},mainAgent)];
    if (method === 'SessionEnd') return [base('session.ended','session')];
    if (method === 'UserPromptSubmit') return [base('session.working','session'),base('message.observed','message',{messageId:`m-${id(key,eventRecordId)}`})];
    if (method === 'Stop') return [base('session.waiting','session')];
    if (method === 'SubagentStart' && subagentId) {
      const parentId = string(input.parent_agent_id);
      return [base('agent.observed','agent',parentId ? {parentAgentKey:agent(parentId)} : {parentStatus:'vinculo_pendente'},currentAgent)];
    }
    if (method === 'SubagentStop' && subagentId) return [base('agent.ended','agent',{},currentAgent)];
    if (method === 'PreToolUse' || method === 'PostToolUse' || method === 'PostToolUseFailure') {
      const toolName = safeName(input.tool_name);
      const toolUseId = string(input.tool_use_id);
      if (!toolName || !toolUseId) return [];
      const invocationId = `i-${id(key,toolUseId)}`;
      if (toolName === 'Skill' && method === 'PreToolUse') {
        const skill = safeName(object(input.tool_input)?.skill);
        return skill ? [base('skill.observed','skill',{invocationId,name:skill},currentAgent)] : [];
      }
      if (toolName === 'Skill') return [];
      const type = method === 'PreToolUse' ? 'tool.observed' : method === 'PostToolUse' ? 'tool.result' : 'tool.failed';
      return [base(type,'tool',{invocationId,name:toolName},currentAgent)];
    }
    if (method === 'TaskCreated' || method === 'TaskCompleted') {
      const nativeTaskId = string(input.task_id);
      if (!nativeTaskId) return [];
      return [base(method === 'TaskCreated' ? 'task.observed' : 'task.completed','task',{taskId:`t-${id(key,nativeTaskId)}`,title:'Tarefa observada'})];
    }
    if (method === 'PermissionRequest') return [base('request.observed','request',{messageId:`r-${id(key,eventRecordId)}`})];
    return [];
  }
  if (method === 'thread/started') return [base('session.observed','session'),base('agent.observed','main-agent',{},mainAgent)];
  if (method === 'turn/started') return [base('session.working','session')];
  if (method === 'turn/completed') return [base('session.waiting','session')];
  if (method === 'item/started' || method === 'item/completed') {
    if (!item) return [];
    const itemType = string(item.type);
    const itemId = string(item.id);
    if (!itemType || !itemId) return [];
    if ((itemType === 'userMessage' || itemType === 'agentMessage') && method === 'item/completed')
      return [base('message.observed','message',{messageId:`m-${id(key,itemId)}`})];
    if (itemType === 'subAgentActivity') {
      const receiver = string(item.agentThreadId);
      const kind = string(item.kind);
      if (!receiver || !['started','interacted','interrupted','completed'].includes(kind ?? '')) return [];
      const childKey = sessionKey('codex',source.accountRef,receiver);
      const childAgent = codexAgent(receiver);
      return [
        {...base('session.observed','child-session'),sessionKey:childKey},
        {...base('agent.observed','child-agent',{parentAgentKey:codexAgent(nativeSessionId)},childAgent),sessionKey:childKey},
        ...(kind === 'completed' && method === 'item/completed'
          ? [{...base('agent.ended','child-ended',{},childAgent),sessionKey:childKey}] : [])
      ];
    }
    if (itemType === 'collabAgentToolCall' && method === 'item/completed') {
      const receivers = Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds : [];
      const sender = string(item.senderThreadId) ?? nativeSessionId;
      return receivers.filter((x): x is string => typeof x === 'string' && x.length > 0).flatMap((receiver,index) => {
        const childKey = sessionKey('codex',source.accountRef,receiver);
        return [
          {...base('session.observed',`child-session-${index}`),sessionKey:childKey},
          {...base('agent.observed',`child-agent-${index}`,{parentAgentKey:codexAgent(sender)},codexAgent(receiver)),sessionKey:childKey}
        ];
      });
    }
    const toolNames: Record<string,string> = {commandExecution:'CommandExecution',fileChange:'FileChange',mcpToolCall:'McpToolCall',dynamicToolCall:'DynamicToolCall'};
    const name = toolNames[itemType];
    if (!name) return [];
    const invocationId = `i-${id(key,itemId)}`;
    const status = string(item.status);
    const type = method === 'item/started' ? 'tool.observed' : status === 'failed' ? 'tool.failed' : 'tool.result';
    return [base(type,'tool',{invocationId,name},mainAgent)];
  }
  return [];
}
