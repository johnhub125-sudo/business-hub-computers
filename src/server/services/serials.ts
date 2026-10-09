import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "../db";
import { orderItems, productSerials } from "../db/schema";
import { UserError } from "../errors";

type Executor = Tx | typeof db;

/**
 * Gives every paid order line its serial numbers, oldest stock first, and marks those units sold.
 * Safe to call again: a line that already has its serials is left alone. Products without recorded
 * serial numbers are simply skipped.
 */
export async function assignSerials(tx: Executor, orderId: string) {
  const items = await tx.select({ id: orderItems.id, productId: orderItems.productId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId));
  let assigned = 0;
  for (const item of items) {
    if (!item.productId) continue;
    const [{ have }] = await tx.select({ have: sql<number>`count(*)::int` }).from(productSerials).where(eq(productSerials.orderItemId, item.id));
    const need = item.quantity - have;
    if (need <= 0) continue;
    const free = await tx
      .select({ id: productSerials.id })
      .from(productSerials)
      .where(and(eq(productSerials.productId, item.productId), eq(productSerials.status, "in_stock")))
      .orderBy(asc(productSerials.createdAt), asc(productSerials.serial))
      .limit(need)
      .for("update", { skipLocked: true });
    if (!free.length) continue;
    await tx.update(productSerials).set({ status: "sold", soldAt: new Date(), orderItemId: item.id }).where(inArray(productSerials.id, free.map((f) => f.id)));
    assigned += free.length;
  }
  return assigned;
}

/** Puts an order's units back in stock (cancelled order). */
export async function releaseSerials(tx: Executor, orderId: string) {
  const items = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
  if (!items.length) return;
  await tx.update(productSerials).set({ status: "in_stock", soldAt: null, orderItemId: null }).where(inArray(productSerials.orderItemId, items.map((i) => i.id)));
}

/** order item id → its serial numbers. */
export async function serialsByItem(itemIds: string[]): Promise<Map<string, { id: string; serial: string }[]>> {
  const out = new Map<string, { id: string; serial: string }[]>();
  if (!itemIds.length) return out;
  const rows = await db.select({ id: productSerials.id, serial: productSerials.serial, itemId: productSerials.orderItemId }).from(productSerials).where(inArray(productSerials.orderItemId, itemIds)).orderBy(asc(productSerials.serial));
  for (const r of rows) out.set(r.itemId!, [...(out.get(r.itemId!) ?? []), { id: r.id, serial: r.serial }]);
  return out;
}

/** Units of the same products still in stock — the choices when staff hand over a different unit. */
export async function freeSerials(productIds: string[]): Promise<Map<string, { id: string; serial: string }[]>> {
  const out = new Map<string, { id: string; serial: string }[]>();
  if (!productIds.length) return out;
  const rows = await db.select({ id: productSerials.id, serial: productSerials.serial, productId: productSerials.productId }).from(productSerials).where(and(inArray(productSerials.productId, productIds), eq(productSerials.status, "in_stock"))).orderBy(asc(productSerials.serial));
  for (const r of rows) out.set(r.productId, [...(out.get(r.productId) ?? []), { id: r.id, serial: r.serial }]);
  return out;
}

/** The unit actually handed over was a different one: swap it on the order. */
export async function swapSerial(fromId: string, toId: string) {
  return db.transaction(async (tx) => {
    const [from] = await tx.select().from(productSerials).where(eq(productSerials.id, fromId)).for("update");
    const [to] = await tx.select().from(productSerials).where(eq(productSerials.id, toId)).for("update");
    if (!from?.orderItemId || !to) throw new UserError("That serial number is no longer on this order.");
    if (to.productId !== from.productId || to.status !== "in_stock") throw new UserError(`${to.serial} is not available for this product.`);
    await tx.update(productSerials).set({ status: "sold", soldAt: from.soldAt ?? new Date(), orderItemId: from.orderItemId }).where(eq(productSerials.id, to.id));
    await tx.update(productSerials).set({ status: "in_stock", soldAt: null, orderItemId: null }).where(eq(productSerials.id, from.id));
    const [item] = await tx.select({ orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.id, from.orderItemId));
    return { orderId: item.orderId, from: from.serial, to: to.serial };
  });
}
