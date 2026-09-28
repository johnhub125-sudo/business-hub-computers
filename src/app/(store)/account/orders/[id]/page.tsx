import { and, asc, desc, eq } from "drizzle-orm";
import { Download, Headset, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelOrderButton, PayNowButton, RefundRequestForm, TransferProofForm } from "@/components/account/order-actions";
import { OrderTimeline } from "@/components/store/order-timeline";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatusBadge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { DELIVERY_STATUS, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/status";
import { formatDate, formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { deliveries, orderEvents, orderItems, orders, paymentAccounts, payments, receipts, refunds } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Order details" };

export default async function OrderDetailPage({ params, searchParams }: PageProps<"/account/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireUserPage(`/account/orders/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, me.id)));
  if (!order) notFound();
  const [items, events, [payment], [receipt], [delivery], accounts, refundRows, { company }] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(orderEvents).where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.visibleToCustomer, true))).orderBy(asc(orderEvents.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)).limit(1),
    db.select().from(receipts).where(eq(receipts.orderId, order.id)),
    db.select().from(deliveries).where(eq(deliveries.orderId, order.id)),
    db.select().from(paymentAccounts).where(eq(paymentAccounts.isActive, true)).orderBy(asc(paymentAccounts.sortOrder)),
    db.select().from(refunds).where(eq(refunds.orderId, order.id)).orderBy(desc(refunds.createdAt)),
    getSettings(),
  ]);
  const unpaid = !["successful", "refunded", "partially_refunded", "cancelled"].includes(order.paymentStatus) && order.status !== "cancelled";
  const canCancel = ["pending_payment", "payment_processing"].includes(order.status) && !["successful", "verification_pending"].includes(order.paymentStatus);
  const canRefund = order.paymentStatus === "successful" && !["refund_requested", "refunded", "cancelled"].includes(order.status) && !refundRows.some((r) => ["requested", "approved", "processing"].includes(r.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/account/orders" className="text-sm text-brand-600 hover:underline">
            ← All orders
          </Link>
          <h1 className="mt-1 font-display text-2xl font-extrabold">Order {order.orderNumber}</h1>
          <p className="text-sm text-muted">
            Placed {formatDateTime(order.placedAt)}
            {order.trackingNumber && (
              <>
                {" "}
                · Tracking <strong className="text-ink">{order.trackingNumber}</strong>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge map={ORDER_STATUS} value={order.status} />
          <StatusBadge map={PAYMENT_STATUS} value={order.paymentStatus} />
        </div>
      </div>

      {sp.payment_error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{String(sp.payment_error)}</div>}
      {sp.placed && order.paymentMethod === "bank_transfer" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Order placed! Complete your bank transfer below, then submit the payment details for verification.</div>
      )}

      {unpaid && order.paymentMethod === "paystack" && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-brand-200 bg-brand-50/50 p-5">
          <div>
            <h2 className="font-bold">Payment pending</h2>
            <p className="text-sm text-muted">Complete payment of {formatMoney(order.grandTotal)} to confirm your order. Items are reserved for a limited time.</p>
          </div>
          <PayNowButton orderId={order.id} />
        </Card>
      )}

      {unpaid && order.paymentMethod === "bank_transfer" && (
        <Card className="p-5">
          <h2 className="font-bold">Bank transfer</h2>
          {order.paymentStatus === "verification_pending" ? (
            <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Payment verification pending.</strong> Our finance team is verifying your transfer{payment?.transferReference ? ` (ref ${payment.transferReference})` : ""}. You&apos;ll be notified once it&apos;s confirmed.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Transfer exactly <strong className="text-ink">{formatMoney(order.grandTotal)}</strong> to one of these accounts, using <strong className="text-ink">{order.orderNumber}</strong> as narration:
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {accounts.map((a) => (
                  <div key={a.id} className="rounded-xl border border-line p-3 text-sm">
                    <p className="font-bold">{a.bankName}</p>
                    <p className="font-mono text-base tracking-wide">{a.accountNumber}</p>
                    <p className="text-xs text-muted">{a.accountName}</p>
                  </div>
                ))}
              </div>
              {order.paymentStatus === "verification_failed" && payment?.notes && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">Previous submission could not be verified: {payment.notes.split("\n").pop()}</p>}
              <div className="mt-5">
                <TransferProofForm orderId={order.id} accounts={accounts.map((a) => ({ id: a.id, bankName: a.bankName, accountNumber: a.accountNumber }))} defaultName={order.customerName} />
              </div>
            </>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-4 font-bold">Order progress</h2>
        <OrderTimeline status={order.status} fulfilment={order.fulfilmentMethod} events={events} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">Items</h2>
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-semibold">{i.productName}</span>
                  {i.variantName && <span className="block text-muted">{i.variantName}</span>}
                  <span className="block text-xs text-muted">
                    SKU {i.sku} · Qty {i.quantity} × {formatMoney(i.unitPrice)}
                    {i.warranty ? ` · ${i.warranty}` : ""}
                  </span>
                </span>
                <span className="font-semibold">{formatMoney(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
            {[
              ["Subtotal", order.subtotal],
              ["Discount", -order.discountTotal],
              [`VAT (${order.vatRateBps / 100}%)`, order.vatAmount],
              [`Logistics${order.logisticsLabel ? ` — ${order.logisticsLabel}` : ""}`, order.logisticsFee],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between">
                <dt className="text-muted">{k}</dt>
                <dd>{formatMoney(Number(v))}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold">
              <dt>Grand total</dt>
              <dd className="text-brand-700">{formatMoney(order.grandTotal)}</dd>
            </div>
          </dl>
        </Card>
        <div className="space-y-5">
          <Card className="p-5 text-sm">
            <h2 className="mb-3 font-bold">{order.fulfilmentMethod === "pickup" ? "Collection" : "Delivery"}</h2>
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                {order.shippingAddress}
                <br />
                {order.shippingCity}, {order.shippingState}
              </span>
            </p>
            {delivery && (
              <div className="mt-3 space-y-1">
                <p>
                  Status: <StatusBadge map={DELIVERY_STATUS} value={delivery.status} />
                </p>
                {delivery.scheduledDate && <p>Expected: {formatDate(delivery.scheduledDate)}</p>}
                {delivery.carrier && <p>Carrier / motor park: {delivery.carrier}</p>}
                {delivery.agentName && (
                  <p>
                    Agent: {delivery.agentName} {delivery.agentPhone && <a className="font-semibold text-brand-600" href={`tel:${delivery.agentPhone}`}>{delivery.agentPhone}</a>}
                  </p>
                )}
                {delivery.instructions && <p className="text-muted">{delivery.instructions}</p>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`https://wa.me/${company.whatsapp}?text=${encodeURIComponent(`Hello, I'm enquiring about order ${order.orderNumber}`)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white">
                <MessageCircle className="size-3.5" aria-hidden /> WhatsApp us
              </a>
              <a href={`tel:${company.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold">
                <Phone className="size-3.5" aria-hidden /> Call
              </a>
            </div>
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="mb-3 font-bold">Payment</h2>
            <p>Method: {PAYMENT_METHOD[order.paymentMethod]}</p>
            {payment && <p className="break-all text-muted">Reference: {payment.reference}</p>}
            {order.paidAt && <p>Paid: {formatDateTime(order.paidAt)}</p>}
            {receipt && (
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink href={`/api/receipts/${order.id}`} target="_blank" size="sm" variant="secondary">
                  View receipt {receipt.receiptNumber}
                </ButtonLink>
                <ButtonLink href={`/api/receipts/${order.id}?download=1`} size="sm" variant="outline">
                  <Download aria-hidden /> PDF
                </ButtonLink>
              </div>
            )}
            {refundRows.length > 0 && (
              <div className="mt-3 space-y-1 rounded-lg bg-surface p-3">
                {refundRows.map((r) => (
                  <p key={r.id}>
                    Refund {formatMoney(r.amount)} — <strong>{r.status}</strong>
                  </p>
                ))}
              </div>
            )}
          </Card>
          <div className="flex flex-wrap gap-2">
            {canCancel && <CancelOrderButton orderId={order.id} />}
            {canRefund && <RefundRequestForm orderId={order.id} />}
            <ButtonLink href={`/account/support?order=${order.id}`} size="sm" variant="ghost">
              <Headset aria-hidden /> Get help with this order
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
