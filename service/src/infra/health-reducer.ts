import { compareTimestamp } from '../domain/session-reducer.ts';

export type ObservedHealth = 'saudavel' | 'degradado' | 'indisponivel' | 'sem_dados';
export type Health = ObservedHealth;
export type Coverage = 'atual' | 'perdida' | 'sem_dados';
export type Freshness = 'atual' | 'expirada' | 'sem_dados';
export interface Reading {
  resourceId: string;
  sourceId: string;
  sourceVersion: string;
  health: ObservedHealth;
  observedAt: string;
  evidenceRef: string | null;
  indicator?: string | null;
  value?: number | null;
  unit?: string | null;
}
export interface ResourceState {
  health: Health;
  lastHealth: ObservedHealth | null;
  freshness: Freshness;
  coverage: Coverage;
  observedAt: string | null;
  sourceId: string;
  sourceVersion: string | null;
  evidenceRef: string | null;
  indicator: string | null;
  value: number | null;
  unit: string | null;
}

export function reduceHealth(reading: Reading | null, sourceLostAt: string | null, staleAfterMs: number, now: string, sourceId: string): ResourceState {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('Relógio inválido');
  if (!reading) return { health: 'sem_dados', lastHealth: null, freshness: 'sem_dados', coverage: sourceLostAt ? 'perdida' : 'sem_dados', observedAt: null, sourceId, sourceVersion: null, evidenceRef: null, indicator: null, value: null, unit: null };
  const observedMs = Date.parse(reading.observedAt);
  if (!Number.isFinite(observedMs) || observedMs > nowMs) throw new Error('Horário da leitura inválido ou futuro');
  const lost = sourceLostAt !== null && compareTimestamp(sourceLostAt, reading.observedAt) >= 0;
  const stale = nowMs - observedMs > staleAfterMs;
  return {
    health: lost || stale ? 'sem_dados' : reading.health,
    lastHealth: reading.health,
    freshness: stale ? 'expirada' : 'atual',
    coverage: lost ? 'perdida' : 'atual',
    observedAt: reading.observedAt,
    sourceId,
    sourceVersion: reading.sourceVersion,
    evidenceRef: reading.evidenceRef,
    indicator: reading.indicator ?? null,
    value: reading.value ?? null,
    unit: reading.unit ?? null
  };
}
