import { dockerEngineReader, startDockerSnapshotProxy } from './docker-proxy.ts';

const composeProject = process.env.WR3D_DOCKER_COMPOSE_PROJECT;
const composeWorkingDir = process.env.WR3D_DOCKER_COMPOSE_WORKDIR;
const token = process.env.WR3D_DOCKER_PROXY_TOKEN;
const port = Number(process.env.WR3D_DOCKER_PROXY_PORT);
if (!composeProject || !composeWorkingDir || !token || !Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error('Escopo, token ou porta do proxy Docker não configurados');

const { server, url } = await startDockerSnapshotProxy(dockerEngineReader(), { composeProject, composeWorkingDir }, token, port);
process.stdout.write(`Proxy Docker restrito ativo em ${url}\n`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close());
