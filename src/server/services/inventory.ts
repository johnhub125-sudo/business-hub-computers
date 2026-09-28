import "server-only";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Executor } from "../db";
import { inventory, inventoryReservations, inventoryTransactions } from "../db/schema";
import { UserError } from "../errors";

/**
 * Transactional inventory. Every change is a single conditional UPDATE (so two buyers can never
 * both take the last unit) plus a ledger row in inventory_transactions. DB CHECK constraints are a
 * second line of defence against negative stock. Always call these inside a transaction.
 */

export class OutOfStockError extends UserError {
  constructor(public variantId: string, message = "Sorry, an item in your order just went out of stock.") {
    super(message);
  }
}

type Ref = { referenceType: string; referenceId: string; userId?: string | null; note?: string };

async function ledger(
  tx: Executor,
  row: {
    variantId: string;
    type: (typeof inventoryTransactions.$inferInsert)["type"];
    quantity: number;
    reservedDelta?: number;
    onHandAfter: number;
    reservedAfter: number;
    idempotencyKey?: string;
  } & Ref,
) {
  await tx.insert(inventoryTransactions).values({
    variantId: row.variantId,
    type: row.type,
    quantity: row.quantity,
    reservedDelta: row.reservedDelta ?? 0,
    onHandAfter: row.onHandAfter,
    reservedAfter: row.reservedAfter,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    userId: row.userId ?? null,
    note: row.note,
    idempotencyKey: row.idempotencyKey,
  });
}

/** Releases expired reservations for the given variants (lazy expiry — correctness never waits for cron). */
export async function releaseExpired(tx: Executor, variantIds?: string[]) {
  const expired = await tx
    .select()
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.status, "active"),
        lt(inventoryReservations.expiresAt, new Date()),
        variantIds?.length ? inArray(inventoryReservations.variantId, variantIds) : undefined,
      ),
    )
    .orderBy(asc(inventoryReservations.variantId))
    .for("update", { skipLocked: true });
  for (const r of expired) {
    await releaseOne(tx, r, { referenceType: "order", referenceId: r.orderId, note: "Reservation expired" });
  }
  return expired.length;
}

async function releaseOne(tx: Executor, r: typeof inventoryReservations.$inferSelect, ref: Ref) {
  const [updated] = await tx
    .update(inventoryReservations)
    .set({ status: "released", resolvedAt: new Date() })
    .where(and(eq(inventoryReservations.id, r.id), eq(inventoryReservations.status, "active")))
    .returning({ id: inventoryReservations.id });
  if (!updated) return; // someone else already resolved it
  const [inv] = await tx
    .update(inventory)
    .set({ reserved: sql`GREATEST(${inventory.reserved} - ${r.quantity}, 0)`, updatedAt: new Date() })
    .where(eq(inventory.variantId, r.variantId))
    .returning({ onHand: inventory.onHand, reserved: inventory.reserved });
  await ledger(tx, {
    variantId: r.variantId,
    type: "release",
    quantity: 0,
    reservedDelta: -r.quantity,
    onHandAfter: inv?.onHand ?? 0,
    reservedAfter: inv?.reserved ?? 0,
    idempotencyKey: `release:${r.id}`,
    ...ref,
  });
}

/** Holds stock for an unpaid order. Throws OutOfStockError if any line can't be reserved. */
export async function reserve(
  tx: Executor,
  orderId: string,
  lines: { variantId: string; quantity: number; name?: string }[],
  expiresAt: Date,
  userId?: string | null,
) {
  const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId)); // consistent lock order → no deadlocks
  await releaseExpired(tx, sorted.map((l) => l.variantId));
  for (const l of sorted) {
    const [inv] = await tx
      .update(inventory)
      .set({ reserved: sql`${inventory.reserved} + ${l.quantity}`, updatedAt: new Date() })
      .where(and(eq(inventory.variantId, l.variantId), sql`${inventory.onHand} - ${inventory.reserved} >= ${l.quantity}`))
      .returning({ onHand: inventory.onHand, reserved: inventory.reserved });
    if (!inv) throw new OutOfStockError(l.variantId, `Sorry, ${l.name ?? "an item"} just sold out or has fewer units than requested.`);
    const [res] = await tx
      .insert(inventoryReservations)
      .values({ variantId: l.variantId, orderId, quantity: l.quantity, expiresAt })
      .returning({ id: inventoryReservations.id });
    await ledger(tx, {
      variantId: l.variantId,
      type: "reservation",
      quantity: 0,
      reservedDelta: l.quantity,
      onHandAfter: inv.onHand,
      reservedAfter: inv.reserved,
      referenceType: "order",
      referenceId: orderId,
      userId,
      idempotencyKey: `reserve:${res.id}`,
    });
  }
}

/** Releases all active reservations of an order (cancelled / failed / expired). */
export async function releaseOrder(tx: Executor, orderId: string, ref: Omit<Ref, "referenceType" | "referenceId"> = {}) {
  const active = await tx
    .select()
    .from(inventoryReservations)
    .where(and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "active")))
    .orderBy(asc(inventoryReservations.variantId))
    .for("update");
  for (const r of active) await releaseOne(tx, r, { referenceType: "order", referenceId: orderId, ...ref });
  return active.length;
}

/**
 * Converts an order's stock into a sale. Idempotent: a second call finds nothing active and the
 * ledger's unique idempotency key forbids a second deduction. If a reservation had expired
 * (e.g. very late payment) we deduct directly if stock allows; otherwise we report a shortage
 * instead of letting stock go negative.
 */
export async function commitOrder(
  tx: Executor,
  orderId: string,
  lines: { variantId: string; quantity: number }[],
  userId?: string | null,
): Promise<{ shortages: { variantId: string; quantity: number }[] }> {
  const shortages: { variantId: string; quantity: number }[] = [];
  const reservations = await tx
    .select()
    .from(inventoryReservations)
    .where(eq(inventoryReservations.orderId, orderId))
    .orderBy(asc(inventoryReservations.variantId))
    .for("update");

  for (const line of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    const key = `sale:${orderId}:${line.variantId}`;
    const [already] = await tx
      .select({ id: inventoryTransactions.id })
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.idempotencyKey, key));
    if (already) continue;

    const res = reservations.find((r) => r.variantId === line.variantId);
    let inv: { onHand: number; reserved: number } | undefined;
    if (res?.status === "active") {
      [inv] = await tx
        .update(inventory)
        .set({
          onHand: sql`${inventory.onHand} - ${line.quantity}`,
          reserved: sql`${inventory.reserved} - ${res.quantity}`,
          sold: sql`${inventory.sold} + ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(and(eq(inventory.variantId, line.variantId), sql`${inventory.onHand} >= ${line.quantity}`))
        .returning({ onHand: inventory.onHand, reserved: inventory.reserved });
      if (inv) {
        await tx
          .update(inventoryReservations)
          .set({ status: "committed", resolvedAt: new Date() })
          .where(eq(inventoryReservations.id, res.id));
      }
    } else {
      [inv] = await tx
        .update(inventory)
        .set({ onHand: sql`${inventory.onHand} - ${line.quantity}`, sold: sql`${inventory.sold} + ${line.quantity}`, updatedAt: new Date() })
        .where(and(eq(inventory.variantId, line.variantId), sql`${inventory.onHand} - ${inventory.reserved} >= ${line.quantity}`))
        .returning({ onHand: inventory.onHand, reserved: inventory.reserved });
    }
    if (!inv) {
      shortages.push(line);
      continue;
    }
    await ledger(tx, {
      variantId: line.variantId,
      type: "sale",
      quantity: -line.quantity,
      reservedDelta: res?.status === "active" ? -res.quantity : 0,
      onHandAfter: inv.onHand,
      reservedAfter: inv.reserved,
      referenceType: "order",
      referenceId: orderId,
      userId,
      idempotencyKey: key,
    });
  }
  return { shortages };
}

export type AdjustmentType = "purchase" | "adjustment" | "return" | "damage" | "correction";

/**
 * Manual/purchase stock movement. `delta` is the signed change to on-hand stock.
 * For "damage" the delta must be negative and the damaged counter increases.
 */
export async function adjustStock(
  tx: Executor,
  input: { variantId: string; delta: number; type: AdjustmentType; idempotencyKey?: string } & Ref,
) {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new UserError("Quantity must be a non-zero whole number.");
  await tx.insert(inventory).values({ variantId: input.variantId }).onConflictDoNothing();
  const set: Record<string, unknown> = { onHand: sql`${inventory.onHand} + ${input.delta}`, updatedAt: new Date() };
  if (input.type === "damage") set.damaged = sql`${inventory.damaged} + ${Math.abs(input.delta)}`;
  if (input.type === "return") set.returned = sql`${inventory.returned} + ${Math.abs(input.delta)}`;
  const [inv] = await tx
    .update(inventory)
    .set(set)
    .where(and(eq(inventory.variantId, input.variantId), sql`${inventory.onHand} + ${input.delta} >= ${inventory.reserved}`))
    .returning({ onHand: inventory.onHand, reserved: inventory.reserved });
  if (!inv) throw new UserError("That adjustment would make stock negative or below reserved units.");
  await ledger(tx, {
    variantId: input.variantId,
    type: input.type,
    quantity: input.delta,
    onHandAfter: inv.onHand,
    reservedAfter: inv.reserved,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    userId: input.userId,
    note: input.note,
    idempotencyKey: input.idempotencyKey,
  });
  return inv;
}
