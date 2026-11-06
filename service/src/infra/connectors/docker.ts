import type { Probe } from './probe.ts';
import type { DockerSnapshot } from './docker-proxy.ts';

export function dockerContainerProbe(resourceId: string, sourceId: string, containerName: string, proxyUrl: string,
  token: string, fetcher: typeof fetch = fetch): Probe {
  const target = new URL(proxyUrl);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.pathname !== '/v1/snapshot' || target.search || target.hash ||
      target.username || target.password || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(containerName) || Buffer.byteLength(token) < 32)
    throw new Error('Configuração do conector Docker inválida');
  return {
    resourceId, sourceId,
    async collect(signal) {
      const response = await fetcher(target, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', cache: 'no-store', signal });
      try {
        if (response.status !== 200) throw new Error('Proxy Docker indisponível');
        const snapshot = await response.json() as DockerSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.containers) || typeof snapshot.observedAt !== 'string' ||
            !Number.isFinite(Date.parse(snapshot.observedAt))) throw new Error('Snapshot Docker inválido');
        const matches = snapshot.containers.filter(item => item.name === containerName);
        if (matches.length !== 1) throw new Error('Contêiner Docker não observado de forma única');
        const item = matches[0];
        const health = item.state === 'running'
          ? item.health === 'healthy' ? 'saudavel' : item.health === 'unhealthy' ? 'degradado' : 'sem_dados'
          : item.state === 'exited' || item.state === 'dead' ? 'indisponivel' : 'sem_dados';
        return {
          resourceId, sourceId, sourceVersion: 'docker-list-29-1', health,
          observedAt: snapshot.observedAt, evidenceRef: `docker-${item.state}-${item.health}`
        };
      } finally { if (response.body && !response.bodyUsed) await response.body.cancel(); }
    }
  };
}
