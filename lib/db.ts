/**
 * Tiny database layer.
 * - Production (Render): real Postgres via DATABASE_URL.
 * - Local / judges: embedded Postgres (PGlite) in ./.data, zero setup.
 * Both expose the same `query(sql, params) -> { rows }` shape, so the rest of
 * the app writes plain SQL once.
 */
import "server-only";
import { SCHEMA_SQL } from "./schema";

type Row = Record<string, any>;
interface Driver {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}

const g = globalThis as unknown as { __holdonDb?: Promise<Driver> };

async function makeDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    return {
      query: async (sql, params) => {
        const r = await pool.query(sql, params as any[]);
        return { rows: r.rows };
      },
      exec: async (sql) => {
        await pool.query(sql);
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || "./.data/pglite";
  const db = new PGlite(dir);
  return {
    query: async (sql, params) => {
      const r = await db.query(sql, params as any[]);
      return { rows: r.rows as any[] };
    },
    exec: async (sql) => {
      await db.exec(sql);
    },
  };
}

export async function db(): Promise<Driver> {
  if (!g.__holdonDb) {
    g.__holdonDb = (async () => {
      const d = await makeDriver();
      await d.exec(SCHEMA_SQL);
      return d;
    })();
  }
  return g.__holdonDb;
}

export async function q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await db();
  return (await d.query<T>(sql, params)).rows;
}

export async function one<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}
