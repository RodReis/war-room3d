import type Database from 'better-sqlite3';

export type StateChangeType = 'project.changed' | 'resource.changed' | 'dependency.changed';

// Chamar dentro da mesma transação da mudança de estado.
export function appendStateChange(db: Database.Database, type: StateChangeType, objectId: string | null, observedAt: string): number {
  db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'stream_sequence'").run();
  const sequence = (db.prepare("SELECT value FROM meta WHERE key = 'stream_sequence'").get() as { value: number }).value;
  db.prepare('INSERT INTO state_changes(stream_sequence, type, object_id, observed_at) VALUES (?, ?, ?, ?)')
    .run(sequence, type, objectId, observedAt);
  const oldest = db.prepare('SELECT stream_sequence AS sequence FROM state_changes ORDER BY stream_sequence DESC LIMIT 1 OFFSET 1000')
    .get() as { sequence: number } | undefined;
  if (oldest) {
    db.prepare("UPDATE meta SET value = max(value, ?) WHERE key = 'transport_baseline'").run(oldest.sequence);
    db.prepare('DELETE FROM state_changes WHERE stream_sequence <= ?').run(oldest.sequence);
  }
  return sequence;
}
