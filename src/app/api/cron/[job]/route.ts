import { timingSafeEqual } from "node:crypto";
import { Receiver } from "@upstash/qstash";
import { JOBS, runJob, type JobName } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled jobs.
 *  - Vercel Cron (vercel.json) calls GET with "Authorization: Bearer <CRON_SECRET>".
 *  - Upstash QStash schedules (for frequent jobs on the Hobby plan) call POST with a signature.
 * `/api/cron/daily` runs every job in sequence.
 */
async function authorised(req: Request, body: string) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth.startsWith("Bearer ")) {
    const a = Buffer.from(auth.slice(7));
    const b = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  const sig = req.headers.get("upstash-signature");
  if (sig && process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY) {
    const receiver = new Receiver({ currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY });
    return receiver.verify({ signature: sig, body }).catch(() => false);
  }
  return false;
}

async function handle(req: Request, ctx: RouteContext<"/api/cron/[job]">) {
  const { job } = await ctx.params;
  const body = req.method === "POST" ? await req.text() : "";
  if (!(await authorised(req, body))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (job === "daily") {
    const results: Record<string, unknown> = {};
    for (const name of Object.keys(JOBS) as JobName[]) results[name] = await runJob(name);
    return Response.json(results);
  }
  if (!(job in JOBS)) return Response.json({ error: "unknown job" }, { status: 404 });
  const res = await runJob(job as JobName);
  return Response.json(res, { status: res.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
