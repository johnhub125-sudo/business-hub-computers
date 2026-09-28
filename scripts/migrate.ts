/**
 * Applies pending SQL migrations from ./drizzle. Safe to run repeatedly (already-applied
 * migrations are skipped). Never generates or drops anything by itself.
 *
 *   npm run db:migrate
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({ connectionString: url, max: 1, ssl: isLocal ? undefined : { rejectUnauthorized: true } });
  const db = drizzle({ client: pool });
  const started = Date.now();
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log(`✓ migrations applied in ${Date.now() - started}ms`);
  await pool.end();
}

main().catch((err) => {
  console.error("✗ migration failed:", err);
  process.exit(1);
});
