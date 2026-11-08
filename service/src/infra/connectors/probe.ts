import type { Reading } from '../health-reducer.ts';
import type { InfrastructureStore } from '../infrastructure-store.ts';
import type { OperationReadingSink } from '../../operations/operation-collector.ts';

export interface Probe {
  resourceId: string;
  sourceId: string;
  collect(signal: AbortSignal): Promise<Reading>;
}

export class CollectorRunner {
  private running = false;
  private scheduled = false;
  private timer: NodeJS.Timeout | null = null;
  private pending: Promise<void> | null = null;
  lastError: Error | null = null;
  private readonly store: InfrastructureStore;
  private readonly probes: readonly Probe[];
  private readonly timeoutMs: number;
  private readonly now: () => string;
  private readonly operationSink?: OperationReadingSink;
  constructor(store: InfrastructureStore, probes: readonly Probe[], timeoutMs: number, now: () => string = () => new Date().toISOString(), operationSink?: OperationReadingSink) {
    this.store = store;
    this.probes = probes;
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.operationSink = operationSink;
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
          const receivedAt=this.now();
          this.store.recordReading(reading, receivedAt);
          try { this.operationSink?.record(reading, receivedAt); } catch { /* M5 sink failure does not invalidate M2 health evidence. */ }
          collected.push(probe.resourceId);
        } catch {
          // Falha da sonda reduz cobertura; não cria incidente de serviço sem evidência.
          this.store.markResourceCollectionFailed(probe.resourceId, this.now());
          try { this.operationSink?.unavailable(probe.resourceId); } catch { /* M5 coverage remains stale if its state cannot be updated. */ }
          failed.push(probe.resourceId);
        } finally { clearTimeout(timer); }
      }
      return { collected, failed };
    } finally { this.running = false; }
  }

  start(intervalMs: number): void {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 3600000) throw new Error('Intervalo de coleta inválido');
    if (this.scheduled) throw new Error('Coleta periódica já iniciada');
    this.scheduled = true;
    this.lastError = null;
    const tick = async (): Promise<void> => {
      try { await this.collectOnce(); }
      catch (error) {
        this.lastError = error instanceof Error ? error : new Error('Falha na coleta periódica');
        this.scheduled = false;
      }
      if (this.scheduled) this.timer = setTimeout(() => { this.pending = tick(); }, intervalMs);
    };
    this.timer = setTimeout(() => { this.pending = tick(); }, 0);
  }

  async stop(): Promise<void> {
    this.scheduled = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.pending;
    this.pending = null;
  }
}
