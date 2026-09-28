import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import { GrowthChart, InventoryChart, PaymentsChart, RevenueChart, SimpleBars } from "@/components/admin/charts";
import { AdminHeader, FilterBar, FilterInput, one, Panel, type SP } from "@/components/admin/ui";
import { StatCard } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { customerGrowth, inventorySeries, paymentSeries, rangeFromParams, salesSeries, topCategories, topProducts } from "@/server/queries/admin";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  await requireStaffPage("reports.view");
  const sp = (await searchParams) as SP;
  const from = one(sp, "from");
  const to = one(sp, "to");
  const { start, end } = rangeFromParams(from, to, 30);
  const [sales, pays, inv, cats, prods, growth, kpi] = await Promise.all([
    salesSeries(start, end),
    paymentSeries(start, end),
    inventorySeries(start, end),
    topCategories(start, end),
    topProducts(start, end, 10),
    customerGrowth(start, end),
    db.execute<Record<string, string>>(sql`
      SELECT
        (SELECT coalesce(sum(grand_total),0) FROM orders WHERE payment_status IN ('successful','partially_refunded') AND paid_at BETWEEN ${start} AND ${end})::bigint AS revenue,
        (SELECT count(*) FROM orders WHERE payment_status IN ('successful','partially_refunded') AND paid_at BETWEEN ${start} AND ${end})::int AS paid,
        (SELECT count(*) FROM orders WHERE channel = 'online' AND placed_at BETWEEN ${start} AND ${end})::int AS placed,
        (SELECT count(*) FROM orders WHERE channel = 'online' AND payment_status = 'successful' AND placed_at BETWEEN ${start} AND ${end})::int AS converted,
        (SELECT coalesce(sum(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.payment_status IN ('successful','partially_refunded') AND o.paid_at BETWEEN ${start} AND ${end})::int AS units,
        (SELECT count(*) FROM payments WHERE status = 'successful' AND created_at BETWEEN ${start} AND ${end})::int AS pay_ok,
        (SELECT count(*) FROM payments WHERE status IN ('failed','verification_failed','abandoned') AND created_at BETWEEN ${start} AND ${end})::int AS pay_bad,
        (SELECT coalesce(sum(amount),0) FROM refunds WHERE status = 'refunded' AND processed_at BETWEEN ${start} AND ${end})::bigint AS refunded,
        (SELECT coalesce(sum(on_hand),0) FROM inventory)::int AS on_hand,
        (SELECT count(*) FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND i.on_hand - i.reserved <= p.min_stock_level)::int AS low`),
  ]);
  const k = Object.fromEntries(Object.entries(kpi.rows[0]).map(([a, b]) => [a, Number(b)]));
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const aov = k.paid ? Math.round(k.revenue / k.paid) : 0;
  const payRate = k.pay_ok + k.pay_bad ? Math.round((k.pay_ok / (k.pay_ok + k.pay_bad)) * 100) : 0;
  const conversion = k.placed ? Math.round((k.converted / k.placed) * 100) : 0;
  const turnover = k.on_hand ? (((k.units / days) * 365) / k.on_hand).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <AdminHeader title="Analytics" description={`${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}. Website traffic and Core Web Vitals are in Vercel Analytics & Speed Insights.`} />
      <FilterBar action="/admin/analytics">
        <FilterInput name="from" label="From" type="date" defaultValue={from ?? start.toISOString().slice(0, 10)} />
        <FilterInput name="to" label="To" type="date" defaultValue={to ?? end.toISOString().slice(0, 10)} />
      </FilterBar>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(k.revenue)} hint={`${formatMoney(Math.round(k.revenue / days))} per day`} />
        <StatCard label="Paid orders" value={k.paid} hint={`AOV ${formatMoney(aov)}`} tone="accent" />
        <StatCard label="Products sold" value={k.units} hint={`Inventory turnover ≈ ${turnover}×/yr`} tone="success" />
        <StatCard label="Payment success" value={`${payRate}%`} hint={`${k.pay_ok} ok · ${k.pay_bad} failed/abandoned`} tone="warning" />
        <StatCard label="Checkout → paid" value={`${conversion}%`} hint={`${k.converted} of ${k.placed} online orders paid`} />
        <StatCard label="Refunded" value={formatMoney(k.refunded)} tone="accent" />
        <StatCard label="New customers" value={growth.reduce((s, g) => s + g.n, 0)} tone="success" />
        <StatCard label="Low-stock variants" value={k.low} tone="warning" />
      </div>
      <Panel title="Revenue trend">
        <RevenueChart data={sales} />
      </Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Top categories (revenue)">{cats.length ? <SimpleBars data={cats} valueKey="revenue" labelKey="name" money /> : <p className="text-sm text-muted">No sales yet.</p>}</Panel>
        <Panel title="Top products (units)">{prods.length ? <SimpleBars data={prods.map((p) => ({ name: p.name.slice(0, 28), qty: p.qty }))} valueKey="qty" labelKey="name" /> : <p className="text-sm text-muted">No sales yet.</p>}</Panel>
        <Panel title="Payments by status">
          <PaymentsChart data={pays} />
        </Panel>
        <Panel title="Customer growth">
          <GrowthChart data={growth} />
        </Panel>
      </div>
      <Panel title="Inventory movement">
        <InventoryChart data={inv} />
      </Panel>
    </div>
  );
}
