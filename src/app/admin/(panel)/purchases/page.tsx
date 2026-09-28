import { desc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, EmptyRow, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { purchases, suppliers, user } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage({ searchParams }: PageProps<"/admin/purchases">) {
  await requireStaffPage("purchases.manage");
  const tab = tabOf((await searchParams) as SP, ["purchases", "suppliers"]);
  const rows =
    tab === "purchases"
      ? await db
          .select({ p: purchases, supplier: suppliers.name, by: user.name, units: sql<number>`(SELECT coalesce(sum(quantity),0) FROM purchase_items WHERE purchase_id = ${purchases.id})::int` })
          .from(purchases)
          .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
          .leftJoin(user, eq(user.id, purchases.createdBy))
          .orderBy(desc(purchases.purchaseDate))
          .limit(200)
      : [];
  return (
    <div>
      <AdminHeader
        title="Purchases"
        description="Record stock bought from suppliers. Receiving a purchase adds the stock to inventory automatically."
        actions={
          <ButtonLink href="/admin/purchases/new" size="sm">
            <Plus aria-hidden /> New purchase
          </ButtonLink>
        }
      />
      <AdminTabs base="/admin/purchases" active={tab} tabs={[["purchases", "Purchase orders"], ["suppliers", "Suppliers"]]} />
      {tab === "suppliers" ? (
        <CrudSection entity="suppliers" />
      ) : (
        <Table head={["PO number", "Date", "Supplier", "Invoice", "Units", "Total cost", "Status", "Recorded by"]}>
          {rows.length === 0 && <EmptyRow cols={8} text="No purchases recorded yet." />}
          {rows.map(({ p, supplier, by, units }) => (
            <tr key={p.id}>
              <td>
                <Link href={`/admin/purchases/${p.id}`} className="font-semibold text-brand-700 hover:underline">
                  {p.purchaseNumber}
                </Link>
              </td>
              <td>{formatDate(p.purchaseDate)}</td>
              <td>{supplier ?? "—"}</td>
              <td>{p.supplierInvoice ?? "—"}</td>
              <td>{units}</td>
              <td className="font-semibold">{formatMoney(p.totalCost)}</td>
              <td>
                <Badge tone={p.status === "received" ? "success" : p.status === "cancelled" ? "neutral" : p.status === "ordered" ? "info" : "warning"}>{p.status}</Badge>
              </td>
              <td>{by ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
