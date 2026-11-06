import { EventStore } from './store/event-store.ts';

export function createService(options: { listen: false; databasePath: string }): { store: EventStore; close: () => void } {
  if (options.listen !== false) throw new Error('Inicie o transporte com startReadOnlyServer');
  const store = new EventStore(options.databasePath);
  return { store, close: () => store.close() };
}
