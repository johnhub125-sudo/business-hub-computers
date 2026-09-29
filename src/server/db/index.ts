import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One Postgres pool per server instance. Works with Neon (production/preview), any standard
 * Postgres, and the local PGlite dev server (`npm run db:local`).
 */
function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Run `npm run db:local` for a local database, or connect Neon in Vercel (see docs/setup/vercel.md).",
    );
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || (isLocal ? 1 : 10)),
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __bhcPool?: Pool; __bhcDb?: DB };

function getDb(): DB {
  if (!globalForDb.__bhcDb) {
    const pool = globalForDb.__bhcPool ?? createPool();
    globalForDb.__bhcPool = pool;
    globalForDb.__bhcDb = drizzle({ client: pool, schema, casing: "snake_case" });
    try {
      // Lets Vercel Fluid compute close idle clients before a function instance is suspended.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { attachDatabasePool } = require("@vercel/functions") as typeof import("@vercel/functions");
      if (process.env.VERCEL) attachDatabasePool(pool);
    } catch {
      /* optional */
    }
  }
  return globalForDb.__bhcDb;
}

/** Lazily-connected database. Importing this module never opens a connection by itself. */
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Database = DB;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run queries: the root db or an open transaction. */
export type Executor = DB | Tx;

/** Closes the pool (scripts/tests). */
export async function closeDb() {
  await globalForDb.__bhcPool?.end();
  globalForDb.__bhcPool = undefined;
  globalForDb.__bhcDb = undefined;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
