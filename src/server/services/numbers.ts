import "server-only";
import { sql } from "drizzle-orm";
import { BRAND_DEFAULTS } from "@/lib/brand";
import type { Executor } from "../db";

export type NumberKind = "order" | "tracking" | "receipt" | "ticket" | "purchase" | "refund";

const PREFIX: Record<NumberKind, string> = {
  order: "",
  tracking: "TRK-",
  receipt: "RCP-",
  ticket: "TKT-",
  purchase: "PO-",
  refund: "RFD-",
};

function lagosYear(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: BRAND_DEFAULTS.locale.timezone }).format(d));
}

/**
 * Allocates the next sequential number atomically (single UPDATE … RETURNING on a counter row),
 * e.g. BHC-2026-000001, BHC-TRK-2026-000001. Numbers are never reused, even if the surrounding
 * transaction later rolls back — gaps are acceptable, duplicates are impossible.
 */
export async function nextNumber(tx: Executor, kind: NumberKind, date = new Date()): Promise<string> {
  const year = lagosYear(date);
  const key = `${kind}:${year}`;
  const res = await tx.execute<{ value: string | number }>(sql`
    INSERT INTO counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value`);
  const n = Number(res.rows[0].value);
  return `${BRAND_DEFAULTS.orderPrefix}-${PREFIX[kind]}${year}-${String(n).padStart(6, "0")}`;
}
