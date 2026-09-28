import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StockAdjust } from "@/components/admin/stock-adjust";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, EmptyRow, FilterBar, FilterInput, FilterSelect, one, pageOf, qsWith, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Pagination, StatCard } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { inventory, inventoryTransactions, productVariants, products, user } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Inventory" };
const PER = 40;

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const staff = await requireStaffPage("inventory.manage");
  const sp = (await searchParams) as SP;
  const tab = tabOf(sp, ["stock", "ledger"]);
  const q = one(sp, "q")?.trim();
  const filter = one(sp, "filter");
  const type = one(sp, "type");
  const page = pageOf(sp);

  const available = sql<number>`${inventory.onHand} - ${inventory.reserved}`;
  const where: (SQL | undefined)[] = [];
  if (q) where.push(or(ilike(products.name, `%${q}%`), ilike(productVariants.sku, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(productVariants.barcode, `%${q}%`)));
  if (filter === "low") where.push(sql`${available} <= ${products.minStockLevel}`);
  if (filter === "out") where.push(sql`${available} <= 0`);
  if (filter === "reserved") where.push(sql`${inventory.reserved} > 0`);

  const [[totals]] = await Promise.all([
    db
      .select({
        units: sql<number>`coalesce(sum(${inventory.onHand}),0)::int`,
        reserved: sql<number>`coalesce(sum(${inventory.reserved}),0)::int`,
        value: sql<number>`coalesce(sum(${inventory.onHand} * ${products.purchasePrice}),0)::bigint`,
        low: sql<number>`count(*) FILTER (WHERE ${available} <= ${products.minStockLevel} AND ${available} > 0)::int`,
        out: sql<number>`count(*) FILTER (WHERE ${available} <= 0)::int`,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(products.status, "active")),
  ]);

  let stockRows: { variantId: string; productId: string; name: string; variant: string; sku: string; onHand: number; reserved: number; sold: number; damaged: number; returned: number; min: number; updatedAt: Date }[] = [];
  let ledger: { t: typeof inventoryTransactions.$inferSelect; name: string; sku: string; by: string | null }[] = [];
  let total = 0;
  if (tab === "stock") {
    const w = and(...where);
    [stockRows, [{ total }]] = await Promise.all([
      db
        .select({ variantId: inventory.variantId, productId: products.id, name: products.name, variant: productVariants.name, sku: productVariants.sku, onHand: inventory.onHand, reserved: inventory.reserved, sold: inventory.sold, damaged: inventory.damaged, returned: inventory.returned, min: products.minStockLevel, updatedAt: inventory.updatedAt })
        .from(inventory)
        .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(w)
        .orderBy(sql`${available} ASC`, products.name)
        .limit(PER)
        .offset((page - 1) * PER),
      db.select({ total: sql<number>`count(*)::int` }).from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).innerJoin(products, eq(products.id, productVariants.productId)).where(w),
    ]);
  } else {
    const lw: (SQL | undefined)[] = [];
    if (q) lw.push(or(ilike(products.name, `%${q}%`), ilike(productVariants.sku, `%${q}%`)));
    if (type) lw.push(eq(inventoryTransactions.type, type as never));
    const w = and(...lw);
    [ledger, [{ total }]] = await Promise.all([
      db
        .select({ t: inventoryTransactions, name: products.name, sku: productVariants.sku, by: user.name })
        .from(inventoryTransactions)
        .innerJoin(productVariants, eq(productVariants.id, inventoryTransactions.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .leftJoin(user, eq(user.id, inventoryTransactions.userId))
        .where(w)
        .orderBy(desc(inventoryTransactions.createdAt))
        .limit(PER)
        .offset((page - 1) * PER),
      db.select({ total: sql<number>`count(*)::int` }).from(inventoryTransactions).innerJoin(productVariants, eq(productVariants.id, inventoryTransactions.variantId)).innerJoin(products, eq(products.id, productVariants.productId)).where(w),
    ]);
  }

  return (
    <div>
      <AdminHeader
        title="Inventory"
        description="Stock is transactional: every movement is recorded, reservations hold stock during payment, and stock can never go negative."
        actions={
          can(staff, "reports.export") && (
            <ButtonLink href="/admin/export/inventory" variant="outline" size="sm">
              <Download aria-hidden /> Export CSV
            </ButtonLink>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Units on hand" value={totals.units.toLocaleString()} hint={`${totals.reserved} reserved for unpaid orders`} />
        <StatCard label="Stock value (cost)" value={formatMoney(Number(totals.value))} tone="success" />
        <StatCard label="Low stock variants" value={totals.low} tone="warning" />
        <StatCard label="Out of stock variants" value={totals.out} tone="accent" />
      </div>
      <AdminTabs base="/admin/inventory" active={tab} tabs={[["stock", "Stock levels"], ["ledger", "Transaction ledger"]]} />
      <FilterBar action="/admin/inventory">
        <input type="hidden" name="tab" value={tab} />
        <FilterInput name="q" label="Search" defaultValue={q} placeholder="Product, SKU or barcode" className="min-w-56 flex-1" />
        {tab === "stock" ? (
          <FilterSelect name="filter" label="Show" defaultValue={filter} options={[["low", "Low stock"], ["out", "Out of stock"], ["reserved", "Has reservations"]]} />
        ) : (
          <FilterSelect name="type" label="Type" defaultValue={type} options={["purchase", "sale", "adjustment", "return", "damage", "reservation", "release", "correction"].map((t) => [t, t])} />
        )}
      </FilterBar>
      {tab === "stock" ? (
        <Table head={["Product / variant", "SKU", "On hand", "Reserved", "Available", "Sold", "Damaged", "Returned", "Status", ""]}>
          {stockRows.length === 0 && <EmptyRow cols={10} />}
          {stockRows.map((r) => {
            const avail = r.onHand - r.reserved;
            return (
              <tr key={r.variantId}>
                <td>
                  <Link href={`/admin/products/${r.productId}`} className="font-semibold hover:text-brand-700">
                    {r.name}
                  </Link>
                  {r.variant !== "Default" && <span className="block text-xs text-muted">{r.variant}</span>}
                </td>
                <td className="font-mono text-xs">{r.sku}</td>
                <td className="font-semibold">{r.onHand}</td>
                <td>{r.reserved || "—"}</td>
                <td className="font-semibold">{avail}</td>
                <td>{r.sold}</td>
                <td>{r.damaged || "—"}</td>
                <td>{r.returned || "—"}</td>
                <td>{avail <= 0 ? <Badge tone="danger">Out of stock</Badge> : avail <= r.min ? <Badge tone="warning">Low stock</Badge> : <Badge tone="success">In stock</Badge>}</td>
                <td>
                  <StockAdjust variantId={r.variantId} label={`${r.name}${r.variant !== "Default" ? ` — ${r.variant}` : ""}`} onHand={r.onHand} />
                </td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Table head={["Time", "Product", "Type", "On hand Δ", "Reserved Δ", "After (on hand / reserved)", "Reference", "By", "Note"]}>
          {ledger.length === 0 && <EmptyRow cols={9} />}
          {ledger.map(({ t, name, sku, by }) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(t.createdAt)}</td>
              <td>
                {name}
                <span className="block font-mono text-xs text-muted">{sku}</span>
              </td>
              <td>
                <Badge tone={t.type === "sale" ? "brand" : t.type === "damage" ? "danger" : t.type === "purchase" || t.type === "return" ? "success" : "neutral"}>{t.type}</Badge>
              </td>
              <td className={t.quantity > 0 ? "text-emerald-700" : t.quantity < 0 ? "text-red-600" : "text-muted"}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity || "—"}</td>
              <td className="text-muted">{t.reservedDelta ? (t.reservedDelta > 0 ? `+${t.reservedDelta}` : t.reservedDelta) : "—"}</td>
              <td>
                {t.onHandAfter} / {t.reservedAfter}
              </td>
              <td className="text-xs">{t.referenceType === "order" ? <Link className="text-brand-600 hover:underline" href={`/admin/orders/${t.referenceId}`}>Order</Link> : t.referenceType === "purchase" ? <Link className="text-brand-600 hover:underline" href={`/admin/purchases/${t.referenceId}`}>Purchase</Link> : t.referenceType}</td>
              <td className="text-xs">{by ?? "System"}</td>
              <td className="max-w-xs text-xs text-muted">{t.note}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={page} pages={Math.ceil(total / PER)} hrefFor={(p) => qsWith("/admin/inventory", sp, { page: p > 1 ? String(p) : undefined })} />
    </div>
  );
}
