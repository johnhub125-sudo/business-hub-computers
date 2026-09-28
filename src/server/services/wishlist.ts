import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { productVariants, products, wishlistItems, wishlists } from "../db/schema";
import { UserError } from "../errors";

async function wishlistId(userId: string) {
  const [w] = await db.select().from(wishlists).where(eq(wishlists.userId, userId));
  if (w) return w.id;
  const [created] = await db.insert(wishlists).values({ userId }).onConflictDoNothing().returning();
  return created?.id ?? (await db.select().from(wishlists).where(eq(wishlists.userId, userId)))[0].id;
}

export async function toggleWishlist(userId: string, productId: string) {
  const [p] = await db.select({ id: products.id, price: products.price, discountPrice: products.discountPrice }).from(products).where(eq(products.id, productId));
  if (!p) throw new UserError("Product not found.");
  const wid = await wishlistId(userId);
  const [existing] = await db.select().from(wishlistItems).where(and(eq(wishlistItems.wishlistId, wid), eq(wishlistItems.productId, productId)));
  if (existing) {
    await db.delete(wishlistItems).where(eq(wishlistItems.id, existing.id));
    return { saved: false };
  }
  const [v] = await db.select().from(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.isDefault, true)));
  const price = v?.discountPrice ?? v?.price ?? p.discountPrice ?? p.price;
  await db.insert(wishlistItems).values({ wishlistId: wid, productId, variantId: v?.id ?? null, priceAtAdd: price });
  return { saved: true };
}

export async function wishlistProductIds(userId: string) {
  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
    .where(eq(wishlists.userId, userId));
  return rows.map((r) => r.productId);
}

export async function wishlistEntries(userId: string) {
  return db
    .select({ id: wishlistItems.id, productId: wishlistItems.productId, variantId: wishlistItems.variantId, priceAtAdd: wishlistItems.priceAtAdd, createdAt: wishlistItems.createdAt })
    .from(wishlistItems)
    .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
    .where(eq(wishlists.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));
}
