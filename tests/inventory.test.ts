import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adjustStock, commitOrder, releaseOrder, reserve } from "@/server/services/inventory";
import { makeCatalog, resetDb, stockOf } from "./support/fixtures";

beforeEach(resetDb);
const later = () => new Date(Date.now() + 60_000);

describe("inventory", () => {
  it("reserves, releases and commits atomically", async () => {
    const { variant } = await makeCatalog({ stock: 5 });
    const orderId = randomUUID();
    await db.transaction((tx) => reserve(tx, orderId, [{ variantId: variant.id, quantity: 2 }], later()));
    expect(await stockOf(variant.id)).toEqual({ onHand: 5, reserved: 2, sold: 0 });
    await db.transaction((tx) => commitOrder(tx, orderId, [{ variantId: variant.id, quantity: 2 }]));
    expect(await stockOf(variant.id)).toEqual({ onHand: 3, reserved: 0, sold: 2 });

    const o2 = randomUUID();
    await db.transaction((tx) => reserve(tx, o2, [{ variantId: variant.id, quantity: 3 }], later()));
    await db.transaction((tx) => releaseOrder(tx, o2));
    expect(await stockOf(variant.id)).toEqual({ onHand: 3, reserved: 0, sold: 2 });
  });

  it("never oversells: only one of many concurrent buyers gets the last unit", async () => {
    const { variant } = await makeCatalog({ stock: 1 });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => db.transaction((tx) => reserve(tx, randomUUID(), [{ variantId: variant.id, quantity: 1 }], later()))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await stockOf(variant.id)).toEqual({ onHand: 1, reserved: 1, sold: 0 });
  });

  it("commit is idempotent — a duplicate call never deducts twice", async () => {
    const { variant } = await makeCatalog({ stock: 5 });
    const orderId = randomUUID();
    await db.transaction((tx) => reserve(tx, orderId, [{ variantId: variant.id, quantity: 1 }], later()));
    await db.transaction((tx) => commitOrder(tx, orderId, [{ variantId: variant.id, quantity: 1 }]));
    await db.transaction((tx) => commitOrder(tx, orderId, [{ variantId: variant.id, quantity: 1 }]));
    expect(await stockOf(variant.id)).toEqual({ onHand: 4, reserved: 0, sold: 1 });
  });

  it("expired reservations free stock lazily for the next buyer", async () => {
    const { variant } = await makeCatalog({ stock: 1 });
    await db.transaction((tx) => reserve(tx, randomUUID(), [{ variantId: variant.id, quantity: 1 }], new Date(Date.now() - 1000)));
    await db.transaction((tx) => reserve(tx, randomUUID(), [{ variantId: variant.id, quantity: 1 }], later()));
    expect(await stockOf(variant.id)).toEqual({ onHand: 1, reserved: 1, sold: 0 });
  });

  it("reports a shortage instead of going negative when a late payment finds no stock", async () => {
    const { variant } = await makeCatalog({ stock: 1 });
    const late = randomUUID();
    await db.transaction((tx) => reserve(tx, late, [{ variantId: variant.id, quantity: 1 }], new Date(Date.now() - 1000)));
    await db.transaction((tx) => reserve(tx, randomUUID(), [{ variantId: variant.id, quantity: 1 }], later())); // someone else takes it
    const res = await db.transaction((tx) => commitOrder(tx, late, [{ variantId: variant.id, quantity: 1 }]));
    expect(res.shortages).toHaveLength(1);
    expect((await stockOf(variant.id)).onHand).toBe(1);
  });

  it("blocks adjustments that would make stock negative and the DB rejects negatives outright", async () => {
    const { variant } = await makeCatalog({ stock: 2 });
    await expect(
      db.transaction((tx) => adjustStock(tx, { variantId: variant.id, delta: -3, type: "damage", referenceType: "manual", referenceId: "t" })),
    ).rejects.toThrow(/negative/);
    // Second line of defence: CHECK constraints in the database itself.
    const checks = await db.execute<{ conname: string }>(
      sql`SELECT conname FROM pg_constraint WHERE conrelid = 'inventory'::regclass AND contype = 'c'`,
    );
    expect(checks.rows.map((r) => r.conname).sort()).toEqual([
      "inventory_on_hand_nonneg",
      "inventory_reserved_le_on_hand",
      "inventory_reserved_nonneg",
    ]);
    await db.transaction((tx) => adjustStock(tx, { variantId: variant.id, delta: 10, type: "purchase", referenceType: "purchase", referenceId: "po" }));
    expect((await stockOf(variant.id)).onHand).toBe(12);
  });
});
