export type Presence = 'observada' | 'trabalhando' | 'aguardando' | 'desconhecida' | 'encerrada';
export type Freshness = 'atual' | 'desatualizado' | 'desconhecido';

export interface SessionState {
  presence: Presence;
  freshness: Freshness;
  lastSeen: string;
}

export type SessionSignal = 'session.observed' | 'session.working' | 'session.waiting' | 'session.ended' | 'source.unavailable';

export function reduceSession(current: SessionState | null, signal: SessionSignal, observedAt: string): SessionState {
  if (current?.presence === 'encerrada') return current;
  if (signal !== 'source.unavailable' && current && observedAt < current.lastSeen) return current;
  if (signal === 'source.unavailable') {
    if (!current) throw new Error('Fonte perdida sem sessão conhecida');
    return { ...current, presence: 'desconhecida', freshness: 'desatualizado' };
  }
  const next: Record<Exclude<SessionSignal, 'source.unavailable'>, Presence> = {
    'session.observed': 'observada',
    'session.working': 'trabalhando',
    'session.waiting': 'aguardando',
    'session.ended': 'encerrada'
  };
  return { presence: next[signal], freshness: 'atual', lastSeen: observedAt };
}

export function parentStatus(agentKey: string, parentAgentKey: string | null, knownAgentKeys: ReadonlySet<string>): 'principal' | 'vinculado' | 'vinculo_pendente' {
  if (!parentAgentKey) return 'principal';
  if (parentAgentKey === agentKey) throw new Error('Agente não pode ser pai de si mesmo');
  return knownAgentKeys.has(parentAgentKey) ? 'vinculado' : 'vinculo_pendente';
}
