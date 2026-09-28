"use server";

import { eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { NIGERIAN_STATES } from "@/lib/brand";
import { db } from "@/server/db";
import { addresses } from "@/server/db/schema";
import { processOutbox } from "@/server/email";
import { runAction, UserError } from "@/server/errors";
import { enforceRateLimit } from "@/server/ratelimit";
import { requireCustomerOrThrow } from "@/server/session";
import { findCart, cartLines } from "@/server/services/cart";
import { createOrder } from "@/server/services/orders";
import { initializePaystackPayment } from "@/server/services/payments";
import { quote, type Fulfilment } from "@/server/services/pricing";

const locationSchema = z.object({
  method: z.enum(["delivery", "pickup"]),
  state: z.enum(NIGERIAN_STATES, { message: "Select a state" }),
  city: z.string().trim().min(2, "Enter your city").max(80),
  rateId: z.string().uuid().nullable().optional(),
});

/** Returns totals computed on the server for the current cart and chosen location. */
export async function checkoutQuoteAction(input: unknown) {
  return runAction(async () => {
    const me = await requireCustomerOrThrow();
    const loc = locationSchema.safeParse(input);
    const cart = await findCart();
    if (!cart) throw new UserError("Your cart is empty.");
    const lines = (await cartLines(cart.id)).filter((l) => !l.savedForLater);
    const fulfilment: Fulfilment | null = loc.success ? { method: loc.data.method, state: loc.data.state, city: loc.data.city, rateId: loc.data.rateId } : null;
    const q = await quote({ lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), couponCode: cart.couponCode, fulfilment, userId: me.id });
    return {
      subtotal: q.subtotal,
      discountTotal: q.discountTotal,
      couponCode: q.coupon?.code ?? null,
      vatRateBps: q.vatRateBps,
      vatAmount: q.vatAmount,
      logistics: q.logistics,
      grandTotal: q.grandTotal,
      issues: q.issues,
      itemCount: q.lines.reduce((s, l) => s + l.quantity, 0),
    };
  });
}

const placeOrderSchema = z.object({
  idempotencyKey: z.string().min(16).max(80),
  fullName: z.string().trim().min(3, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{10,18}$/, "Enter a valid phone number"),
  whatsapp: z.string().trim().regex(/^\+?[0-9 ()-]{10,18}$/, "Enter a valid WhatsApp number").optional().or(z.literal("")),
  address: z.string().trim().min(6, "Enter the detailed address").max(300),
  landmark: z.string().trim().max(120).optional().or(z.literal("")),
  saveAddress: z.boolean().optional(),
  location: locationSchema,
  paymentMethod: z.enum(["paystack", "bank_transfer"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  acceptTerms: z.literal(true, { message: "Please accept the terms to continue" }),
});

/**
 * Creates the order (server recalculates EVERYTHING) and, for Paystack, initialises the payment.
 * The browser receives only the Paystack-hosted checkout URL.
 */
export async function placeOrderAction(input: unknown) {
  return runAction(async () => {
    const me = await requireCustomerOrThrow();
    await enforceRateLimit("checkout", me.id);
    const data = placeOrderSchema.parse(input);
    const cart = await findCart();
    if (!cart) throw new UserError("Your cart is empty.");
    const lines = (await cartLines(cart.id)).filter((l) => !l.savedForLater);
    if (!lines.length) throw new UserError("Your cart is empty.");

    const order = await createOrder({
      userId: me.id,
      cartId: cart.id,
      lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      couponCode: cart.couponCode,
      fulfilment: { method: data.location.method, state: data.location.state, city: data.location.city, rateId: data.location.rateId },
      contact: {
        name: data.fullName,
        email: data.email,
        phone: data.phone,
        whatsapp: data.whatsapp || data.phone,
        address: [data.address, data.landmark].filter(Boolean).join(" — near "),
        city: data.location.city,
        state: data.location.state,
      },
      paymentMethod: data.paymentMethod,
      note: data.note,
      idempotencyKey: `${me.id}:${data.idempotencyKey}`,
    });

    if (data.saveAddress) {
      const existing = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, me.id));
      await db
        .insert(addresses)
        .values({ userId: me.id, label: existing.length ? "Delivery" : "Home", fullName: data.fullName, phone: data.phone, line1: data.address, landmark: data.landmark || null, city: data.location.city, state: data.location.state, isDefault: existing.length === 0 })
        .catch(() => {});
    }
    after(() => processOutbox().catch(() => {}));

    if (data.paymentMethod === "paystack") {
      await enforceRateLimit("paymentInit", me.id);
      try {
        const pay = await initializePaystackPayment(order.orderId, me.id);
        return { orderId: order.orderId, redirect: pay.authorizationUrl };
      } catch (e) {
        // Order stays pending; the customer can retry payment from the order page.
        const message = e instanceof UserError ? e.message : "We couldn't start the payment. You can retry from your order page.";
        return { orderId: order.orderId, redirect: `/account/orders/${order.orderId}?payment_error=${encodeURIComponent(message)}` };
      }
    }
    return { orderId: order.orderId, redirect: `/account/orders/${order.orderId}?placed=1` };
  });
}

/** Retry / resume Paystack payment for an existing unpaid order. */
export async function payOrderAction(orderId: string) {
  return runAction(async () => {
    const me = await requireCustomerOrThrow();
    await enforceRateLimit("paymentInit", me.id);
    const pay = await initializePaystackPayment(z.string().uuid().parse(orderId), me.id);
    return { redirect: pay.authorizationUrl };
  });
}
