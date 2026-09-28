"use server";

import { and, eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { customerMessages, newsletterSubscribers, productComparisons, productQuestions, productVariants, wishlistItems, wishlists } from "@/server/db/schema";
import { runAction, UnauthorizedError, UserError } from "@/server/errors";
import { enforceRateLimit } from "@/server/ratelimit";
import { getCurrentUser, requireCustomerOrThrow } from "@/server/session";
import { getSetting } from "@/server/settings";
import * as cart from "@/server/services/cart";
import { searchSuggestions } from "@/server/queries/catalog";
import { toggleWishlist } from "@/server/services/wishlist";
import { logisticsOptions } from "@/server/services/pricing";

const uuid = z.string().uuid();

/* ─────────── cart ─────────── */

export async function addToCartAction(variantId: string, quantity = 1) {
  return runAction(async () => {
    uuid.parse(variantId);
    const orders = await getSetting("orders");
    if (!orders.allowGuestCart && !(await getCurrentUser())) throw new UnauthorizedError("Please sign in or create an account to add items to your cart.");
    const res = await cart.addItem(variantId, quantity);
    refresh();
    return { quantity: res.quantity, count: await cart.cartCount() };
  }, "Added to cart");
}

export async function updateCartItemAction(itemId: string, quantity: number) {
  return runAction(async () => {
    uuid.parse(itemId);
    await cart.updateQuantity(itemId, quantity);
    refresh();
  });
}

export async function removeCartItemAction(itemId: string) {
  return runAction(async () => {
    uuid.parse(itemId);
    await cart.removeItem(itemId);
    refresh();
  }, "Removed from cart");
}

export async function saveForLaterAction(itemId: string) {
  return runAction(async () => {
    uuid.parse(itemId);
    await cart.toggleSaveForLater(itemId);
    refresh();
  });
}

export async function applyCouponAction(code: string) {
  return runAction(async () => {
    const parsed = z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, "Invalid coupon code").parse(code);
    await cart.setCoupon(parsed);
    refresh();
  });
}

export async function removeCouponAction() {
  return runAction(async () => {
    await cart.setCoupon(null);
    refresh();
  });
}

export async function mergeGuestCartAction() {
  const u = await getCurrentUser();
  if (u) await cart.mergeGuestCart(u.id);
}

/** Server-computed delivery/collection options for a location (checkout). */
export async function logisticsOptionsAction(state: string, city: string) {
  return runAction(async () => {
    const s = z.string().trim().min(2).max(40).parse(state);
    const c = z.string().trim().max(80).parse(city);
    return logisticsOptions(s, c);
  });
}

/* ─────────── wishlist ─────────── */

export async function toggleWishlistAction(productId: string) {
  return runAction(async () => {
    uuid.parse(productId);
    const u = await getCurrentUser();
    if (!u) throw new UnauthorizedError("Sign in to save items to your wishlist.");
    const res = await toggleWishlist(u.id, productId);
    revalidatePath("/account/wishlist");
    return res;
  });
}

export async function moveWishlistToCartAction(productId: string) {
  return runAction(async () => {
    uuid.parse(productId);
    const u = await getCurrentUser();
    if (!u) throw new UnauthorizedError();
    const [item] = await db
      .select({ id: wishlistItems.id, variantId: wishlistItems.variantId })
      .from(wishlistItems)
      .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
      .where(and(eq(wishlists.userId, u.id), eq(wishlistItems.productId, productId)));
    if (!item) throw new UserError("Item not in wishlist.");
    let variantId = item.variantId;
    if (!variantId) {
      const [v] = await db.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true))).limit(1);
      variantId = v?.id ?? null;
    }
    if (!variantId) throw new UserError("This product is not available.");
    await cart.addItem(variantId, 1);
    await db.delete(wishlistItems).where(eq(wishlistItems.id, item.id));
    refresh();
  }, "Moved to cart");
}

/* ─────────── compare (max 4) ─────────── */

const COMPARE_COOKIE = "bhc_compare";

export async function toggleCompareAction(productId: string) {
  return runAction(async () => {
    uuid.parse(productId);
    const store = await cookies();
    let ids: string[] = [];
    try {
      ids = JSON.parse(store.get(COMPARE_COOKIE)?.value ?? "[]");
    } catch {
      ids = [];
    }
    ids = ids.filter((x) => uuid.safeParse(x).success);
    const exists = ids.includes(productId);
    if (exists) ids = ids.filter((x) => x !== productId);
    else {
      if (ids.length >= 4) throw new UserError("You can compare up to 4 products. Remove one first.");
      ids.push(productId);
    }
    store.set(COMPARE_COOKIE, JSON.stringify(ids), { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    const u = await getCurrentUser();
    if (u) {
      await db.insert(productComparisons).values({ userId: u.id, productIds: ids }).onConflictDoUpdate({ target: productComparisons.userId, set: { productIds: ids, updatedAt: new Date() } });
    }
    return { ids, added: !exists };
  });
}

/* ─────────── search suggestions ─────────── */

export async function searchSuggestionsAction(q: string) {
  try {
    await enforceRateLimit("search");
    return await searchSuggestions(String(q ?? ""));
  } catch {
    return [];
  }
}

/* ─────────── questions, contact, newsletter ─────────── */

export async function askQuestionAction(productId: string, question: string) {
  return runAction(async () => {
    const u = await requireCustomerOrThrow();
    await enforceRateLimit("support", u.id);
    const q = z.string().trim().min(8, "Please write a little more").max(600).parse(question);
    await db.insert(productQuestions).values({ productId: uuid.parse(productId), userId: u.id, question: q });
  }, "Thanks! Your question will appear once our team answers it.");
}

const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10, "Please add a few more details").max(3000),
  website: z.string().max(0).optional().or(z.literal("")), // honeypot
});

export async function contactAction(_: unknown, formData: FormData) {
  return runAction(async () => {
    await enforceRateLimit("support");
    const data = contactSchema.parse(Object.fromEntries(formData));
    if (data.website) return; // bot
    await db.insert(customerMessages).values({ name: data.name, email: data.email, phone: data.phone || null, subject: data.subject, message: data.message });
  }, "Thank you — we'll get back to you shortly.");
}

export async function newsletterAction(_: unknown, formData: FormData) {
  return runAction(async () => {
    await enforceRateLimit("support");
    const email = z.string().trim().toLowerCase().email("Enter a valid email").parse(formData.get("email"));
    await db.insert(newsletterSubscribers).values({ email }).onConflictDoNothing();
  }, "You're subscribed. Watch your inbox for deals!");
}

/* ─────────── reviews & recently viewed ─────────── */

const reviewSchema = z.object({
  productId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, "Choose a rating").max(5),
  title: z.string().trim().max(100).optional().or(z.literal("")),
  comment: z.string().trim().min(10, "Please write at least a sentence").max(2000),
});

export async function submitReviewAction(_: unknown, formData: FormData) {
  return runAction(async () => {
    const u = await requireCustomerOrThrow();
    await enforceRateLimit("support", u.id);
    const data = reviewSchema.parse(Object.fromEntries(formData));
    const { submitReview } = await import("@/server/services/reviews");
    await submitReview({ userId: u.id, productId: data.productId, rating: data.rating, title: data.title, comment: data.comment });
  }, "Thank you! Your review will appear after moderation.");
}

export async function recentlyViewedAction(ids: string[]) {
  const clean = (Array.isArray(ids) ? ids : []).filter((x) => uuid.safeParse(x).success).slice(0, 12);
  const { productsByIds } = await import("@/server/queries/catalog");
  return productsByIds(clean);
}
