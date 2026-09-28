import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { nairaToKobo } from "@/lib/money";
import { audit } from "../audit";
import { db } from "../db";
import { orderEvents, orderItems, orders, paymentEvents, payments } from "../db/schema";
import { UserError } from "../errors";
import type { StaffContext } from "../session";
import { reserve } from "./inventory";
import { nextNumber } from "./numbers";
import { fulfilPaidOrder } from "./orders";
import { assertQuoteOk, quote } from "./pricing";

export const posSchema = z.object({
  lines: z.array(z.object({ variantId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(100) })).min(1, "Add at least one item").max(60),
  customerName: z.string().trim().max(120).optional().or(z.literal("")),
  customerPhone: z.string().trim().max(30).optional().or(z.literal("")),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  discountNaira: z.string().trim().max(20).optional().or(z.literal("")),
  paymentMethod: z.enum(["cash", "pos_terminal", "bank_transfer", "other"]),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  amountTenderedNaira: z.string().trim().max(20).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  idempotencyKey: z.string().min(16).max(80),
});

/** Preview totals for the POS screen (same server-side pricing engine as online checkout). */
export async function posQuote(raw: unknown) {
  const d = posSchema.pick({ lines: true, discountNaira: true }).parse(raw);
  const q = await quote({ lines: d.lines, fulfilment: { method: "in_store" }, manualDiscount: d.discountNaira ? nairaToKobo(d.discountNaira) : 0 });
  return q;
}

/**
 * Records an in-store sale in one transaction: order + items + stock deduction + successful payment
 * + receipt + audit. Staff confirm the money was received (cash / POS terminal / transfer seen).
 */
export async function createPosSale(raw: unknown, staff: Pick<StaffContext, "id" | "email" | "roleLabel" | "permissions">) {
  const d = posSchema.parse(raw);
  const manualDiscount = d.discountNaira ? nairaToKobo(d.discountNaira) : 0;
  if (manualDiscount > 0 && !staff.permissions.has("orders.manage") && !staff.permissions.has("products.edit")) {
    throw new UserError("Your role can't give manual discounts.");
  }
  if ((d.paymentMethod === "pos_terminal" || d.paymentMethod === "bank_transfer") && !d.reference) throw new UserError("Enter the terminal / transfer reference.");

  const existing = await db.query.orders.findFirst({ where: (o, { eq }) => eq(o.idempotencyKey, `pos:${d.idempotencyKey}`) });
  if (existing) return { orderId: existing.id, orderNumber: existing.orderNumber, duplicate: true };

  return db.transaction(async (tx) => {
    const q = await quote({ lines: d.lines, fulfilment: { method: "in_store" }, manualDiscount }, tx);
    assertQuoteOk(q);
    const tendered = d.amountTenderedNaira ? nairaToKobo(d.amountTenderedNaira) : null;
    if (d.paymentMethod === "cash" && tendered != null && tendered < q.grandTotal) throw new UserError("Cash tendered is less than the total.");

    const orderNumber = await nextNumber(tx, "order");
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        channel: "pos",
        status: "pending_payment",
        paymentStatus: "pending",
        paymentMethod: d.paymentMethod,
        fulfilmentMethod: "pickup",
        customerName: d.customerName || "Walk-in customer",
        customerEmail: d.customerEmail || "",
        customerPhone: d.customerPhone || "",
        subtotal: q.subtotal,
        discountTotal: q.discountTotal,
        vatRateBps: q.vatRateBps,
        vatAmount: q.vatAmount,
        logisticsFee: 0,
        grandTotal: q.grandTotal,
        currency: q.currency,
        customerNote: d.note || null,
        createdBy: staff.id,
        logisticsLabel: "In-store sale",
        idempotencyKey: `pos:${d.idempotencyKey}`,
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
    await reserve(tx, order.id, q.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, name: l.productName })), new Date(Date.now() + 3_600_000), staff.id);
    const now = new Date();
    const [payment] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        method: d.paymentMethod,
        reference: `${orderNumber}-POS-${randomBytes(3).toString("hex").toUpperCase()}`,
        status: "successful",
        amountExpected: q.grandTotal,
        amountPaid: q.grandTotal,
        amountConfirmed: q.grandTotal,
        transferReference: d.reference || null,
        verificationStatus: "verified",
        reconciliationStatus: d.paymentMethod === "cash" ? "unreconciled" : "unreconciled",
        verifiedBy: staff.id,
        verifiedAt: now,
        paidAt: now,
        notes: tendered != null ? `Cash tendered ₦${(tendered / 100).toLocaleString()}; change ₦${((tendered - q.grandTotal) / 100).toLocaleString()}` : null,
      })
      .returning();
    await tx.insert(paymentEvents).values({ paymentId: payment.id, type: "pos_payment_recorded", toStatus: "successful", source: "admin", actorId: staff.id, meta: { method: d.paymentMethod, reference: d.reference } });
    await tx.insert(orderEvents).values({ orderId: order.id, status: "pos", title: "In-store sale", actorId: staff.id });
    const res = await fulfilPaidOrder(tx, { orderId: order.id, paymentId: payment.id, actorId: staff.id, source: `POS (${d.paymentMethod})`, reference: payment.reference });
    if (!res.alreadyFulfilled && res.shortages?.length) throw new UserError("Stock changed while completing the sale. Please try again.");
    await audit({ actor: staff, action: "pos.sale", module: "Sales", description: `POS sale ${orderNumber}: ₦${(q.grandTotal / 100).toLocaleString()} via ${d.paymentMethod}${manualDiscount ? ` (manual discount ₦${(manualDiscount / 100).toLocaleString()})` : ""}`, entityType: "order", entityId: order.id }, tx);
    return { orderId: order.id, orderNumber, duplicate: false, change: tendered != null ? tendered - q.grandTotal : null };
  });
}
