import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "../db";
import { cartItems, carts, inventory, productVariants, products } from "../db/schema";
import { UserError } from "../errors";
import { getCurrentUser } from "../session";
import { quote, type Fulfilment } from "./pricing";

export const CART_COOKIE = "bhc_cart";

async function guestToken() {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

/** Finds the current cart (user cart if signed in, else guest cart). Never creates one. */
export async function findCart() {
  const u = await getCurrentUser();
  if (u) {
    const [c] = await db.select().from(carts).where(eq(carts.userId, u.id));
    return c ?? null;
  }
  const token = await guestToken();
  if (!token) return null;
  const [c] = await db.select().from(carts).where(eq(carts.guestToken, token));
  return c ?? null;
}

/** Gets or creates the cart. Only call from Server Actions / Route Handlers (may set a cookie). */
export async function ensureCart() {
  const existing = await findCart();
  if (existing) return existing;
  const u = await getCurrentUser();
  if (u) {
    const [c] = await db.insert(carts).values({ userId: u.id }).onConflictDoNothing().returning();
    return c ?? (await db.select().from(carts).where(eq(carts.userId, u.id)))[0];
  }
  const token = randomBytes(24).toString("base64url");
  const [c] = await db.insert(carts).values({ guestToken: token }).returning();
  (await cookies()).set(CART_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return c;
}

export async function addItem(variantId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new UserError("Choose a quantity between 1 and 20.");
  const [v] = await db
    .select({ id: productVariants.id, active: productVariants.isActive, status: products.status, deletedAt: products.deletedAt, name: products.name, onHand: inventory.onHand, reserved: inventory.reserved })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.id, variantId));
  if (!v || !v.active || v.status !== "active" || v.deletedAt) throw new UserError("This product is not available.");
  const available = Math.max(0, (v.onHand ?? 0) - (v.reserved ?? 0));
  if (available < 1) throw new UserError(`${v.name} is out of stock.`);
  const cart = await ensureCart();
  const [existing] = await db.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)));
  const next = Math.min((existing && !existing.savedForLater ? existing.quantity : 0) + quantity, available, 20);
  await db
    .insert(cartItems)
    .values({ cartId: cart.id, variantId, quantity: next })
    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: next, savedForLater: false, updatedAt: new Date() } });
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
  return { quantity: next, capped: next < (existing?.quantity ?? 0) + quantity };
}

async function ownItem(itemId: string) {
  const cart = await findCart();
  if (!cart) throw new UserError("Your cart is empty.");
  const [item] = await db.select().from(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
  if (!item) throw new UserError("Item not found in your cart.");
  return { cart, item };
}

export async function updateQuantity(itemId: string, quantity: number) {
  const { item } = await ownItem(itemId);
  if (quantity <= 0) {
    await db.delete(cartItems).where(eq(cartItems.id, item.id));
    return;
  }
  if (!Number.isInteger(quantity) || quantity > 20) throw new UserError("Choose a quantity between 1 and 20.");
  const [inv] = await db.select().from(inventory).where(eq(inventory.variantId, item.variantId));
  const available = Math.max(0, (inv?.onHand ?? 0) - (inv?.reserved ?? 0));
  if (quantity > available) throw new UserError(available ? `Only ${available} available.` : "This item is out of stock.");
  await db.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, item.id));
}

export async function removeItem(itemId: string) {
  const { item } = await ownItem(itemId);
  await db.delete(cartItems).where(eq(cartItems.id, item.id));
}

export async function toggleSaveForLater(itemId: string) {
  const { item } = await ownItem(itemId);
  await db.update(cartItems).set({ savedForLater: !item.savedForLater, updatedAt: new Date() }).where(eq(cartItems.id, item.id));
}

export async function setCoupon(code: string | null) {
  const cart = await ensureCart();
  await db.update(carts).set({ couponCode: code ? code.trim().toUpperCase().slice(0, 40) : null, updatedAt: new Date() }).where(eq(carts.id, cart.id));
}

/** Moves a guest cart into the user's cart after sign-in (quantities are merged, capped at 20). */
export async function mergeGuestCart(userId: string) {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (!token) return;
  const [guest] = await db.select().from(carts).where(eq(carts.guestToken, token));
  store.delete(CART_COOKIE);
  if (!guest) return;
  await db.transaction(async (tx) => {
    const [mine] = await tx.select().from(carts).where(eq(carts.userId, userId));
    if (!mine) {
      await tx.update(carts).set({ userId, guestToken: null, updatedAt: new Date() }).where(eq(carts.id, guest.id));
      return;
    }
    const items = await tx.select().from(cartItems).where(eq(cartItems.cartId, guest.id));
    for (const it of items) {
      await tx
        .insert(cartItems)
        .values({ cartId: mine.id, variantId: it.variantId, quantity: it.quantity, savedForLater: it.savedForLater })
        .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: sql`least(${cartItems.quantity} + ${it.quantity}, 20)`, updatedAt: new Date() } });
    }
    if (guest.couponCode && !mine.couponCode) await tx.update(carts).set({ couponCode: guest.couponCode }).where(eq(carts.id, mine.id));
    await tx.delete(carts).where(eq(carts.id, guest.id));
  });
}

export async function cartLines(cartId: string) {
  return db.select().from(cartItems).where(eq(cartItems.cartId, cartId)).orderBy(asc(cartItems.createdAt));
}

/** Full cart view: priced server-side via the pricing engine. */
export async function getCartView(fulfilment?: Fulfilment | null) {
  const cart = await findCart();
  if (!cart) return { cart: null, items: [], saved: [], quote: null, count: 0 };
  const rows = await cartLines(cart.id);
  const active = rows.filter((r) => !r.savedForLater);
  const saved = rows.filter((r) => r.savedForLater);
  const u = await getCurrentUser();
  const q = await quote({ lines: active.map((r) => ({ variantId: r.variantId, quantity: r.quantity })), couponCode: cart.couponCode, fulfilment, userId: u?.id });
  const savedQuote = saved.length ? await quote({ lines: saved.map((r) => ({ variantId: r.variantId, quantity: r.quantity })) }) : null;
  const itemIdByVariant = new Map(rows.map((r) => [r.variantId, r.id]));
  return {
    cart,
    items: q.lines.map((l) => ({ ...l, itemId: itemIdByVariant.get(l.variantId)! })),
    unavailable: q.issues.filter((i) => i.code === "unavailable").map((i) => ({ ...i, itemId: i.variantId ? itemIdByVariant.get(i.variantId) : undefined })),
    saved: (savedQuote?.lines ?? []).map((l) => ({ ...l, itemId: itemIdByVariant.get(l.variantId)! })),
    quote: q,
    count: active.reduce((s, r) => s + r.quantity, 0),
  };
}

export async function cartCount() {
  const cart = await findCart();
  if (!cart) return 0;
  const [{ n }] = await db
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}),0)::int` })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.savedForLater, false)));
  return n;
}
