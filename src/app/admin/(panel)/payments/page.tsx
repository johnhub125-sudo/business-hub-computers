import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Clock, Download, Undo2, Wallet, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, EmptyRow, FilterBar, FilterInput, FilterSelect, one, pageOf, Panel, qsWith, Table, type SP } from "@/components/admin/ui";
import { PaymentsChart, SimpleBars } from "@/components/admin/charts";
import { RefundDecision } from "@/components/admin/payment-controls";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Pagination, StatCard, StatusBadge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD, PAYMENT_STATUS, REFUND_STATUS } from "@/lib/status";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { orders, payments, refunds, user } from "@/server/db/schema";
import { paymentMethodSplit, paymentSeries } from "@/server/queries/admin";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Payments" };
const PER = 30;

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const staff = await requireStaffPage("payments.view");
  const sp = (await searchParams) as SP;
  const tab = tabOf(sp, ["overview", "reconciliation", "refunds"]);
  const q = one(sp, "q")?.trim();
  const status = one(sp, "status");
  const method = one(sp, "method");
  const rec = one(sp, "rec");
  const from = one(sp, "from");
  const to = one(sp, "to");
  const page = pageOf(sp);

  const where: (SQL | undefined)[] = [];
  if (q) where.push(or(ilike(payments.reference, `%${q}%`), ilike(orders.orderNumber, `%${q}%`), ilike(orders.customerName, `%${q}%`), ilike(payments.transferReference, `%${q}%`), ilike(payments.providerTransactionId, `%${q}%`)));
  if (status && status in PAYMENT_STATUS) where.push(eq(payments.status, status as never));
  if (method && method in PAYMENT_METHOD) where.push(eq(payments.method, method as never));
  if (rec === "unreconciled" || rec === "reconciled" || rec === "flagged" || rec === "investigating") where.push(eq(payments.reconciliationStatus, rec));
  if (from) where.push(gte(payments.createdAt, new Date(`${from}T00:00:00+01:00`)));
  if (to) where.push(lte(payments.createdAt, new Date(`${to}T23:59:59+01:00`)));
  const w = and(...where);

  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  const [[summary], series, split] = await Promise.all([
    db
      .select({
        today: sql<number>`coalesce(sum(${payments.amountPaid}) FILTER (WHERE ${payments.status} = 'successful' AND (${payments.paidAt} AT TIME ZONE 'Africa/Lagos')::date = (now() AT TIME ZONE 'Africa/Lagos')::date),0)::bigint`,
        todayCount: sql<number>`count(*) FILTER (WHERE (${payments.createdAt} AT TIME ZONE 'Africa/Lagos')::date = (now() AT TIME ZONE 'Africa/Lagos')::date)::int`,
        successful: sql<number>`count(*) FILTER (WHERE ${payments.status} = 'successful')::int`,
        pending: sql<number>`count(*) FILTER (WHERE ${payments.status} IN ('pending','initialized','processing','verification_pending'))::int`,
        verification: sql<number>`count(*) FILTER (WHERE ${payments.status} = 'verification_pending')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${payments.status} IN ('failed','verification_failed'))::int`,
        abandoned: sql<number>`count(*) FILTER (WHERE ${payments.status} IN ('abandoned','cancelled'))::int`,
        refunded: sql<number>`count(*) FILTER (WHERE ${payments.status} IN ('refunded','partially_refunded','refund_pending'))::int`,
        total: sql<number>`coalesce(sum(${payments.amountPaid}) FILTER (WHERE ${payments.status} IN ('successful','partially_refunded')),0)::bigint`,
      })
      .from(payments),
    tab === "overview" ? paymentSeries(start, end) : Promise.resolve([]),
    tab === "overview" ? paymentMethodSplit(start, end) : Promise.resolve([]),
  ]);

  const [rows, [{ total }]] =
    tab === "reconciliation"
      ? await Promise.all([
          db
            .select({ p: payments, orderNumber: orders.orderNumber, customer: orders.customerName, assignee: user.name })
            .from(payments)
            .innerJoin(orders, eq(orders.id, payments.orderId))
            .leftJoin(user, eq(user.id, payments.assignedTo))
            .where(w)
            .orderBy(desc(payments.createdAt))
            .limit(PER)
            .offset((page - 1) * PER),
          db.select({ total: sql<number>`count(*)::int` }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(w),
        ])
      : [[], [{ total: 0 }]];

  const refundRows =
    tab === "refunds"
      ? await db
          .select({ r: refunds, orderNumber: orders.orderNumber, customer: orders.customerName, method: payments.method })
          .from(refunds)
          .innerJoin(orders, eq(orders.id, refunds.orderId))
          .innerJoin(payments, eq(payments.id, refunds.paymentId))
          .orderBy(desc(refunds.createdAt))
          .limit(100)
      : [];

  return (
    <div>
      <AdminHeader
        title="Payments"
        description="Paystack and bank transfer payments, verification, reconciliation and refunds."
        actions={
          can(staff, "reports.export") && (
            <ButtonLink href="/admin/export/payments" variant="outline" size="sm">
              <Download aria-hidden /> Export CSV
            </ButtonLink>
          )
        }
      />
      <AdminTabs base="/admin/payments" active={tab} tabs={[["overview", "Overview"], ["reconciliation", "Reconciliation"], ["refunds", "Refunds"]]} />

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Received today" value={formatMoney(Number(summary.today))} hint={`${summary.todayCount} payment attempt(s) today`} icon={<Wallet />} />
            <StatCard label="Successful" value={summary.successful} hint={`${formatMoney(Number(summary.total))} total value`} icon={<CheckCircle2 />} tone="success" />
            <StatCard label="Pending" value={summary.pending} hint={`${summary.verification} bank transfer(s) to verify`} icon={<Clock />} tone="warning" />
            <StatCard label="Failed / abandoned" value={`${summary.failed} / ${summary.abandoned}`} hint={`${summary.refunded} refunded`} icon={<XCircle />} tone="accent" />
          </div>
          {summary.verification > 0 && can(staff, "payments.verify_transfer") && (
            <Link href="/admin/payments?tab=reconciliation&status=verification_pending" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              <AlertTriangle className="size-5" aria-hidden /> {summary.verification} bank transfer(s) are waiting for verification →
            </Link>
          )}
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Panel title="Payment trend (30 days)">
              <PaymentsChart data={series} />
            </Panel>
            <Panel title="Payment methods (30 days)">
              {split.length ? <SimpleBars data={split.map((s) => ({ method: PAYMENT_METHOD[s.method], total: s.total }))} valueKey="total" labelKey="method" money /> : <p className="text-sm text-muted">No successful payments yet.</p>}
            </Panel>
          </div>
        </div>
      )}

      {tab === "reconciliation" && (
        <>
          <FilterBar action="/admin/payments">
            <input type="hidden" name="tab" value="reconciliation" />
            <FilterInput name="q" label="Search" defaultValue={q} placeholder="Reference, order, customer" className="min-w-56 flex-1" />
            <FilterSelect name="status" label="Status" defaultValue={status} options={Object.entries(PAYMENT_STATUS).map(([k, v]) => [k, v.label])} />
            <FilterSelect name="method" label="Method" defaultValue={method} options={Object.entries(PAYMENT_METHOD)} />
            <FilterSelect name="rec" label="Reconciliation" defaultValue={rec} options={[["unreconciled", "Unreconciled"], ["reconciled", "Reconciled"], ["flagged", "Flagged"], ["investigating", "Investigating"]]} />
            <FilterInput name="from" label="From" type="date" defaultValue={from} />
            <FilterInput name="to" label="To" type="date" defaultValue={to} />
          </FilterBar>
          <Table head={["Reference / txn", "Order", "Customer", "Expected", "Paid", "Method", "Status", "Verification", "Reconciliation", "Assigned", "Time"]}>
            {rows.length === 0 && <EmptyRow cols={11} />}
            {rows.map(({ p, orderNumber, customer, assignee }) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/payments/${p.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                    {p.reference}
                  </Link>
                  {p.providerTransactionId && <span className="block text-xs text-muted">Txn {p.providerTransactionId}</span>}
                </td>
                <td>
                  <Link href={`/admin/orders/${p.orderId}`} className="hover:underline">
                    {orderNumber}
                  </Link>
                </td>
                <td>{customer}</td>
                <td className="whitespace-nowrap">{formatMoney(p.amountExpected)}</td>
                <td className={`whitespace-nowrap ${p.amountPaid != null && p.amountPaid !== p.amountExpected ? "font-bold text-red-600" : ""}`}>{p.amountPaid != null ? formatMoney(p.amountPaid) : "—"}</td>
                <td>
                  {PAYMENT_METHOD[p.method]}
                  {p.mode && <span className="block text-[11px] uppercase text-muted">{p.mode}</span>}
                </td>
                <td>
                  <StatusBadge map={PAYMENT_STATUS} value={p.status} />
                </td>
                <td className="capitalize">{p.verificationStatus}</td>
                <td>
                  <Badge tone={p.reconciliationStatus === "reconciled" ? "success" : p.reconciliationStatus === "flagged" ? "danger" : p.reconciliationStatus === "investigating" ? "warning" : "neutral"}>{p.reconciliationStatus}</Badge>
                </td>
                <td>{assignee ?? "—"}</td>
                <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(p.createdAt)}</td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pages={Math.ceil(total / PER)} hrefFor={(p) => qsWith("/admin/payments", sp, { page: p > 1 ? String(p) : undefined })} />
        </>
      )}

      {tab === "refunds" && (
        <Table head={["Order", "Customer", "Amount", "Reason", "Method", "Status", "Requested", "Action"]}>
          {refundRows.length === 0 && <EmptyRow cols={8} text="No refunds requested." />}
          {refundRows.map(({ r, orderNumber, customer, method: m }) => (
            <tr key={r.id}>
              <td>
                <Link href={`/admin/orders/${r.orderId}`} className="font-semibold text-brand-700 hover:underline">
                  {orderNumber}
                </Link>
              </td>
              <td>{customer}</td>
              <td className="whitespace-nowrap font-semibold">
                {formatMoney(r.amount)} {r.isPartial && <span className="text-xs font-normal text-muted">(partial)</span>}
              </td>
              <td className="max-w-xs">{r.reason}</td>
              <td>{PAYMENT_METHOD[m]}</td>
              <td>
                <StatusBadge map={REFUND_STATUS} value={r.status} />
                {r.failureReason && <span className="block text-xs text-red-600">{r.failureReason}</span>}
              </td>
              <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.createdAt)}</td>
              <td>{can(staff, "refunds.process") && ["requested", "approved", "failed"].includes(r.status) ? <RefundDecision refundId={r.id} method={m} /> : <Undo2 className="size-4 text-slate-300" aria-hidden />}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
