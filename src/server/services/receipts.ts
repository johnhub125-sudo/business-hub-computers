import "server-only";
import { desc, eq } from "drizzle-orm";
import { PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/status";
import { db } from "../db";
import { branches, orderItems, orders, payments, receipts } from "../db/schema";
import { getSettings } from "../settings";

export async function receiptData(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const [receipt] = await db.select().from(receipts).where(eq(receipts.orderId, orderId));
  if (!receipt) return null;
  const [items, [payment], [branch], settings] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    receipt.paymentId ? db.select().from(payments).where(eq(payments.id, receipt.paymentId)) : db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(desc(payments.createdAt)).limit(1),
    db.select().from(branches).where(eq(branches.isPrimary, true)),
    getSettings(),
  ]);
  return {
    company: {
      name: settings.company.name,
      tagline: settings.company.tagline,
      address: branch?.address ?? "",
      phone: settings.company.phone,
      email: settings.company.email,
      logo: settings.company.logo,
      rc: settings.company.rcNumber,
    },
    receiptNumber: receipt.receiptNumber,
    issuedAt: receipt.issuedAt,
    order: {
      id: order.id,
      number: order.orderNumber,
      tracking: order.trackingNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      address: [order.shippingAddress, order.shippingCity, order.shippingState].filter(Boolean).join(", "),
      fulfilment: order.logisticsLabel ?? (order.fulfilmentMethod === "pickup" ? "Collection" : "Delivery"),
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      vatRateBps: order.vatRateBps,
      vatAmount: order.vatAmount,
      logisticsFee: order.logisticsFee,
      grandTotal: order.grandTotal,
      currency: order.currency,
      channel: order.channel,
    },
    items: items.map((i) => ({ name: i.productName, variant: i.variantName, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discountAmount, lineTotal: i.lineTotal, warranty: i.warranty })),
    payment: {
      method: PAYMENT_METHOD[payment?.method ?? order.paymentMethod] ?? order.paymentMethod,
      reference: payment?.providerTransactionId ? `${payment.reference} (Txn ${payment.providerTransactionId})` : (payment?.transferReference ?? payment?.reference ?? "—"),
      status: PAYMENT_STATUS[order.paymentStatus]?.label ?? order.paymentStatus,
      paidAt: order.paidAt,
    },
    footer: settings.receipt.footer,
    showWarranty: settings.receipt.showWarranty,
  };
}

export type ReceiptData = NonNullable<Awaited<ReturnType<typeof receiptData>>>;
