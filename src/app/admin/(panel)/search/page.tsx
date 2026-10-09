import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, Panel, type SP } from "@/components/admin/ui";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { orderItems, productSerials, auditLogs, orders, payments, products, receipts, staffProfiles, supportTickets, tasks, user } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Search" };

type Hit = { href: string; title: string; sub: string };

export default async function AdminSearchPage({ searchParams }: PageProps<"/admin/search">) {
  const staff = await requireStaffPage();
  const sp = (await searchParams) as SP;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const groups: { title: string; hits: Hit[] }[] = [];
  if (q.length >= 2) {
    const L = 8;
    const tasksQ = can(staff, "tasks.manage") ? undefined : eq(tasks.assignedTo, staff.id);
    const [p, o, c, pay, rc, st, tk, tt, au] = await Promise.all([
      can(staff, "products.view") ? db.select({ id: products.id, name: products.name, sku: products.sku, price: products.price }).from(products).where(or(ilike(products.name, like), ilike(products.sku, like), ilike(products.barcode, like))).limit(L) : [],
      can(staff, "orders.manage") ? db.select().from(orders).where(or(ilike(orders.orderNumber, like), ilike(orders.trackingNumber, like), ilike(orders.customerName, like), ilike(orders.customerEmail, like), ilike(orders.customerPhone, like))).orderBy(desc(orders.placedAt)).limit(L) : [],
      can(staff, "customers.manage") ? db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(and(eq(user.userType, "customer"), or(ilike(user.name, like), ilike(user.email, like), ilike(user.phone, like)))).limit(L) : [],
      can(staff, "payments.view") ? db.select().from(payments).where(or(ilike(payments.reference, like), ilike(payments.transferReference, like), ilike(payments.providerTransactionId, like))).limit(L) : [],
      can(staff, "payments.view") || can(staff, "orders.manage") ? db.select({ r: receipts, n: orders.orderNumber }).from(receipts).innerJoin(orders, eq(orders.id, receipts.orderId)).where(ilike(receipts.receiptNumber, like)).limit(L) : [],
      can(staff, "staff.manage") ? db.select({ id: user.id, name: user.name, email: user.email }).from(user).innerJoin(staffProfiles, eq(staffProfiles.userId, user.id)).where(or(ilike(user.name, like), ilike(user.email, like))).limit(L) : [],
      db.select().from(tasks).where(and(ilike(tasks.title, like), tasksQ)).limit(L),
      can(staff, "support.manage") ? db.select().from(supportTickets).where(or(ilike(supportTickets.ticketNumber, like), ilike(supportTickets.subject, like), ilike(supportTickets.email, like))).limit(L) : [],
      can(staff, "audit.view") ? db.select().from(auditLogs).where(or(ilike(auditLogs.description, like), ilike(auditLogs.actorEmail, like), ilike(auditLogs.action, like))).orderBy(desc(auditLogs.createdAt)).limit(L) : [],
    ]);
    const sn = can(staff, "products.view") || can(staff, "orders.manage")
      ? await db
          .select({ serial: productSerials.serial, status: productSerials.status, productId: productSerials.productId, product: products.name, orderId: orders.id, orderNumber: orders.orderNumber, customer: orders.customerName })
          .from(productSerials)
          .innerJoin(products, eq(products.id, productSerials.productId))
          .leftJoin(orderItems, eq(orderItems.id, productSerials.orderItemId))
          .leftJoin(orders, eq(orders.id, orderItems.orderId))
          .where(ilike(productSerials.serial, like))
          .limit(L)
      : [];
    groups.push(
      { title: "Serial numbers", hits: sn.map((x) => ({ href: x.orderId ? `/admin/orders/${x.orderId}` : `/admin/products/${x.productId}`, title: x.serial, sub: x.orderId ? `${x.product} · sold on ${x.orderNumber} to ${x.customer}` : `${x.product} · ${x.status === "sold" ? "sold" : "in stock"}` })) },
      { title: "Products", hits: p.map((x) => ({ href: `/admin/products/${x.id}`, title: x.name, sub: `${x.sku} · ${formatMoney(x.price)}` })) },
      { title: "Orders", hits: o.map((x) => ({ href: `/admin/orders/${x.id}`, title: x.orderNumber, sub: `${x.customerName} · ${formatMoney(x.grandTotal)} · ${x.status}` })) },
      { title: "Customers", hits: c.map((x) => ({ href: `/admin/customers/${x.id}`, title: x.name, sub: x.email })) },
      { title: "Payments", hits: pay.map((x) => ({ href: `/admin/payments/${x.id}`, title: x.reference, sub: `${x.method} · ${x.status} · ${formatMoney(x.amountExpected)}` })) },
      { title: "Receipts", hits: rc.map((x) => ({ href: `/admin/orders/${x.r.orderId}`, title: x.r.receiptNumber, sub: x.n })) },
      { title: "Staff", hits: st.map((x) => ({ href: `/admin/staff?tab=staff`, title: x.name, sub: x.email })) },
      { title: "Tasks", hits: tk.map((x) => ({ href: `/admin/tasks/${x.id}`, title: x.title, sub: x.status })) },
      { title: "Support tickets", hits: tt.map((x) => ({ href: `/admin/support/${x.id}`, title: `${x.ticketNumber}: ${x.subject}`, sub: x.email })) },
      { title: "Audit logs", hits: au.map((x) => ({ href: `/admin/audit-logs?q=${encodeURIComponent(q)}`, title: x.description, sub: `${x.actorEmail ?? "System"} · ${formatDateTime(x.createdAt)}` })) },
    );
  }
  const found = groups.filter((g) => g.hits.length);
  return (
    <div className="max-w-4xl">
      <AdminHeader title={q ? `Results for “${q}”` : "Search"} description="Search across everything you have access to." />
      <form className="mb-6">
        <input name="q" defaultValue={q} autoFocus placeholder="Order number, SKU, customer, reference…" className="h-12 w-full rounded-2xl border border-line bg-white px-4" aria-label="Search" />
      </form>
      {q.length >= 2 && !found.length && <p className="text-muted">No results.</p>}
      <div className="space-y-4">
        {found.map((g) => (
          <Panel key={g.title} title={g.title} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {g.hits.map((h, i) => (
                <li key={i}>
                  <Link href={h.href} className="block px-5 py-3 hover:bg-surface/60">
                    <span className="font-semibold">{h.title}</span>
                    <span className="block text-xs text-muted">{h.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}
