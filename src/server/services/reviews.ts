import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, reviews } from "../db/schema";
import { UserError } from "../errors";
import { notifyStaff } from "./notifications";

/** The most recent paid order in which the customer bought this product (for verified-purchase reviews). */
export async function purchasedOrder(userId: string, productId: string) {
  const [row] = await db
    .select({ orderId: orders.id, status: orders.status })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.userId, userId), eq(orderItems.productId, productId), eq(orders.paymentStatus, "successful")))
    .orderBy(desc(orders.paidAt))
    .limit(1);
  return row ?? null;
}

export async function submitReview(input: { userId: string; productId: string; rating: number; title?: string | null; comment: string; photos?: string[] }) {
  const bought = await purchasedOrder(input.userId, input.productId);
  if (!bought) throw new UserError("Only customers who bought this product can review it.");
  const [existing] = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.productId, input.productId), eq(reviews.userId, input.userId)));
  if (existing) throw new UserError("You have already reviewed this product. You can edit it from your account.");
  await db.transaction(async (tx) => {
    await tx.insert(reviews).values({
      productId: input.productId,
      userId: input.userId,
      orderId: bought.orderId,
      rating: input.rating,
      title: input.title || null,
      comment: input.comment,
      photos: input.photos ?? [],
      isVerifiedPurchase: true,
      status: "pending", // never auto-published (spec §147)
    });
    await notifyStaff(tx, "reviews.manage", { type: "review_pending", title: "New review awaiting moderation", link: "/admin/reviews" });
  });
}

/** Recomputes a product's rating from approved reviews only. */
export async function recomputeRating(productId: string) {
  await db.execute(sql`
    UPDATE products SET
      rating_average = coalesce((SELECT avg(rating)::numeric(3,2) FROM reviews WHERE product_id = ${productId} AND status = 'approved'), 0),
      rating_count = (SELECT count(*)::int FROM reviews WHERE product_id = ${productId} AND status = 'approved')
    WHERE id = ${productId}`);
}

