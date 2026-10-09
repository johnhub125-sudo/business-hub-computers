import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { Mail, MessageCircle, Phone, Printer } from "lucide-react";
import type { Metadata } from "next";
import { OrderSerials } from "@/components/admin/order-serials";
import { freeSerials, serialsByItem } from "@/server/services/serials";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeliveryControl, NoteControl, ReceiptControl, RefundControl, StatusControl } from "@/components/admin/order-controls";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { DELIVERY_STATUS, ORDER_STATUS, ORDER_TRANSITIONS, PAYMENT_METHOD, PAYMENT_STATUS, REFUND_STATUS } from "@/lib/status";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { auditLogs, deliveries, inventoryTransactions, orderEvents, orderItems, orders, outboxMessages, paymentEvents, payments, products, receipts, refunds, staffProfiles, user } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const staff = await requireStaffPage("orders.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) notFound();
  const [items, events, pays, [receipt], [delivery], refundRows, invTx, audits, outbox, staffList] = await Promise.all([
    // Each line with its product's supply details, so staff can see what must be ordered from a partner.
    db
      .select({ item: orderItems, fulfilment: products.fulfilment, partner: products.dropshipPartner })
      .from(orderItems)
      .leftJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, id))
      .then((rows) => rows.map((r) => ({ ...r.item, dropshipPartner: r.fulfilment === "dropship" ? (r.partner ?? "partner") : null }))),
    db.select({ e: orderEvents, actor: user.name }).from(orderEvents).leftJoin(user, eq(user.id, orderEvents.actorId)).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.createdAt)),
    db.select().from(receipts).where(eq(receipts.orderId, id)),
    db.select().from(deliveries).where(eq(deliveries.orderId, id)),
    db.select().from(refunds).where(eq(refunds.orderId, id)).orderBy(desc(refunds.createdAt)),
    db.select().from(inventoryTransactions).where(and(eq(inventoryTransactions.referenceType, "order"), eq(inventoryTransactions.referenceId, id))).orderBy(asc(inventoryTransactions.createdAt)),
    db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "order"), eq(auditLogs.entityId, id))).orderBy(asc(auditLogs.createdAt)),
    db.select().from(outboxMessages).where(or(like(outboxMessages.dedupeKey, `%:${id}`), like(outboxMessages.dedupeKey, `%:${id}:%`))).orderBy(asc(outboxMessages.createdAt)),
    db.select({ id: user.id, name: user.name }).from(user).innerJoin(staffProfiles, eq(staffProfiles.userId, user.id)).where(and(eq(staffProfiles.approval, "approved"), eq(user.status, "active"))),
  ]);
  const [serials, free] = await Promise.all([serialsByItem(items.map((i) => i.id)), freeSerials(items.flatMap((i) => (i.productId ? [i.productId] : [])))]);
  const payEvents = pays.length ? await db.select().from(paymentEvents).where(or(...pays.map((p) => eq(paymentEvents.paymentId, p.id)))).orderBy(asc(paymentEvents.createdAt)) : [];

  const timeline = [
    ...events.map(({ e, actor }) => ({ at: e.createdAt, kind: e.visibleToCustomer ? "Order" : "Internal", text: e.title, note: e.note, by: actor })),
    ...payEvents.map((e) => ({ at: e.createdAt, kind: "Payment", text: `${e.type.replaceAll("_", " ")}${e.toStatus && e.toStatus !== e.fromStatus ? ` → ${e.toStatus}` : ""}`, note: e.source, by: null as string | null })),
    ...invTx.map((t) => ({ at: t.createdAt, kind: "Inventory", text: `${t.type} ${t.quantity || t.reservedDelta > 0 ? "" : ""}(${t.quantity !== 0 ? `${t.quantity > 0 ? "+" : ""}${t.quantity} on hand` : `${t.reservedDelta > 0 ? "+" : ""}${t.reservedDelta} reserved`})`, note: t.note, by: null })),
    ...audits.map((a) => ({ at: a.createdAt, kind: "Audit", text: a.description, note: a.actorRole, by: a.actorEmail })),
    ...outbox.map((m) => ({ at: m.createdAt, kind: "Notification", text: `${m.channel}: ${m.template}`, note: `${m.status}${m.lastError ? ` · ${m.lastError}` : ""}`, by: null })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const allowed = ORDER_TRANSITIONS[order.status] ?? [];
  const paid = order.paymentStatus === "successful" || order.paymentStatus === "partially_refunded";

  return (
    <div className="space-y-6">
      <AdminHeader
        title={`Order ${order.orderNumber}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            Placed {formatDateTime(order.placedAt)} · {order.channel.toUpperCase()}
            <StatusBadge map={ORDER_STATUS} value={order.status} />
            <StatusBadge map={PAYMENT_STATUS} value={order.paymentStatus} />
          </span>
        }
        back={{ href: "/admin/orders", label: "Orders" }}
        actions={
          receipt && (
            <ButtonLink href={`/api/receipts/${order.id}`} target="_blank" variant="outline" size="sm">
              <Printer aria-hidden /> Receipt {receipt.receiptNumber}
            </ButtonLink>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="Items" bodyClassName="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3">
                      {i.productId ? (
                        <Link href={`/admin/products/${i.productId}`} className="font-semibold hover:text-brand-700">
                          {i.productName}
                        </Link>
                      ) : (
                        <span className="font-semibold">{i.productName}</span>
                      )}
                      <span className="block text-xs text-muted">
                        {i.variantName ? `${i.variantName} · ` : ""}SKU {i.sku}
                        {i.warranty ? ` · ${i.warranty}` : ""}
                      </span>
                      {serials.get(i.id)?.length ? <OrderSerials serials={serials.get(i.id)!} free={(i.productId && free.get(i.productId)) || []} /> : null}
                      {i.dropshipPartner && (
                        <span className="mt-1 inline-block rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">Dropship — order from {i.dropshipPartner}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-muted">
                      {i.quantity} × {formatMoney(i.unitPrice)}
                      {i.discountAmount > 0 && <span className="block text-xs text-emerald-700">-{formatMoney(i.discountAmount)}</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">{formatMoney(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="space-y-1.5 border-t border-line px-5 py-4 text-sm">
              {[
                ["Subtotal", order.subtotal],
                [`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`, -order.discountTotal],
                [`VAT (${order.vatRateBps / 100}%)`, order.vatAmount],
                [`Logistics${order.logisticsLabel ? ` · ${order.logisticsLabel}` : ""}`, order.logisticsFee],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd>{formatMoney(Number(v))}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold">
                <dt>Grand total</dt>
                <dd>{formatMoney(order.grandTotal)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Payments" bodyClassName="p-0">
            <ul className="divide-y divide-line text-sm">
              {pays.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Link href={`/admin/payments/${p.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                    {p.reference}
                  </Link>
                  <span>{PAYMENT_METHOD[p.method]}</span>
                  {p.mode && <Badge tone={p.mode === "live" ? "success" : "warning"}>{p.mode}</Badge>}
                  <StatusBadge map={PAYMENT_STATUS} value={p.status} />
                  <span className="ml-auto font-semibold">
                    {formatMoney(p.amountPaid ?? p.amountExpected)}
                    {p.amountPaid != null && p.amountPaid !== p.amountExpected && <span className="ml-1 text-xs text-red-600">(expected {formatMoney(p.amountExpected)})</span>}
                  </span>
                </li>
              ))}
            </ul>
            {refundRows.length > 0 && (
              <div className="border-t border-line px-5 py-3 text-sm">
                <p className="mb-1 font-semibold">Refunds</p>
                {refundRows.map((r) => (
                  <p key={r.id} className="flex justify-between">
                    <span>
                      {formatMoney(r.amount)} — {r.reason}
                    </span>
                    <StatusBadge map={REFUND_STATUS} value={r.status} />
                  </p>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Complete order timeline">
            <ol className="relative space-y-4 border-l border-line pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-brand-500" aria-hidden />
                  <p>
                    <Badge tone={t.kind === "Payment" ? "success" : t.kind === "Inventory" ? "info" : t.kind === "Audit" ? "neutral" : t.kind === "Notification" ? "brand" : t.kind === "Internal" ? "warning" : "brand"}>{t.kind}</Badge>{" "}
                    <span className="font-medium">{t.text}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(t.at)}
                    {t.by ? ` · ${t.by}` : ""}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Customer">
            <p className="font-semibold">{order.customerName}</p>
            <div className="mt-2 space-y-1 text-sm">
              <a href={`mailto:${order.customerEmail}`} className="flex items-center gap-2 hover:text-brand-700">
                <Mail className="size-4 text-muted" aria-hidden /> {order.customerEmail}
              </a>
              <a href={`tel:${order.customerPhone}`} className="flex items-center gap-2 hover:text-brand-700">
                <Phone className="size-4 text-muted" aria-hidden /> {order.customerPhone}
              </a>
              {order.customerWhatsapp && (
                <a href={`https://wa.me/${order.customerWhatsapp.replace(/\D/g, "").replace(/^0/, "234")}`} target="_blank" rel="noopener" className="flex items-center gap-2 hover:text-brand-700">
                  <MessageCircle className="size-4 text-muted" aria-hidden /> WhatsApp {order.customerWhatsapp}
                </a>
              )}
            </div>
            <p className="mt-3 text-sm text-muted">
              {order.shippingAddress}
              <br />
              {order.shippingCity}, {order.shippingState}
            </p>
            {order.customerNote && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm">Customer note: {order.customerNote}</p>}
            {order.userId && (
              <Link href={`/admin/customers/${order.userId}`} className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
                View customer profile →
              </Link>
            )}
          </Panel>

          <Panel title="Order status">
            <StatusControl orderId={order.id} allowed={allowed} />
          </Panel>

          {can(staff, "delivery.manage") && paid && order.channel !== "pos" && (
            <Panel title={order.fulfilmentMethod === "pickup" ? "Collection" : "Delivery"} actions={delivery && <StatusBadge map={DELIVERY_STATUS} value={delivery.status} />}>
              <DeliveryControl
                orderId={order.id}
                staff={staffList}
                initial={{
                  carrier: delivery?.carrier ?? "",
                  agentName: delivery?.agentName ?? "",
                  agentPhone: delivery?.agentPhone ?? "",
                  scheduledDate: delivery?.scheduledDate ? new Date(delivery.scheduledDate.getTime() + 3_600_000).toISOString().slice(0, 10) : "",
                  location: delivery?.location ?? "",
                  instructions: delivery?.instructions ?? "",
                  assignedTo: delivery?.assignedTo ?? "",
                }}
              />
            </Panel>
          )}

          <Panel title="Notes">
            <NoteControl orderId={order.id} />
          </Panel>

          {paid && (
            <Panel title="After-sales">
              <div className="flex flex-wrap gap-2">
                {receipt && <ReceiptControl orderId={order.id} />}
                <RefundControl orderId={order.id} max={order.grandTotal} />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
