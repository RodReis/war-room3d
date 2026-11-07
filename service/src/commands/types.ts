export const actions = ['send_message', 'answer_question', 'decide_permission'] as const;
export type CommandAction = typeof actions[number];
export type CommandState = 'requested' | 'validated' | 'sending' | 'confirmed' | 'rejected' | 'expired' | 'unknown';
export interface CommandIntent {
  schemaVersion: '1.0'; commandId: string; idempotencyKey: string; mode: 'live' | 'demo' | 'replay';
  projectId: string; sessionKey: string; provider: 'claude' | 'codex'; providerVersion: string; action: CommandAction;
  requestId: string | null; deadlineAt: string; payload: { text?: string; decision?: 'allow' | 'deny' }; confirmationId: string | null;
}
export interface CommandActor { actorId: string; projectIds: readonly string[]; }
export interface CommandTarget { projectId: string; sessionKey: string; provider: 'claude' | 'codex'; providerVersion: string; active: boolean; }
export interface CapabilityProof {
  provider: 'claude' | 'codex'; providerVersion: string; adapterVersion: string; projectId: string; sessionKey: string;
  action: CommandAction; evidenceRef: string; provenAt: string; validUntil: string;
}
export interface ActiveRequest {
  requestId: string; sessionKey: string; projectId: string; action: 'answer_question' | 'decide_permission';
  originalContext: string; consequence: string; sourceRef: string; deadlineAt: string;
}
export interface CommandAdapter {
  provider: 'claude' | 'codex'; version: string; actions: readonly CommandAction[];
  send(intent: Readonly<CommandIntent>, signal: AbortSignal): Promise<{status:'confirmed'|'rejected';commandId:string;requestId:string|null}>;
}
export class CommandError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, status = 409) { super(code); this.code = code; this.status = status; }
}
