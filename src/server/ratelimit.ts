import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "./db";
import { integrations } from "./env";

export type RateRule = { window: number; max: number };

/** Named limits used across the app (window in seconds). */
export const RATE_LIMITS = {
  login: { window: 15 * 60, max: 10 },
  register: { window: 60 * 60, max: 5 },
  passwordReset: { window: 60 * 60, max: 5 },
  otp: { window: 10 * 60, max: 5 },
  search: { window: 60, max: 60 },
  checkout: { window: 60, max: 10 },
  paymentInit: { window: 60, max: 10 },
  paymentVerify: { window: 60, max: 30 },
  admin: { window: 60, max: 240 },
  support: { window: 60 * 60, max: 10 },
  publicApi: { window: 60, max: 120 },
  upload: { window: 60 * 60, max: 60 },
} satisfies Record<string, RateRule>;

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function upstashLimiter(rule: RateRule) {
  redis ??= Redis.fromEnv();
  const id = `${rule.max}:${rule.window}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(rule.max, `${rule.window} s`), prefix: "bhc:rl" });
    limiters.set(id, limiter);
  }
  return limiter;
}

/**
 * Atomically counts a request against `key`. Uses Upstash Redis when configured, otherwise a
 * single atomic upsert in Postgres (safe under concurrency).
 */
export async function consume(key: string, rule: RateRule): Promise<{ allowed: boolean; retryAfter: number | null }> {
  if (integrations.redis()) {
    const res = await upstashLimiter(rule).limit(key);
    return { allowed: res.success, retryAfter: res.success ? null : Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) };
  }
  const result = await db.execute<{ count: number; window_start: Date }>(sql`
    INSERT INTO app_rate_limits (key, count, window_start) VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => ${rule.window}) THEN 1 ELSE app_rate_limits.count + 1 END,
      window_start = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => ${rule.window}) THEN now() ELSE app_rate_limits.window_start END
    RETURNING count, window_start`);
  const row = result.rows[0];
  const count = Number(row.count);
  if (count <= rule.max) return { allowed: true, retryAfter: null };
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return { allowed: false, retryAfter: Math.max(1, Math.ceil(rule.window - elapsed)) };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number | null) {
    super("Too many requests. Please wait a moment and try again.");
  }
}

/** Throws RateLimitError when over the limit. `scope` is usually IP or user id. */
export async function enforceRateLimit(name: keyof typeof RATE_LIMITS, scope?: string) {
  const who = scope ?? (await clientIp());
  const res = await consume(`${name}:${who}`, RATE_LIMITS[name]);
  if (!res.allowed) throw new RateLimitError(res.retryAfter);
}
