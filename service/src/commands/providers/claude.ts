import type { CommandAdapter } from '../types.ts';
import { randomUUID } from 'node:crypto';
import type { SessionChannel } from './jsonl-channel.ts';
import { assertOwnedMessage, bindOwnedSession, type OwnedSession } from './owned-session.ts';
/** Sem prova Windows vinculada à versão/sessão: não instalar hook nem invocar CLI. */
export const claudeCommands:CommandAdapter={provider:'claude',version:'unavailable-1',actions:[],
  async send(){throw new Error('capability_unavailable');}};

/** Pré-requisito: host possui stdin/stdout desta sessão com --replay-user-messages. */
export function createClaudeMessageAdapter(binding: OwnedSession, channel: SessionChannel): CommandAdapter {
  const owner = bindOwnedSession(binding, 'claude', '2.1.319');
  return {
    provider: 'claude', version: 'claude-stream-json-2.1.319-message-1', actions: ['send_message'],
    async send(intent, signal) {
      assertOwnedMessage(owner, channel, intent, signal);
      const uuid = randomUUID();
      await channel.exchange({type: 'user', uuid, session_id: owner.providerSessionId,
        message: {role: 'user', content: intent.payload.text}, parent_tool_use_id: null}, frame => {
        if (frame.type !== 'user' || frame.isReplay !== true || frame.uuid !== uuid || frame.session_id !== owner.providerSessionId ||
            frame.parent_tool_use_id !== null || Object.hasOwn(frame, 'agent_id') || Object.hasOwn(frame, 'tool_use_result')) return false;
        const message = frame.message as {role?: unknown; content?: unknown} | null;
        if (message?.role !== 'user') return false;
        if (message.content === intent.payload.text) return true;
        if (!Array.isArray(message.content) || message.content.length !== 1) return false;
        const block = message.content[0] as {type?: unknown; text?: unknown} | null;
        return block?.type === 'text' && block.text === intent.payload.text;
      }, signal);
      return {status: 'confirmed', commandId: intent.commandId, requestId: intent.requestId};
    }
  };
}
