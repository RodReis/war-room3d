import { performance } from 'node:perf_hooks';
import type { Probe } from './probe.ts';

export function httpProbe(resourceId: string, sourceId: string, approvedUrl: string,
  fetcher: typeof fetch = fetch, now: () => string = () => new Date().toISOString()): Probe {
  const target = new URL(approvedUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash)
    throw new Error('URL de sonda deve ser HTTP(S) explícita, sem credenciais ou parâmetros');
  return {
    resourceId, sourceId,
    async collect(signal) {
      const start = performance.now();
      const response = await fetcher(target, { method: 'GET', redirect: 'manual', cache: 'no-store', credentials: 'omit', signal });
      try {
        const latency = Math.round((performance.now() - start) * 100) / 100;
        if (response.status >= 300 && response.status < 500) throw new Error('Resposta HTTP não confirma saúde');
        if (response.status < 200 || response.status >= 600) throw new Error('Resposta HTTP inválida');
        return {
          resourceId, sourceId, sourceVersion: 'http-get-1', health: response.status < 300 ? 'saudavel' : 'degradado',
          observedAt: now(), evidenceRef: `http-status-${response.status}`, indicator: 'latency', value: latency, unit: 'ms'
        };
      } finally {
        await response.body?.cancel();
      }
    }
  };
}
