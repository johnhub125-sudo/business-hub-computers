import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  categories,
  coupons,
  inventory,
  logisticsRates,
  productConditions,
  productVariants,
  products,
  user,
} from "@/server/db/schema";

export async function resetDb() {
  const res = await db.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const names = res.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

export async function makeUser(overrides: Partial<typeof user.$inferInsert> = {}) {
  const id = randomUUID();
  await db.insert(user).values({ id, name: "Test Customer", email: `${id}@example.test`, emailVerified: true, ...overrides });
  return id;
}

export async function makeCatalog(opts: { price?: number; discountPrice?: number | null; stock?: number; vatExempt?: boolean } = {}) {
  const [cond] = await db.insert(productConditions).values({ name: "Brand New", slug: `brand-new-${randomUUID().slice(0, 6)}`, isCollection: true }).returning();
  const [cat] = await db.insert(categories).values({ name: "Computers", slug: `computers-${randomUUID().slice(0, 6)}` }).returning();
  const [product] = await db
    .insert(products)
    .values({
      sku: `SKU-${randomUUID().slice(0, 8)}`,
      name: "HP EliteBook 840 G8",
      slug: `hp-${randomUUID().slice(0, 8)}`,
      categoryId: cat.id,
      conditionId: cond.id,
      price: opts.price ?? 50_000_000, // ₦500,000
      discountPrice: opts.discountPrice ?? null,
      vatExempt: opts.vatExempt ?? false,
      status: "active",
    })
    .returning();
  const [variant] = await db.insert(productVariants).values({ productId: product.id, sku: `${product.sku}-D`, isDefault: true }).returning();
  await db.insert(inventory).values({ variantId: variant.id, onHand: opts.stock ?? 5 });
  await db.insert(logisticsRates).values([
    { state: "Oyo", city: null, method: "delivery", label: "Oyo delivery", price: 300_000 },
    { state: "Oyo", city: "Ibadan", method: "delivery", label: "Ibadan city delivery", price: 150_000 },
    { state: "Lagos", city: null, method: "pickup", label: "Lagos motor park collection", price: 500_000 },
  ]);
  return { product, variant, category: cat, condition: cond };
}

export async function makeCoupon(values: Partial<typeof coupons.$inferInsert> & { code: string; type: "percentage" | "fixed"; value: number }) {
  const [c] = await db.insert(coupons).values(values).returning();
  return c;
}

export async function stockOf(variantId: string) {
  const res = await db.execute<{ on_hand: number; reserved: number; sold: number }>(
    sql`SELECT on_hand, reserved, sold FROM inventory WHERE variant_id = ${variantId}`,
  );
  const r = res.rows[0];
  return { onHand: Number(r.on_hand), reserved: Number(r.reserved), sold: Number(r.sold) };
}
