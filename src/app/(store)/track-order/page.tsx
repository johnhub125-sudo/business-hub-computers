import { and, asc, eq, or } from "drizzle-orm";
import { PackageSearch, Phone } from "lucide-react";
import type { Metadata } from "next";
import { OrderTimeline } from "@/components/store/order-timeline";
import { Button } from "@/components/ui/button";
import { Breadcrumbs, Card, StatusBadge } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { DELIVERY_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { deliveries, orderEvents, orderItems, orders } from "@/server/db/schema";
import { enforceRateLimit, RateLimitError } from "@/server/ratelimit";
import { getCurrentUser } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Track your order", robots: { index: false } };

const digits = (s: string) => s.replace(/\D/g, "").slice(-10);

export default async function TrackOrderPage({ searchParams }: PageProps<"/track-order">) {
  const sp = await searchParams;
  const number = typeof sp.number === "string" ? sp.number.trim().toUpperCase().slice(0, 40) : "";
  const contact = typeof sp.contact === "string" ? sp.contact.trim().slice(0, 120) : "";
  const me = await getCurrentUser();
  const { company } = await getSettings();

  let error: string | null = null;
  let order: typeof orders.$inferSelect | undefined;
  if (number) {
    try {
      await enforceRateLimit("publicApi");
      [order] = await db.select().from(orders).where(or(eq(orders.orderNumber, number), eq(orders.trackingNumber, number)));
      const owner = order && me && order.userId === me.id;
      const contactOk =
        order &&
        contact &&
        (contact.toLowerCase() === order.customerEmail.toLowerCase() || (digits(contact).length === 10 && digits(contact) === digits(order.customerPhone)));
      if (!order || (!owner && !contactOk)) {
        order = undefined;
        error = me ? "We couldn't find an order with those details on your account." : "No order matches that number and email/phone. Please check and try again.";
      }
    } catch (e) {
      error = e instanceof RateLimitError ? e.message : "Something went wrong. Please try again.";
    }
  }

  const [items, events, [delivery]] = order
    ? await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
        db.select().from(orderEvents).where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.visibleToCustomer, true))).orderBy(asc(orderEvents.createdAt)),
        db.select().from(deliveries).where(eq(deliveries.orderId, order.id)),
      ])
    : [[], [], []];

  return (
    <div className="container-page max-w-4xl py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Track order" }]} />
      <h1 className="font-display text-3xl font-extrabold">Track your order</h1>
      <p className="mt-1 text-muted">Enter your order number (e.g. BHC-2026-000123) or tracking number, plus the email or phone used at checkout.</p>
      <Card className="mt-5 p-5">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Order or tracking number" htmlFor="number" required>
            <Input id="number" name="number" defaultValue={number} placeholder="BHC-TRK-2026-000001" required />
          </Field>
          <Field label={me ? "Email or phone (optional when signed in)" : "Email or phone"} htmlFor="contact" required={!me}>
            <Input id="contact" name="contact" defaultValue={contact} required={!me} />
          </Field>
          <Button type="submit" className="h-11">
            Track
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </Card>

      {order && (
        <div className="mt-6 space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Order</p>
                <p className="text-xl font-extrabold">{order.orderNumber}</p>
                {order.trackingNumber && <p className="text-sm">Tracking: {order.trackingNumber}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge map={ORDER_STATUS} value={order.status} />
                <StatusBadge map={PAYMENT_STATUS} value={order.paymentStatus} />
              </div>
            </div>
            <div className="mt-5">
              <OrderTimeline status={order.status} fulfilment={order.fulfilmentMethod} events={events} />
            </div>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5 text-sm">
              <h2 className="mb-2 font-bold">Products</h2>
              <ul className="space-y-1.5">
                {items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span>
                      {i.productName} × {i.quantity}
                    </span>
                    <span className="font-semibold">{formatMoney(i.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-2 font-bold">Total: {formatMoney(order.grandTotal)}</p>
            </Card>
            <Card className="space-y-1.5 p-5 text-sm">
              <h2 className="mb-2 font-bold">{order.fulfilmentMethod === "pickup" ? "Collection" : "Delivery"}</h2>
              {delivery && (
                <p>
                  Status: <StatusBadge map={DELIVERY_STATUS} value={delivery.status} />
                </p>
              )}
              <p>
                Location: {order.shippingCity}, {order.shippingState}
              </p>
              {order.expectedDate && <p>Expected: {formatDate(order.expectedDate)}</p>}
              {delivery?.carrier && <p>Carrier / motor park: {delivery.carrier}</p>}
              {delivery?.agentName && <p>Agent: {delivery.agentName}</p>}
              <p className="flex items-center gap-1.5 pt-2 text-muted">
                <Phone className="size-4" aria-hidden /> Questions? Call {company.phone} or WhatsApp us.
              </p>
            </Card>
          </div>
        </div>
      )}
      {!order && !number && (
        <div className="mt-10 flex flex-col items-center text-center text-muted">
          <PackageSearch className="size-12 text-brand-300" aria-hidden />
          <p className="mt-2 text-sm">Your tracking number is in your payment confirmation email and on your receipt.</p>
        </div>
      )}
    </div>
  );
}
