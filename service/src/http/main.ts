import { EventStore } from '../store/event-store.ts';
import { startReadOnlyServer } from './server.ts';

const databasePath = process.env.WR3D_DATABASE_PATH;
const token = process.env.WR3D_SERVICE_TOKEN;
const port = Number(process.env.WR3D_SERVICE_PORT);
if (!databasePath || !token || !Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error('Banco, token ou porta do serviço não configurados');
const store = new EventStore(databasePath);
try {
  const { server, url } = await startReadOnlyServer(store, token, port);
  process.stdout.write(`Serviço de leitura ativo em ${url}\n`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    server.closeAllConnections();
    server.close(() => store.close());
  });
} catch (error) { store.close(); throw error; }
