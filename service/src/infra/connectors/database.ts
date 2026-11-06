import { performance } from 'node:perf_hooks';
import { Client, type ClientConfig } from 'pg';
import type { Probe } from './probe.ts';

export interface PostgresTarget {
  host: string;
  port: number;
  database: string;
  user: string;
  timeoutMs: number;
}

export type PasswordProvider = (signal: AbortSignal) => Promise<string>;

export interface DatabaseSession {
  connect(): Promise<void>;
  query(sql: string): Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export type DatabaseSessionFactory = (config: ClientConfig) => DatabaseSession;

const defaultSessionFactory: DatabaseSessionFactory = config => {
  const client = new Client(config);
  return {
    async connect() { await client.connect(); },
    query: sql => client.query(sql),
    end: () => client.end()
  };
};

function validName(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function postgresProbe(resourceId: string, sourceId: string, target: PostgresTarget,
  passwordProvider: PasswordProvider, sessionFactory: DatabaseSessionFactory = defaultSessionFactory,
  now: () => string = () => new Date().toISOString()): Probe {
  if (target.host !== '127.0.0.1' || !Number.isSafeInteger(target.port) || target.port < 1024 || target.port > 65535 ||
      !validName(target.database) || !validName(target.user) || !Number.isSafeInteger(target.timeoutMs) ||
      target.timeoutMs < 100 || target.timeoutMs > 30000 || typeof passwordProvider !== 'function')
    throw new Error('Alvo PostgreSQL deve ser loopback explícito, com porta, usuário e timeout válidos');
  let inFlight = false;
  return {
    resourceId, sourceId,
    async collect(signal) {
      if (inFlight) throw new Error('Consulta PostgreSQL anterior ainda em execução');
      if (signal.aborted) throw new Error('Sonda PostgreSQL cancelada');
      inFlight = true;
      let session: DatabaseSession | undefined;
      try {
        const password = await passwordProvider(signal);
        if (signal.aborted) throw new Error('Sonda PostgreSQL cancelada');
        if (!password) throw new Error('Credencial PostgreSQL indisponível');
        const config: ClientConfig = {
          host: target.host, port: target.port, database: target.database, user: target.user, password,
          ssl: false, connectionTimeoutMillis: target.timeoutMs, query_timeout: target.timeoutMs,
          statement_timeout: target.timeoutMs, idle_in_transaction_session_timeout: target.timeoutMs,
          application_name: 'war-room3d-health'
        };
        session = sessionFactory(config);
        const start = performance.now();
        await session.connect();
        if (signal.aborted) throw new Error('Sonda PostgreSQL cancelada');
        await session.query('BEGIN READ ONLY');
        if (signal.aborted) throw new Error('Sonda PostgreSQL cancelada');
        const result = await session.query('SELECT 1 AS ok');
        if (signal.aborted) throw new Error('Sonda PostgreSQL cancelada');
        await session.query('ROLLBACK');
        if (result.rowCount !== 1 || result.rows[0]?.ok !== 1)
          throw new Error('Consulta PostgreSQL não confirmou saúde');
        return {
          resourceId, sourceId, sourceVersion: 'postgres-read-only-1', health: 'saudavel', observedAt: now(),
          evidenceRef: 'postgres-select-1', indicator: 'latency', value: Math.round((performance.now() - start) * 100) / 100,
          unit: 'ms'
        };
      } finally {
        try { await session?.end(); }
        finally { inFlight = false; }
      }
    }
  };
}
