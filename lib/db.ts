import "server-only";
import { SCHEMA_SQL } from "./schema";

/**
 * Tiny SQL layer. Real Postgres when DATABASE_URL is set (Render);
 * otherwise embedded Postgres (PGlite) in .data/ so local dev needs zero setup.
 */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Driver {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  exec(sql: string): Promise<unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __holdonDb: Promise<Driver> | undefined;
}

async function open(): Promise<Driver> {
  let driver: Driver;
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    driver = { query: (s, p) => pool.query(s, p as unknown[]), exec: (s) => pool.query(s) };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite(process.env.PGLITE_DIR ?? ".data/pglite");
    driver = {
      query: (s, p) => pg.query(s, p) as Promise<{ rows: Row[] }>,
      exec: (s) => pg.exec(s),
    };
  }
  await driver.exec(SCHEMA_SQL);
  return driver;
}

export function db(): Promise<Driver> {
  globalThis.__holdonDb ??= open();
  return globalThis.__holdonDb;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await (await db()).query(sql, params)).rows as T[];
}

/** First row or null. */
export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null;
}
