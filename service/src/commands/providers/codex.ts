import type { CommandAdapter } from '../types.ts';
import { randomUUID } from 'node:crypto';
import type { SessionChannel } from './jsonl-channel.ts';
import { assertOwnedMessage, bindOwnedSession, type OwnedSession } from './owned-session.ts';
/** Fila ou protocolo de outra aplicação não comprova controle da sessão observada. */
export const codexCommands:CommandAdapter={provider:'codex',version:'unavailable-1',actions:[],
  async send(){throw new Error('capability_unavailable');}};

/** Pré-requisito: conexão do supervisor e thread já vinculadas; não cria/retoma thread. */
export function createCodexMessageAdapter(binding: OwnedSession, channel: SessionChannel, activeTurnId: () => string | null): CommandAdapter {
  const owner = bindOwnedSession(binding, 'codex', '0.166.0');
  return {
    provider: 'codex', version: 'codex-app-server-0.166.0-message-1', actions: ['send_message'],
    async send(intent, signal) {
      assertOwnedMessage(owner, channel, intent, signal);
      const turnId = activeTurnId();
      if (turnId !== null && (typeof turnId !== 'string' || !turnId.trim())) throw new Error('provider_target_unavailable');
      const id = `m4-${randomUUID()}`;
      const params = {threadId: owner.providerSessionId, input: [{type: 'text', text: intent.payload.text}], clientUserMessageId: randomUUID()};
      const reply = await channel.exchange({id, method: turnId ? 'turn/steer' : 'turn/start',
        params: turnId ? {...params, expectedTurnId: turnId} : params},
        frame => frame.id === id && !Object.hasOwn(frame, 'method'), signal);
      if (Object.hasOwn(reply, 'error') && !Object.hasOwn(reply, 'result')) {
        const error = reply.error as {code?: unknown} | null;
        if (error && [-32600, -32601, -32602].includes(error.code as number))
          return {status: 'rejected', commandId: intent.commandId, requestId: intent.requestId};
        throw new Error('delivery_unconfirmed');
      }
      if (Object.hasOwn(reply, 'error') || !reply.result || typeof reply.result !== 'object' || Array.isArray(reply.result))
        throw new Error('delivery_unconfirmed');
      const result = reply.result as {turnId?: unknown; turn?: {id?: unknown; status?: unknown; items?: unknown}};
      const accepted = turnId ? result.turnId === turnId : result.turn && typeof result.turn.id === 'string' &&
        result.turn.id.trim().length > 0 && Array.isArray(result.turn.items) && ['inProgress', 'completed'].includes(result.turn.status as string);
      if (!accepted) throw new Error('delivery_unconfirmed');
      return {status: 'confirmed', commandId: intent.commandId, requestId: intent.requestId};
    }
  };
}
