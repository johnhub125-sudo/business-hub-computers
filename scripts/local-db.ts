/**
 * Local development database: a real Postgres engine (PGlite, WASM) exposed over the Postgres
 * wire protocol on 127.0.0.1:5433. Data persists in ./.data/pglite.
 *
 * This exists only so the app can run end-to-end before a Neon database is connected.
 * Preview and production always use Neon via DATABASE_URL.
 *
 *   npm run db:local
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { mkdirSync } from "node:fs";

async function main() {
  const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
  mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir);
  const port = Number(process.env.PGLITE_PORT ?? 5433);
  // A few multiplexed connections so a restarted dev server (or a script) can connect while an old
  // socket is still being torn down. The app still uses a pool of 1 locally (DB_POOL_MAX=1).
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 4 });
  await server.start();
  console.log(`✓ local Postgres (PGlite) listening on postgres://postgres:postgres@127.0.0.1:${port}/postgres`);

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
