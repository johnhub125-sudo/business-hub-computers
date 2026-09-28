import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ORDER_STATUS } from "@/lib/status";
import { audit } from "../audit";
import { db, type Executor } from "../db";
import {
  cartItems,
  couponRedemptions,
  coupons,
  deliveries,
  orderEvents,
  orderItems,
  orders,
  paymentAccounts,
  payments,
  products,
  receipts,
} from "../db/schema";
import { enqueueEmail } from "../email";
import { UserError } from "../errors";
import { enqueueWhatsApp } from "../integrations/whatsapp";
import { getSettingsFor } from "../settings";
import { commitOrder, releaseOrder, reserve } from "./inventory";
import { notify, notifyStaff } from "./notifications";
import { nextNumber } from "./numbers";
import { assertQuoteOk, quote, type Fulfilment } from "./pricing";

export type Contact = {
  name: string;
  email: string;
  phone: string;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

export function paymentReference(orderNumber: string) {
  return `${orderNumber}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * Creates an order from server-validated lines. Everything happens in ONE transaction: totals are
 * recalculated, stock is reserved atomically, the order + items + pending payment are written.
 * If anything fails nothing is persisted. An idempotency key stops double-submits.
 */
export async function createOrder(input: {
  userId: string | null;
  lines: { variantId: string; quantity: number }[];
  couponCode?: string | null;
  fulfilment: Fulfilment;
  contact: Contact;
  paymentMethod: "paystack" | "bank_transfer";
  note?: string | null;
  idempotencyKey: string;
  cartId?: string | null;
}) {
  const existing = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, userId: orders.userId })
    .from(orders)
    .where(eq(orders.idempotencyKey, input.idempotencyKey));
  if (existing[0]) {
    if (existing[0].userId !== input.userId) throw new UserError("Invalid request.");
    const [p] = await db.select().from(payments).where(eq(payments.orderId, existing[0].id));
    return { orderId: existing[0].id, orderNumber: existing[0].orderNumber, paymentId: p.id, reference: p.reference, duplicate: true };
  }

  const settings = await getSettingsFor(["orders", "payments"]);
  if (input.paymentMethod === "paystack" && !settings.payments.paystackEnabled) throw new UserError("Card payment is currently unavailable.");
  if (input.paymentMethod === "bank_transfer" && !settings.payments.bankTransferEnabled) throw new UserError("Bank transfer is currently unavailable.");

  return db.transaction(async (tx) => {
    const q = await quote({ lines: input.lines, couponCode: input.couponCode, fulfilment: input.fulfilment, userId: input.userId }, tx);
    assertQuoteOk(q);
    if (input.fulfilment.method !== "in_store" && !q.logistics) throw new UserError("Please choose a delivery or collection option.");

    const orderNumber = await nextNumber(tx, "order");
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId: input.userId,
        channel: "online",
        status: "pending_payment",
        paymentStatus: "pending",
        paymentMethod: input.paymentMethod,
        fulfilmentMethod: input.fulfilment.method === "pickup" ? "pickup" : "delivery",
        customerName: input.contact.name,
        customerEmail: input.contact.email,
        customerPhone: input.contact.phone,
        customerWhatsapp: input.contact.whatsapp || null,
        shippingAddress: input.contact.address,
        shippingCity: input.contact.city,
        shippingState: input.contact.state,
        logisticsRateId: q.logistics?.rateId ?? null,
        logisticsLabel: q.logistics?.label ?? null,
        subtotal: q.subtotal,
        discountTotal: q.discountTotal,
        vatRateBps: q.vatRateBps,
        vatAmount: q.vatAmount,
        logisticsFee: q.logistics?.fee ?? 0,
        grandTotal: q.grandTotal,
        currency: q.currency,
        couponCode: q.coupon?.code ?? null,
        customerNote: input.note || null,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    await tx.insert(orderItems).values(
      q.lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        variantId: l.variantId,
        productName: l.productName,
        variantName: l.variantName === "Default" ? null : l.variantName,
        sku: l.sku,
        quantity: l.quantity,
        unitPrice: l.listPrice,
        discountAmount: l.productDiscount + l.couponDiscount,
        lineTotal: l.lineTotal - l.couponDiscount,
        vatExempt: l.vatExempt,
        warranty: l.warranty,
      })),
    );

    const holdMs =
      input.paymentMethod === "bank_transfer"
        ? settings.orders.bankTransferReservationHours * 3_600_000
        : settings.orders.reservationMinutes * 60_000;
    await reserve(
      tx,
      order.id,
      q.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, name: l.productName })),
      new Date(Date.now() + holdMs),
      input.userId,
    );

    const [payment] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        method: input.paymentMethod,
        reference: paymentReference(orderNumber),
        status: "pending",
        amountExpected: q.grandTotal,
        currency: q.currency,
      })
      .returning();

    await tx.insert(orderEvents).values({ orderId: order.id, status: "pending_payment", title: "Order placed", actorId: input.userId });

    // Checked-out items leave the cart (saved-for-later items stay).
    if (input.cartId) {
      await tx
        .delete(cartItems)
        .where(and(eq(cartItems.cartId, input.cartId), eq(cartItems.savedForLater, false), inArray(cartItems.variantId, q.lines.map((l) => l.variantId))));
    }

    const summary = orderSummaryFrom(order, q.lines.map((l) => ({ name: l.productName, quantity: l.quantity, lineTotal: l.lineTotal - l.couponDiscount })));
    await enqueueEmail(tx, { template: "orderReceived", to: order.customerEmail, data: { ...summary, paymentMethod: input.paymentMethod }, dedupeKey: `order-received:${order.id}` });
    if (input.paymentMethod === "bank_transfer") {
      const accounts = await tx.select().from(paymentAccounts).where(eq(paymentAccounts.isActive, true)).orderBy(paymentAccounts.sortOrder);
      await enqueueEmail(tx, {
        template: "bankTransferPending",
        to: order.customerEmail,
        data: { ...summary, accounts: accounts.map(({ bankName, accountNumber, accountName }) => ({ bankName, accountNumber, accountName })) },
        dedupeKey: `bank-pending:${order.id}`,
      });
    }
    if (input.userId) {
      await notify(tx, input.userId, { type: "order_received", title: `Order ${orderNumber} received`, link: `/account/orders/${order.id}`, dedupeKey: `order-received:${order.id}` });
    }
    return { orderId: order.id, orderNumber, paymentId: payment.id, reference: payment.reference, duplicate: false };
  });
}

export function orderSummaryFrom(
  o: Pick<typeof orders.$inferSelect, "orderNumber" | "trackingNumber" | "customerName" | "subtotal" | "discountTotal" | "vatAmount" | "logisticsFee" | "grandTotal" | "currency">,
  items: { name: string; quantity: number; lineTotal: number }[],
) {
  return {
    orderNumber: o.orderNumber,
    trackingNumber: o.trackingNumber,
    customerName: o.customerName,
    items,
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    vatAmount: o.vatAmount,
    logisticsFee: o.logisticsFee,
    grandTotal: o.grandTotal,
    currency: o.currency,
  };
}

/**
 * Everything that happens once money is confirmed (Paystack verified, bank transfer verified by
 * finance, or POS). Must run inside the same transaction that marked the payment successful.
 * Idempotent: guarded by order.paymentStatus and by unique constraints on receipt/tracking/ledger.
 */
export async function fulfilPaidOrder(
  tx: Executor,
  input: { orderId: string; paymentId: string; actorId: string | null; source: string; reference: string },
) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "successful") return { alreadyFulfilled: true as const, order };

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const { shortages } = await commitOrder(
    tx,
    order.id,
    items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
    input.actorId,
  );

  const now = new Date();
  const trackingNumber = order.trackingNumber ?? (await nextNumber(tx, "tracking"));
  const { delivery } = await getSettingsFor(["delivery"], tx);
  const expectedDate = new Date(now.getTime() + delivery.defaultEtaDays * 86_400_000);
  const newStatus = order.channel === "pos" ? "collected" : "payment_confirmed";

  const [updated] = await tx
    .update(orders)
    .set({
      paymentStatus: "successful",
      status: newStatus,
      paidAt: now,
      trackingNumber,
      expectedDate: order.channel === "pos" ? now : expectedDate,
      completedAt: order.channel === "pos" ? now : null,
      updatedAt: now,
    })
    .where(eq(orders.id, order.id))
    .returning();

  await tx.insert(orderEvents).values({ orderId: order.id, status: "payment_confirmed", title: "Payment confirmed", note: `Verified via ${input.source}`, actorId: input.actorId });
  if (shortages.length) {
    await tx.insert(orderEvents).values({
      orderId: order.id,
      status: "attention",
      title: "Stock shortage — needs attention",
      note: `Paid but ${shortages.length} line(s) could not be allocated from stock. Contact the customer or restock.`,
      visibleToCustomer: false,
    });
    await notifyStaff(tx, "orders.manage", { type: "stock_shortage", title: `Order ${order.orderNumber} paid but short on stock`, link: `/admin/orders/${order.id}`, dedupeKey: `shortage:${order.id}` });
  }

  // Receipt (unique per order & payment → idempotent)
  const receiptNumber = await nextNumber(tx, "receipt");
  const [receipt] = await tx
    .insert(receipts)
    .values({
      receiptNumber,
      orderId: order.id,
      paymentId: input.paymentId,
      snapshot: { reference: input.reference, items: items.map((i) => ({ name: i.productName, variant: i.variantName, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discountAmount, lineTotal: i.lineTotal, warranty: i.warranty })) },
    })
    .onConflictDoNothing()
    .returning();
  const finalReceipt = receipt ?? (await tx.select().from(receipts).where(eq(receipts.orderId, order.id)))[0];

  if (order.channel !== "pos") {
    await tx
      .insert(deliveries)
      .values({
        orderId: order.id,
        method: order.fulfilmentMethod,
        status: "pending",
        location: [order.shippingAddress, order.shippingCity, order.shippingState].filter(Boolean).join(", "),
        instructions: delivery.collectionInstructions,
        scheduledDate: expectedDate,
      })
      .onConflictDoNothing();
  }

  // Coupon usage counts only once money is in.
  if (order.couponCode) {
    const [c] = await tx.select({ id: coupons.id }).from(coupons).where(eq(sql`upper(${coupons.code})`, order.couponCode.toUpperCase()));
    if (c) {
      const inserted = await tx
        .insert(couponRedemptions)
        .values({ couponId: c.id, userId: order.userId, orderId: order.id, amount: order.discountTotal })
        .onConflictDoNothing()
        .returning({ id: couponRedemptions.id });
      if (inserted.length) await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, c.id));
    }
  }

  for (const i of items) {
    if (i.productId) await tx.update(products).set({ soldCount: sql`${products.soldCount} + ${i.quantity}` }).where(eq(products.id, i.productId));
  }

  const summary = orderSummaryFrom(updated, items.map((i) => ({ name: i.productName, quantity: i.quantity, lineTotal: i.lineTotal })));
  if (order.paymentMethod === "bank_transfer") {
    await enqueueEmail(tx, { template: "bankTransferVerified", to: order.customerEmail, data: { ...summary, receiptNumber: finalReceipt.receiptNumber }, dedupeKey: `paid:${order.id}` });
  } else {
    await enqueueEmail(tx, { template: "paymentSuccessful", to: order.customerEmail, data: { ...summary, reference: input.reference, receiptNumber: finalReceipt.receiptNumber }, dedupeKey: `paid:${order.id}` });
  }
  await enqueueWhatsApp(tx, {
    to: order.customerWhatsapp ?? order.customerPhone,
    message: `Hello ${order.customerName}, payment for order ${order.orderNumber} is confirmed. Tracking number: ${trackingNumber}. We'll contact you with delivery/collection details. — Business Hub Computers`,
    dedupeKey: `paid:${order.id}`,
  });
  if (order.userId) {
    await notify(tx, order.userId, { type: "payment_successful", title: `Payment confirmed for ${order.orderNumber}`, body: `Tracking number ${trackingNumber}`, link: `/account/orders/${order.id}`, dedupeKey: `paid:${order.id}` });
  }
  if (order.channel !== "pos") {
    await notifyStaff(tx, "orders.manage", { type: "new_paid_order", title: `New paid order ${order.orderNumber}`, link: `/admin/orders/${order.id}`, dedupeKey: `paid:${order.id}` });
  }
  await audit(
    { actor: input.actorId ? { id: input.actorId } : null, action: "order.paid", module: "Orders", description: `Order ${order.orderNumber} paid (${input.source})`, entityType: "order", entityId: order.id, after: { status: newStatus, trackingNumber, receipt: finalReceipt.receiptNumber } },
    tx,
  );
  return { alreadyFulfilled: false as const, order: updated, receiptNumber: finalReceipt.receiptNumber, shortages };
}

/** Staff status change with transition rules, timeline event, notifications and audit. */
export async function changeOrderStatus(
  tx: Executor,
  input: { orderId: string; to: string; note?: string | null; actor: { id: string; email: string; roleLabel: string }; allowed: string[] },
) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
  if (!order) throw new UserError("Order not found.");
  if (!input.allowed.includes(input.to)) throw new UserError(`Cannot move an order from “${ORDER_STATUS[order.status]?.label}” to “${ORDER_STATUS[input.to]?.label ?? input.to}”.`);
  const now = new Date();
  const patch: Partial<typeof orders.$inferInsert> = { status: input.to as typeof order.status, updatedAt: now };
  if (input.to === "cancelled") patch.cancelledAt = now;
  if (input.to === "delivered" || input.to === "collected") patch.completedAt = now;
  await tx.update(orders).set(patch).where(eq(orders.id, order.id));
  if (input.to === "cancelled") {
    await releaseOrder(tx, order.id, { userId: input.actor.id, note: "Order cancelled" });
    await tx.update(payments).set({ status: "cancelled", updatedAt: now }).where(and(eq(payments.orderId, order.id), inArray(payments.status, ["pending", "initialized", "verification_pending"])));
    await tx.update(orders).set({ paymentStatus: "cancelled" }).where(and(eq(orders.id, order.id), inArray(orders.paymentStatus, ["pending", "initialized", "verification_pending"])));
  }
  const deliveryMap: Record<string, "ready_for_collection" | "dispatched" | "out_for_delivery" | "delivered" | "collected" | "scheduled"> = {
    ready_for_collection: "ready_for_collection",
    ready_for_delivery: "scheduled",
    dispatched: "dispatched",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    collected: "collected",
  };
  if (deliveryMap[input.to]) {
    await tx
      .update(deliveries)
      .set({
        status: deliveryMap[input.to],
        dispatchedAt: input.to === "dispatched" ? now : undefined,
        completedAt: input.to === "delivered" || input.to === "collected" ? now : undefined,
        updatedAt: now,
      })
      .where(eq(deliveries.orderId, order.id));
  }
  const label = ORDER_STATUS[input.to]?.label ?? input.to;
  await tx.insert(orderEvents).values({ orderId: order.id, status: input.to, title: label, note: input.note || null, actorId: input.actor.id });
  const customerMessages: Record<string, string> = {
    processing: "Your order is being prepared.",
    ready_for_collection: "Your order is ready for collection. Our agent will contact you with the collection details.",
    ready_for_delivery: "Your order is packed and ready for delivery.",
    dispatched: "Your order has been dispatched.",
    out_for_delivery: "Your order is out for delivery.",
    delivered: "Your order has been delivered. Thank you for shopping with us!",
    collected: "Your order has been collected. Thank you for shopping with us!",
    cancelled: "Your order has been cancelled.",
  };
  if (customerMessages[input.to]) {
    await enqueueEmail(tx, {
      template: "orderStatus",
      to: order.customerEmail,
      data: { customerName: order.customerName, orderNumber: order.orderNumber, trackingNumber: order.trackingNumber, title: label, message: customerMessages[input.to] + (input.note ? ` ${input.note}` : "") },
      dedupeKey: `status:${order.id}:${input.to}`,
    });
    await enqueueWhatsApp(tx, { to: order.customerWhatsapp ?? order.customerPhone, message: `Order ${order.orderNumber}: ${customerMessages[input.to]}`, dedupeKey: `status:${order.id}:${input.to}` });
    if (order.userId) await notify(tx, order.userId, { type: "order_status", title: `${order.orderNumber}: ${label}`, link: `/account/orders/${order.id}`, dedupeKey: `status:${order.id}:${input.to}` });
  }
  if (input.to === "delivered" || input.to === "collected") {
    const items = await tx.select({ name: orderItems.productName, slug: products.slug }).from(orderItems).innerJoin(products, eq(products.id, orderItems.productId)).where(eq(orderItems.orderId, order.id));
    await enqueueEmail(tx, {
      template: "reviewRequest",
      to: order.customerEmail,
      data: { customerName: order.customerName, orderNumber: order.orderNumber, products: items },
      dedupeKey: `review-request:${order.id}`,
      sendAfter: new Date(now.getTime() + 3 * 86_400_000),
    });
  }
  await audit({ actor: { id: input.actor.id, email: input.actor.email, roleLabel: input.actor.roleLabel }, action: "order.status_changed", module: "Orders", description: `Order ${order.orderNumber}: ${order.status} → ${input.to}`, entityType: "order", entityId: order.id, before: { status: order.status }, after: { status: input.to, note: input.note } }, tx);
}
