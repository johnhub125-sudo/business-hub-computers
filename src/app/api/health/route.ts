import { sql } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@/server/db";
import { integrations } from "@/server/env";

export const dynamic = "force-dynamic";

/**
 * Public liveness check for uptime monitors (e.g. UptimeRobot, Better Stack).
 * Reports only up/down booleans — no versions, hosts or secrets. Full diagnostics are in
 * Admin → Security & health.
 */
export async function GET() {
  let database = false;
  if (isDatabaseConfigured()) {
    try {
      await db.execute(sql`select 1`);
      database = true;
    } catch {
      database = false;
    }
  }
  const body = { ok: database && integrations.auth(), database, auth: integrations.auth(), time: new Date().toISOString() };
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
