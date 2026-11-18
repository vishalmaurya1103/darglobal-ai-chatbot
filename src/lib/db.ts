import { Pool } from "pg";
import { config } from "./config";

// Reuse one pool per process; Next.js dev reloads would otherwise open a new pool per change.
const globalForDb = globalThis as typeof globalThis & { pgPool?: Pool };

/**
 * node-postgres over Neon's pooled (PgBouncer) endpoint. The app runs as a
 * long-lived Node server in Docker, so a small client-side pool is the right fit.
 */
export function getPool(): Pool {
  globalForDb.pgPool ??= new Pool({ connectionString: config.databaseUrl, max: 5 });
  return globalForDb.pgPool;
}

export function toSqlVector(values: number[]): string {
  return `[${values.join(",")}]`;
}
