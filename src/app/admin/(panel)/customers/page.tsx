import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, EmptyRow, FilterBar, FilterInput, FilterSelect, one, pageOf, qsWith, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Pagination } from "@/components/ui/misc";
import { NIGERIAN_STATES } from "@/lib/brand";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { customerProfiles, user } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Customers" };
const PER = 30;

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const staff = await requireStaffPage("customers.manage");
  const sp = (await searchParams) as SP;
  const q = one(sp, "q")?.trim();
  const state = one(sp, "state");
  const page = pageOf(sp);
  const where = and(
    eq(user.userType, "customer"),
    isNull(user.deletedAt),
    q ? or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`), ilike(customerProfiles.phone, `%${q}%`)) : undefined,
    state ? eq(customerProfiles.state, state) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        u: user,
        p: customerProfiles,
        orders: sql<number>`(SELECT count(*) FROM orders o WHERE o.user_id = ${user.id})::int`,
        spent: sql<number>`(SELECT coalesce(sum(o.grand_total),0) FROM orders o WHERE o.user_id = ${user.id} AND o.payment_status = 'successful')::bigint`,
      })
      .from(user)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, user.id))
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(PER)
      .offset((page - 1) * PER),
    db.select({ total: sql<number>`count(*)::int` }).from(user).leftJoin(customerProfiles, eq(customerProfiles.userId, user.id)).where(where),
  ]);
  return (
    <div>
      <AdminHeader
        title="Customers"
        description={`${total} customer(s)`}
        actions={
          can(staff, "reports.export") && (
            <ButtonLink href="/admin/export/customers" variant="outline" size="sm">
              <Download aria-hidden /> Export CSV
            </ButtonLink>
          )
        }
      />
      <FilterBar action="/admin/customers">
        <FilterInput name="q" label="Search" defaultValue={q} placeholder="Name, email or phone" className="min-w-56 flex-1" />
        <FilterSelect name="state" label="State" defaultValue={state} options={NIGERIAN_STATES.map((s) => [s, s])} />
      </FilterBar>
      <Table head={["Customer", "Phone", "Location", "Orders", "Total spent", "Joined", "Status"]}>
        {rows.length === 0 && <EmptyRow cols={7} />}
        {rows.map(({ u, p, orders, spent }) => (
          <tr key={u.id}>
            <td>
              <Link href={`/admin/customers/${u.id}`} className="font-semibold text-brand-700 hover:underline">
                {u.name}
              </Link>
              <span className="block text-xs text-muted">{u.email}</span>
            </td>
            <td>{p?.phone ?? "—"}</td>
            <td>{p ? `${p.city}, ${p.state}` : "—"}</td>
            <td>{orders}</td>
            <td className="font-semibold">{formatMoney(Number(spent))}</td>
            <td>{formatDate(u.createdAt)}</td>
            <td>
              <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge> {!u.emailVerified && <Badge tone="warning">unverified</Badge>}
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pages={Math.ceil(total / PER)} hrefFor={(p) => qsWith("/admin/customers", sp, { page: p > 1 ? String(p) : undefined })} />
    </div>
  );
}
