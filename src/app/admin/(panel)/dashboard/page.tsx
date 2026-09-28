import { AlertTriangle, CheckCircle2, Circle, ClipboardList, CreditCard, Headset, Package, ShoppingBag, Star, TrendingUp, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InventoryChart, PaymentsChart, RevenueChart } from "@/components/admin/charts";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { StatCard, StatusBadge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/lib/status";
import { cn, timeAgo } from "@/lib/utils";
import { dashboardStats, inventorySeries, paymentSeries, recentActivity, recentOrders, salesSeries, topProducts } from "@/server/queries/admin";
import { onboardingChecklist } from "@/server/queries/onboarding";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const staff = await requireStaffPage();
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  const seeSales = can(staff, "reports.view") || can(staff, "orders.manage");
  const [stats, sales, pays, inv, top, recent, activity, checklist] = await Promise.all([
    dashboardStats(),
    seeSales ? salesSeries(start, end) : Promise.resolve([]),
    can(staff, "payments.view") ? paymentSeries(start, end) : Promise.resolve([]),
    can(staff, "inventory.manage") ? inventorySeries(start, end) : Promise.resolve([]),
    seeSales ? topProducts(start, end) : Promise.resolve([]),
    can(staff, "orders.manage") ? recentOrders() : Promise.resolve([]),
    can(staff, "audit.view") ? recentActivity() : Promise.resolve([]),
    staff.isSuperAdmin ? onboardingChecklist() : Promise.resolve(null),
  ]);

  const attention = [
    { show: can(staff, "payments.verify_transfer") && stats.pendingPayments > 0, text: `${stats.pendingPayments} payment(s) pending or awaiting verification`, href: "/admin/payments?status=verification_pending", icon: CreditCard },
    { show: can(staff, "staff.manage") && stats.pendingStaff > 0, text: `${stats.pendingStaff} staff registration(s) awaiting approval`, href: "/admin/staff?tab=pending", icon: UserCheck },
    { show: can(staff, "reviews.manage") && stats.pendingReviews > 0, text: `${stats.pendingReviews} review(s) awaiting moderation`, href: "/admin/reviews", icon: Star },
    { show: can(staff, "support.manage") && stats.openTickets > 0, text: `${stats.openTickets} open support ticket(s)`, href: "/admin/support", icon: Headset },
    { show: can(staff, "inventory.manage") && stats.lowStock > 0, text: `${stats.lowStock} variant(s) at or below minimum stock`, href: "/admin/inventory?filter=low", icon: AlertTriangle },
    { show: stats.overdueTasks > 0, text: `${stats.overdueTasks} overdue task(s)`, href: "/admin/tasks?status=overdue", icon: ClipboardList },
    { show: can(staff, "orders.manage") && stats.toFulfil > 0, text: `${stats.toFulfil} paid order(s) to fulfil`, href: "/admin/orders?stage=fulfil", icon: ShoppingBag },
  ].filter((a) => a.show);

  return (
    <div className="space-y-6">
      <AdminHeader title={`Welcome, ${staff.name.split(" ")[0]}`} description={`${staff.roleLabel} · Here's what's happening in the business today.`} />

      {checklist && checklist.done < checklist.total && (
        <Panel title={`Setup checklist · ${checklist.done}/${checklist.total} complete`}>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(checklist.done / checklist.total) * 100}%` }} />
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {checklist.items.map((i) => (
              <li key={i.key}>
                <Link href={i.href} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface", i.done ? "text-muted line-through" : "font-medium")}>
                  {i.done ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden /> : <Circle className="size-4 shrink-0 text-slate-300" aria-hidden />}
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {seeSales && <StatCard label="Revenue today" value={formatMoney(stats.revenueToday)} hint={`${formatMoney(stats.revenue30)} last 30 days`} icon={<TrendingUp />} />}
        {seeSales && <StatCard label="Orders (30 days)" value={stats.orders30} hint={`${stats.orders} all time · AOV ${formatMoney(stats.aov30)}`} icon={<ShoppingBag />} tone="accent" />}
        <StatCard label="Customers" value={stats.customers} hint={`+${stats.newCustomers30} in 30 days`} icon={<Users />} tone="success" />
        <StatCard label="Active products" value={stats.products} hint={`${stats.lowStock} low on stock`} icon={<Package />} tone="warning" />
      </div>

      {attention.length > 0 && (
        <Panel title="Needs attention">
          <ul className="grid gap-2 md:grid-cols-2">
            {attention.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-50">
                  <a.icon className="size-4 shrink-0" aria-hidden /> {a.text} <span className="ml-auto">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {seeSales && (
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Panel title="Sales trend (30 days)">
            <RevenueChart data={sales} />
          </Panel>
          <Panel title="Top products (30 days)">
            {top.length === 0 ? (
              <p className="text-sm text-muted">No paid sales in this period yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {top.map((t, i) => (
                  <li key={t.productId ?? t.name} className="flex items-center gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <span className="text-muted">{t.qty} sold</span>
                    <span className="w-24 text-right font-semibold">{formatMoney(Number(t.revenue))}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {pays.length > 0 && (
          <Panel title="Payment trend">
            <PaymentsChart data={pays} />
          </Panel>
        )}
        {inv.length > 0 && (
          <Panel title="Inventory movement">
            <InventoryChart data={inv} />
          </Panel>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {recent.length > 0 && (
          <Panel title="Recent orders" actions={<Link href="/admin/orders" className="text-sm font-semibold text-brand-600">View all</Link>} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface/60">
                    <span className="w-36 font-semibold">{o.orderNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{o.customerName}</span>
                    <StatusBadge map={ORDER_STATUS} value={o.status} />
                    <StatusBadge map={PAYMENT_STATUS} value={o.paymentStatus} />
                    <span className="w-28 text-right font-semibold">{formatMoney(o.grandTotal)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {activity.length > 0 && (
          <Panel title="Recent activity" actions={<Link href="/admin/audit-logs" className="text-sm font-semibold text-brand-600">Audit log</Link>}>
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="font-medium">{a.description}</p>
                  <p className="text-xs text-muted">
                    {a.actorEmail ?? "System"} · {a.module} · {timeAgo(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open tasks" value={stats.openTasks} hint={`${stats.overdueTasks} overdue`} icon={<ClipboardList />} />
        <StatCard label="Pending payments" value={stats.pendingPayments} icon={<CreditCard />} tone="warning" />
        <StatCard label="Pending reviews" value={stats.pendingReviews} icon={<Star />} tone="accent" />
        <StatCard label="Open tickets" value={stats.openTickets} icon={<Headset />} tone="success" />
      </div>
    </div>
  );
}
