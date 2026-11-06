import os from 'node:os';
import type { Probe } from './probe.ts';

export function localHostProbe(resourceId: string, sourceId: string, now: () => string = () => new Date().toISOString()): Probe {
  return {
    resourceId, sourceId,
    async collect(signal) {
      if (signal.aborted) throw new Error('Sonda cancelada');
      const total = os.totalmem();
      const free = os.freemem();
      if (total <= 0 || free < 0 || free > total) throw new Error('Métrica de memória inválida');
      return {
        resourceId, sourceId, sourceVersion: 'node-os-1', health: 'sem_dados', observedAt: now(),
        evidenceRef: 'host-memory-sample', indicator: 'memory_used', value: Math.round((1 - free / total) * 10000) / 100, unit: 'percent'
      };
    }
  };
}
