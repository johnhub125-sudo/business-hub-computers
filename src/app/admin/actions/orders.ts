"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { nairaToKobo } from "@/lib/money";
import { ORDER_TRANSITIONS } from "@/lib/status";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { deliveries, orderEvents, orders, receipts } from "@/server/db/schema";
import { enqueueEmail, processOutbox } from "@/server/email";
import { runAction, UserError } from "@/server/errors";
import { enqueueWhatsApp } from "@/server/integrations/whatsapp";
import { requirePermission } from "@/server/session";
import { notify } from "@/server/services/notifications";
import { changeOrderStatus, orderSummaryFrom } from "@/server/services/orders";
import { requestRefund } from "@/server/services/payments";
import { swapSerial } from "@/server/services/serials";
import { orderItems } from "@/server/db/schema";
import { appUrl } from "@/server/env";

const uuid = z.string().uuid();

export async function changeOrderStatusAction(orderId: string, to: string, note?: string) {
  return runAction(async () => {
    const staff = await requirePermission("orders.manage");
    const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, uuid.parse(orderId)));
    if (!o) throw new UserError("Order not found.");
    // Delivery staff may only move orders through fulfilment states.
    const allowed = ORDER_TRANSITIONS[o.status] ?? [];
    if (to === "cancelled" && !["pending_payment", "payment_processing"].includes(o.status)) throw new UserError("Paid orders cannot be cancelled here — request a refund instead.");
    await db.transaction((tx) => changeOrderStatus(tx, { orderId, to, note: note?.slice(0, 500) || null, actor: staff, allowed }));
    after(() => processOutbox().catch(() => {}));
    refresh();
  }, "Order updated");
}

const deliverySchema = z.object({
  carrier: z.string().trim().max(120).optional().or(z.literal("")),
  agentName: z.string().trim().max(120).optional().or(z.literal("")),
  agentPhone: z.string().trim().max(30).optional().or(z.literal("")),
  scheduledDate: z.string().optional().or(z.literal("")),
  location: z.string().trim().max(300).optional().or(z.literal("")),
  instructions: z.string().trim().max(1000).optional().or(z.literal("")),
  assignedTo: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional().or(z.literal("")),
  notifyCustomer: z.boolean().default(true),
});

export async function updateDeliveryAction(orderId: string, input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("delivery.manage");
    const d = deliverySchema.parse(input);
    const [order] = await db.select().from(orders).where(eq(orders.id, uuid.parse(orderId)));
    if (!order) throw new UserError("Order not found.");
    const scheduled = d.scheduledDate ? new Date(`${d.scheduledDate}T12:00:00+01:00`) : null;
    await db.transaction(async (tx) => {
      await tx
        .insert(deliveries)
        .values({ orderId: order.id, method: order.fulfilmentMethod, status: "scheduled" })
        .onConflictDoNothing();
      await tx
        .update(deliveries)
        .set({
          carrier: d.carrier || null,
          agentName: d.agentName || null,
          agentPhone: d.agentPhone || null,
          scheduledDate: scheduled,
          location: d.location || undefined,
          instructions: d.instructions || null,
          assignedTo: d.assignedTo || null,
          updatedAt: new Date(),
        })
        .where(eq(deliveries.orderId, order.id));
      await tx.update(orders).set({ agentName: d.agentName || null, agentPhone: d.agentPhone || null, expectedDate: scheduled ?? order.expectedDate, collectionPoint: d.location || order.collectionPoint, updatedAt: new Date() }).where(eq(orders.id, order.id));
      await tx.insert(orderEvents).values({ orderId: order.id, status: "delivery_updated", title: order.fulfilmentMethod === "pickup" ? "Collection details updated" : "Delivery details updated", note: [d.carrier && `Via ${d.carrier}`, scheduled && `Expected ${scheduled.toDateString()}`].filter(Boolean).join(" · ") || null, actorId: staff.id });
      if (d.notifyCustomer) {
        const msg = `${order.fulfilmentMethod === "pickup" ? "Collection" : "Delivery"} update for ${order.orderNumber}: ${d.carrier ? `via ${d.carrier}. ` : ""}${scheduled ? `Expected on ${scheduled.toDateString()}. ` : ""}${d.agentName ? `Agent: ${d.agentName}${d.agentPhone ? ` (${d.agentPhone})` : ""}. ` : ""}${d.instructions ?? ""}`;
        await enqueueEmail(tx, { template: "orderStatus", to: order.customerEmail, data: { customerName: order.customerName, orderNumber: order.orderNumber, trackingNumber: order.trackingNumber, title: "Delivery details updated", message: msg }, dedupeKey: `delivery:${order.id}:${Date.now()}` });
        await enqueueWhatsApp(tx, { to: order.customerWhatsapp ?? order.customerPhone, message: msg, dedupeKey: `delivery:${order.id}:${Date.now()}` });
        if (order.userId) await notify(tx, order.userId, { type: "delivery_update", title: `Delivery update: ${order.orderNumber}`, body: msg.slice(0, 200), link: `/account/orders/${order.id}` });
      }
      if (d.assignedTo) await notify(tx, d.assignedTo, { type: "delivery_assigned", title: `Delivery assigned: ${order.orderNumber}`, link: `/admin/orders/${order.id}` });
      await audit({ actor: staff, action: "delivery.updated", module: "Delivery", description: `Updated delivery for ${order.orderNumber}`, entityType: "order", entityId: order.id, after: d }, tx);
    });
    after(() => processOutbox().catch(() => {}));
    refresh();
  }, "Delivery details saved");
}

export async function addOrderNoteAction(orderId: string, note: string, visibleToCustomer: boolean) {
  return runAction(async () => {
    const staff = await requirePermission("orders.manage");
    const text = z.string().trim().min(2).max(1000).parse(note);
    const [o] = await db.select({ id: orders.id, number: orders.orderNumber }).from(orders).where(eq(orders.id, uuid.parse(orderId)));
    if (!o) throw new UserError("Order not found.");
    await db.insert(orderEvents).values({ orderId: o.id, status: "note", title: visibleToCustomer ? "Message from Business Hub" : "Internal note", note: text, actorId: staff.id, visibleToCustomer });
    await audit({ actor: staff, action: "order.note_added", module: "Orders", description: `Note on ${o.number}`, entityType: "order", entityId: o.id });
    refresh();
  }, "Note added");
}

export async function resendReceiptAction(orderId: string) {
  return runAction(async () => {
    const staff = await requirePermission("orders.manage");
    const [o] = await db.select().from(orders).where(eq(orders.id, uuid.parse(orderId)));
    const [r] = await db.select().from(receipts).where(eq(receipts.orderId, orderId));
    if (!o || !r) throw new UserError("No receipt for this order yet.");
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    await enqueueEmail(db, {
      template: "receipt",
      to: o.customerEmail,
      data: { ...orderSummaryFrom(o, items.map((i) => ({ name: i.productName, quantity: i.quantity, lineTotal: i.lineTotal }))), receiptNumber: r.receiptNumber, receiptUrl: `${appUrl()}/api/receipts/${o.id}` },
      dedupeKey: `receipt-resend:${o.id}:${Date.now()}`,
    });
    await audit({ actor: staff, action: "receipt.resent", module: "Receipts", description: `Resent receipt ${r.receiptNumber}`, entityType: "order", entityId: o.id });
    after(() => processOutbox().catch(() => {}));
  }, "Receipt email queued");
}

export async function adminRequestRefundAction(orderId: string, amountNaira: string, reason: string) {
  return runAction(async () => {
    const staff = await requirePermission("orders.manage");
    const amount = nairaToKobo(amountNaira);
    await requestRefund({ orderId: uuid.parse(orderId), amount, reason: z.string().trim().min(5).max(1000).parse(reason), requestedBy: staff.id });
    refresh();
  }, "Refund requested — a finance officer must approve it.");
}

/** The unit handed to the customer was a different one: replace the serial number on the order. */
export async function swapSerialAction(fromId: string, toId: string) {
  return runAction(async () => {
    const staff = await requirePermission("orders.manage");
    const res = await swapSerial(uuid.parse(fromId), uuid.parse(toId));
    await audit({ actor: staff, action: "order.serial_changed", module: "Orders", description: `Serial number changed from ${res.from} to ${res.to}`, entityType: "order", entityId: res.orderId });
    refresh();
  }, "Serial number changed");
}
