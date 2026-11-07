import { sessionKey } from '../../domain/identity.ts';
import type { CommandIntent } from '../types.ts';
import type { SessionChannel } from './jsonl-channel.ts';

export interface OwnedSession {
  provider: 'claude' | 'codex';
  providerVersion: string;
  projectId: string;
  accountRef: string;
  providerSessionId: string;
  connectionId: string;
}

export function bindOwnedSession(binding: OwnedSession, provider: OwnedSession['provider'], supportedVersion: string): Readonly<OwnedSession> {
  if (binding.provider !== provider || binding.providerVersion !== supportedVersion ||
      ![binding.projectId, binding.accountRef, binding.providerSessionId, binding.connectionId].every(value => typeof value === 'string' && value.trim().length > 0))
    throw new Error('unsupported_provider_binding');
  return Object.freeze({...binding});
}

export function assertOwnedMessage(binding: OwnedSession, channel: SessionChannel, intent: Readonly<CommandIntent>, signal: AbortSignal): void {
  if (!channel.isOpen || channel.connectionId !== binding.connectionId || signal.aborted ||
      intent.mode !== 'live' || intent.provider !== binding.provider || intent.providerVersion !== binding.providerVersion ||
      intent.projectId !== binding.projectId || intent.sessionKey !== sessionKey(binding.provider, binding.accountRef, binding.providerSessionId) ||
      intent.action !== 'send_message' || intent.requestId !== null || typeof intent.payload.text !== 'string' || !intent.payload.text.trim() ||
      Date.parse(intent.deadlineAt) <= Date.now() || !Number.isFinite(Date.parse(intent.deadlineAt)))
    throw new Error('provider_target_unavailable');
}
