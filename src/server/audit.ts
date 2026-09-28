import "server-only";
import { headers } from "next/headers";
import { db, type Executor } from "./db";
import { auditLogs, securityEvents } from "./db/schema";
import { redact } from "./logger";

type Actor = { id: string; email?: string | null; roleLabel?: string | null } | null;

async function requestMeta() {
  try {
    const h = await headers();
    return {
      ip: h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    return { ip: null, userAgent: null }; // outside a request (scripts, cron)
  }
}

export type AuditInput = {
  actor: Actor;
  action: string; // e.g. "product.price_changed"
  module: string; // e.g. "Products"
  description: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  status?: "success" | "failure";
};

/** Records an audit event. Pass `tx` to make the audit row part of the same transaction. */
export async function audit(input: AuditInput, tx: Executor = db) {
  const meta = await requestMeta();
  await tx.insert(auditLogs).values({
    actorId: input.actor?.id ?? null,
    actorEmail: input.actor?.email ?? null,
    actorRole: input.actor?.roleLabel ?? null,
    action: input.action,
    module: input.module,
    description: input.description,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before === undefined ? null : redact(input.before),
    after: input.after === undefined ? null : redact(input.after),
    ip: meta.ip,
    userAgent: meta.userAgent,
    status: input.status ?? "success",
  });
}

export async function securityEvent(input: {
  type: string;
  userId?: string | null;
  email?: string | null;
  severity?: "info" | "warning" | "critical";
  meta?: Record<string, unknown>;
}) {
  const m = await requestMeta();
  await db.insert(securityEvents).values({
    type: input.type,
    userId: input.userId ?? null,
    email: input.email ?? null,
    severity: input.severity ?? "info",
    ip: m.ip,
    userAgent: m.userAgent,
    meta: input.meta ? (redact(input.meta) as Record<string, unknown>) : null,
  });
}

/** Shallow diff for before/after audit payloads — only keeps changed keys. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = before[key];
    const next = after[key as keyof T];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[key] = prev;
      a[key] = next;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
