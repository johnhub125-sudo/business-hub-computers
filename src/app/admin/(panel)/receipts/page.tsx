import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, EmptyRow, FilterBar, FilterInput, one, pageOf, qsWith, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD } from "@/lib/status";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { orders, receipts } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Receipts" };
const PER = 40;

export default async function ReceiptsPage({ searchParams }: PageProps<"/admin/receipts">) {
  const staff = await requireStaffPage();
  if (!can(staff, "payments.view") && !can(staff, "orders.manage")) return <p className="text-muted">You don&apos;t have access to receipts.</p>;
  const sp = (await searchParams) as SP;
  const q = one(sp, "q")?.trim();
  const from = one(sp, "from");
  const to = one(sp, "to");
  const page = pageOf(sp);
  const where: (SQL | undefined)[] = [];
  if (q) where.push(or(ilike(receipts.receiptNumber, `%${q}%`), ilike(orders.orderNumber, `%${q}%`), ilike(orders.customerName, `%${q}%`)));
  if (from) where.push(gte(receipts.issuedAt, new Date(`${from}T00:00:00+01:00`)));
  if (to) where.push(lte(receipts.issuedAt, new Date(`${to}T23:59:59+01:00`)));
  const w = and(...where);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ r: receipts, o: orders }).from(receipts).innerJoin(orders, eq(orders.id, receipts.orderId)).where(w).orderBy(desc(receipts.issuedAt)).limit(PER).offset((page - 1) * PER),
    db.select({ total: sql<number>`count(*)::int` }).from(receipts).innerJoin(orders, eq(orders.id, receipts.orderId)).where(w),
  ]);
  return (
    <div>
      <AdminHeader
        title="Receipts"
        description="One receipt per paid order — numbers are never reused or duplicated."
        actions={
          can(staff, "reports.export") && (
            <ButtonLink href="/admin/export/receipts" variant="outline" size="sm">
              <Download aria-hidden /> Export CSV
            </ButtonLink>
          )
        }
      />
      <FilterBar action="/admin/receipts">
        <FilterInput name="q" label="Search" defaultValue={q} placeholder="Receipt, order or customer" className="min-w-56 flex-1" />
        <FilterInput name="from" label="From" type="date" defaultValue={from} />
        <FilterInput name="to" label="To" type="date" defaultValue={to} />
      </FilterBar>
      <Table head={["Receipt", "Issued", "Order", "Customer", "Method", "Channel", "Total", ""]}>
        {rows.length === 0 && <EmptyRow cols={8} />}
        {rows.map(({ r, o }) => (
          <tr key={r.id}>
            <td className="font-semibold">{r.receiptNumber}</td>
            <td className="whitespace-nowrap text-muted">{formatDateTime(r.issuedAt)}</td>
            <td>
              <Link href={`/admin/orders/${o.id}`} className="text-brand-700 hover:underline">
                {o.orderNumber}
              </Link>
            </td>
            <td>{o.customerName}</td>
            <td>{PAYMENT_METHOD[o.paymentMethod]}</td>
            <td className="capitalize">{o.channel}</td>
            <td className="font-semibold">{formatMoney(o.grandTotal)}</td>
            <td className="whitespace-nowrap text-right">
              <a href={`/api/receipts/${o.id}`} target="_blank" rel="noopener" className="mr-3 text-xs font-semibold text-brand-600 hover:underline">
                View / print
              </a>
              <a href={`/api/receipts/${o.id}?download=1`} className="text-xs font-semibold text-muted hover:text-ink">
                PDF
              </a>
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pages={Math.ceil(total / PER)} hrefFor={(p) => qsWith("/admin/receipts", sp, { page: p > 1 ? String(p) : undefined })} />
    </div>
  );
}
