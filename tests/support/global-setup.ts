/**
 * Starts a throwaway in-memory Postgres (PGlite) on :5544 and applies the real migrations,
 * so tests exercise actual SQL, constraints and transactions — not mocks.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export default async function setup() {
  const pg = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pg, port: 5544, host: "127.0.0.1" });
  await server.start();
  const pool = new Pool({ connectionString: "postgres://postgres:postgres@127.0.0.1:5544/postgres", max: 1 });
  await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  await pool.end();
  return async () => {
    await server.stop();
    await pg.close();
  };
}
