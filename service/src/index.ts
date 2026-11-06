import { EventStore } from './store/event-store.ts';

export function createService(options: { listen: false; databasePath: string }): { store: EventStore; close: () => void } {
  if (options.listen !== false) throw new Error('Transporte HTTP pertence à próxima fatia');
  const store = new EventStore(options.databasePath);
  return { store, close: () => store.close() };
}
