import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Bell, Heart, Package, Receipt, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, StatCard, StatusBadge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS } from "@/lib/status";
import { formatDate, timeAgo } from "@/lib/utils";
import { db } from "@/server/db";
import { notifications, orders, receipts, wishlistItems, wishlists } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "My account" };

export default async function AccountDashboard({ searchParams }: PageProps<"/account">) {
  const me = await requireUserPage("/account");
  const sp = await searchParams;
  const [recent, [counts], [wish], [rcpt], notes] = await Promise.all([
    db.select().from(orders).where(eq(orders.userId, me.id)).orderBy(desc(orders.placedAt)).limit(5),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) FILTER (WHERE ${orders.status} NOT IN ('delivered','collected','cancelled','refunded'))::int`,
        spent: sql<number>`coalesce(sum(${orders.grandTotal}) FILTER (WHERE ${orders.paymentStatus} = 'successful'),0)::bigint`,
      })
      .from(orders)
      .where(eq(orders.userId, me.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(wishlistItems).innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId)).where(eq(wishlists.userId, me.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(receipts).innerJoin(orders, eq(orders.id, receipts.orderId)).where(eq(orders.userId, me.id)),
    db.select().from(notifications).where(and(eq(notifications.userId, me.id), isNull(notifications.archivedAt))).orderBy(desc(notifications.createdAt)).limit(5),
  ]);
  return (
    <div className="space-y-6">
      {(sp.welcome || sp.verified) && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">Your email is verified. Welcome to Business Hub Computers!</div>
      )}
      <div>
        <h1 className="font-display text-2xl font-extrabold">Hello, {me.name.split(" ")[0]} 👋</h1>
        <p className="text-muted">Manage your orders, receipts, addresses and account security.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total orders" value={counts.total} icon={<Package />} />
        <StatCard label="In progress" value={counts.active} icon={<Truck />} tone="warning" />
        <StatCard label="Receipts" value={rcpt.n} icon={<Receipt />} tone="success" />
        <StatCard label="Wishlist" value={wish.n} icon={<Heart />} tone="accent" />
      </div>
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Recent orders</h2>
          <Link href="/account/orders" className="text-sm font-semibold text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon={<Package />} title="No orders yet" description="When you place an order it will appear here." action={<ButtonLink href="/products">Start shopping</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((o) => (
              <li key={o.id}>
                <Link href={`/account/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-surface/60">
                  <span>
                    <span className="block font-semibold">{o.orderNumber}</span>
                    <span className="text-xs text-muted">{formatDate(o.placedAt)}</span>
                  </span>
                  <StatusBadge map={ORDER_STATUS} value={o.status} />
                  <span className="font-bold">{formatMoney(o.grandTotal)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Total spent: {formatMoney(Number(counts.spent))}</p>
      </Card>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold">
            <Bell className="size-4" aria-hidden /> Latest notifications
          </h2>
          <Link href="/account/notifications" className="text-sm font-semibold text-brand-600 hover:underline">
            All notifications
          </Link>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-muted">You&apos;re all caught up.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 text-sm">
                <Link href={n.link ?? "/account/notifications"} className={n.readAt ? "text-muted" : "font-semibold"}>
                  {n.title}
                </Link>
                <span className="shrink-0 text-xs text-muted">{timeAgo(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
