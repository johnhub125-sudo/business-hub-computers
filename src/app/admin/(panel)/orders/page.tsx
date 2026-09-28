import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, EmptyRow, FilterBar, FilterInput, FilterSelect, one, pageOf, qsWith, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Pagination, StatusBadge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/status";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Orders" };
const PER = 30;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const staff = await requireStaffPage("orders.manage");
  const sp = (await searchParams) as SP;
  const q = one(sp, "q")?.trim();
  const status = one(sp, "status");
  const pay = one(sp, "payment");
  const method = one(sp, "method");
  const channel = one(sp, "channel");
  const stage = one(sp, "stage");
  const from = one(sp, "from");
  const to = one(sp, "to");
  const page = pageOf(sp);

  const where: (SQL | undefined)[] = [];
  if (q) where.push(or(ilike(orders.orderNumber, `%${q}%`), ilike(orders.trackingNumber, `%${q}%`), ilike(orders.customerName, `%${q}%`), ilike(orders.customerEmail, `%${q}%`), ilike(orders.customerPhone, `%${q}%`)));
  if (status && status in ORDER_STATUS) where.push(eq(orders.status, status as never));
  if (pay && pay in PAYMENT_STATUS) where.push(eq(orders.paymentStatus, pay as never));
  if (method && method in PAYMENT_METHOD) where.push(eq(orders.paymentMethod, method as never));
  if (channel === "online" || channel === "pos" || channel === "physical") where.push(eq(orders.channel, channel));
  if (stage === "fulfil") where.push(inArray(orders.status, ["payment_confirmed", "processing", "ready_for_delivery", "ready_for_collection"]));
  if (from) where.push(gte(orders.placedAt, new Date(`${from}T00:00:00+01:00`)));
  if (to) where.push(lte(orders.placedAt, new Date(`${to}T23:59:59+01:00`)));
  const w = and(...where);

  const [rows, [{ total, value }]] = await Promise.all([
    db.select().from(orders).where(w).orderBy(desc(orders.placedAt)).limit(PER).offset((page - 1) * PER),
    db.select({ total: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${orders.grandTotal}) FILTER (WHERE ${orders.paymentStatus} = 'successful'),0)::bigint` }).from(orders).where(w),
  ]);

  return (
    <div>
      <AdminHeader
        title="Orders"
        description={`${total} order(s) · ${formatMoney(Number(value))} paid in this view`}
        actions={
          can(staff, "reports.export") && (
            <ButtonLink href={`/admin/export/orders${from || to ? `?from=${from ?? ""}&to=${to ?? ""}` : ""}`} variant="outline" size="sm">
              <Download aria-hidden /> Export CSV
            </ButtonLink>
          )
        }
      />
      <FilterBar action="/admin/orders">
        <FilterInput name="q" label="Search" defaultValue={q} placeholder="Order, tracking, name, email, phone" className="min-w-60 flex-1" />
        <FilterSelect name="status" label="Order status" defaultValue={status} options={Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])} />
        <FilterSelect name="payment" label="Payment" defaultValue={pay} options={Object.entries(PAYMENT_STATUS).map(([k, v]) => [k, v.label])} />
        <FilterSelect name="method" label="Method" defaultValue={method} options={Object.entries(PAYMENT_METHOD)} />
        <FilterSelect name="channel" label="Channel" defaultValue={channel} options={[["online", "Online"], ["pos", "POS"], ["physical", "Physical"]]} />
        <FilterInput name="from" label="From" type="date" defaultValue={from} />
        <FilterInput name="to" label="To" type="date" defaultValue={to} />
      </FilterBar>
      <Table head={["Order", "Placed", "Customer", "Channel", "Status", "Payment", "Total"]}>
        {rows.length === 0 && <EmptyRow cols={7} text="No orders match these filters." />}
        {rows.map((o) => (
          <tr key={o.id}>
            <td>
              <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                {o.orderNumber}
              </Link>
              {o.trackingNumber && <span className="block text-xs text-muted">{o.trackingNumber}</span>}
            </td>
            <td className="whitespace-nowrap text-muted">{formatDateTime(o.placedAt)}</td>
            <td>
              {o.customerName}
              <span className="block text-xs text-muted">
                {o.shippingCity ? `${o.shippingCity}, ${o.shippingState}` : o.customerPhone}
              </span>
            </td>
            <td className="capitalize">{o.channel}</td>
            <td>
              <StatusBadge map={ORDER_STATUS} value={o.status} />
            </td>
            <td>
              <StatusBadge map={PAYMENT_STATUS} value={o.paymentStatus} />
              <span className="block text-xs text-muted">{PAYMENT_METHOD[o.paymentMethod]}</span>
            </td>
            <td className="whitespace-nowrap font-semibold">{formatMoney(o.grandTotal)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pages={Math.ceil(total / PER)} hrefFor={(p) => qsWith("/admin/orders", sp, { page: p > 1 ? String(p) : undefined })} />
    </div>
  );
}
