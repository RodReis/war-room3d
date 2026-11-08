export type Presence = 'observada' | 'trabalhando' | 'aguardando' | 'desconhecida' | 'encerrada';
export type Freshness = 'atual' | 'desatualizado' | 'desconhecido';

export interface SessionState {
  presence: Presence;
  freshness: Freshness;
  lastSeen: string;
  sourceUnavailableAt: string | null;
}

export type SessionSignal = 'session.observed' | 'session.working' | 'session.waiting' | 'session.ended' | 'source.unavailable';

export function compareTimestamp(left: string, right: string): number {
  const pattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;
  const a = pattern.exec(left);
  const b = pattern.exec(right);
  if (!a || !b || Number.isNaN(Date.parse(left)) || Number.isNaN(Date.parse(right))) throw new Error('Timestamp UTC inválido');
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  const length = Math.max((a[2] ?? '').length, (b[2] ?? '').length);
  const fractionA = (a[2] ?? '').padEnd(length, '0');
  const fractionB = (b[2] ?? '').padEnd(length, '0');
  return fractionA === fractionB ? 0 : fractionA < fractionB ? -1 : 1;
}

export function reduceSession(current: SessionState | null, signal: SessionSignal, observedAt: string, allowResume = false): SessionState {
  if (current?.presence === 'encerrada' && !(allowResume && signal === 'session.observed' && compareTimestamp(observedAt,current.lastSeen) > 0)) return current;
  if (current && compareTimestamp(observedAt, current.lastSeen) < 0) return current;
  if (current?.sourceUnavailableAt && compareTimestamp(observedAt, current.sourceUnavailableAt) <= 0) return current;
  if (signal === 'source.unavailable') {
    if (!current) throw new Error('Fonte perdida sem sessão conhecida');
    return { ...current, presence: 'desconhecida', freshness: 'desatualizado', sourceUnavailableAt: observedAt };
  }
  const next: Record<Exclude<SessionSignal, 'source.unavailable'>, Presence> = {
    'session.observed': 'observada',
    'session.working': 'trabalhando',
    'session.waiting': 'aguardando',
    'session.ended': 'encerrada'
  };
  return { presence: next[signal], freshness: 'atual', lastSeen: observedAt, sourceUnavailableAt: null };
}

export function parentStatus(agentKey: string, parentAgentKey: string | null, knownAgentKeys: ReadonlySet<string>): 'principal' | 'vinculado' | 'vinculo_pendente' {
  if (!parentAgentKey) return 'principal';
  if (parentAgentKey === agentKey) throw new Error('Agente não pode ser pai de si mesmo');
  return knownAgentKeys.has(parentAgentKey) ? 'vinculado' : 'vinculo_pendente';
}
