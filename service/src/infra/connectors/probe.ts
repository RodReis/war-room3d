import type { Reading } from '../health-reducer.ts';
import type { InfrastructureStore } from '../infrastructure-store.ts';

export interface Probe {
  resourceId: string;
  sourceId: string;
  collect(signal: AbortSignal): Promise<Reading>;
}

export class CollectorRunner {
  private running = false;
  private readonly store: InfrastructureStore;
  private readonly probes: readonly Probe[];
  private readonly timeoutMs: number;
  private readonly now: () => string;
  constructor(store: InfrastructureStore, probes: readonly Probe[], timeoutMs: number, now: () => string = () => new Date().toISOString()) {
    this.store = store;
    this.probes = probes;
    this.timeoutMs = timeoutMs;
    this.now = now;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('Timeout de coleta inválido');
    const ids = new Set(probes.map(probe => probe.resourceId));
    if (ids.size !== probes.length) throw new Error('Sonda duplicada para recurso');
  }

  async collectOnce(): Promise<{ collected: string[]; failed: string[] }> {
    if (this.running) throw new Error('Coleta simultânea não permitida');
    this.running = true;
    const collected: string[] = [];
    const failed: string[] = [];
    try {
      for (const probe of this.probes) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const reading = await Promise.race([
            probe.collect(controller.signal),
            new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Tempo limite da sonda')), { once: true }))
          ]);
          if (reading.resourceId !== probe.resourceId || reading.sourceId !== probe.sourceId) throw new Error('Sonda retornou identidade diferente');
          this.store.recordReading(reading, this.now());
          collected.push(probe.resourceId);
        } catch {
          // Falha da sonda reduz cobertura; não cria incidente de serviço sem evidência.
          this.store.markResourceCollectionFailed(probe.resourceId, this.now());
          failed.push(probe.resourceId);
        } finally { clearTimeout(timer); }
      }
      return { collected, failed };
    } finally { this.running = false; }
  }
}
