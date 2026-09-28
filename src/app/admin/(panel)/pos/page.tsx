import { and, asc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { PosTerminal } from "@/components/admin/pos-terminal";
import { AdminHeader } from "@/components/admin/ui";
import { db } from "@/server/db";
import { inventory, productVariants, products } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Point of sale" };

export default async function PosPage() {
  const staff = await requireStaffPage("pos.use");
  const rows = await db
    .select({ variantId: productVariants.id, name: products.name, variant: productVariants.name, sku: productVariants.sku, barcode: productVariants.barcode, vPrice: productVariants.price, vDisc: productVariants.discountPrice, pPrice: products.price, pDisc: products.discountPrice, onHand: inventory.onHand, reserved: inventory.reserved })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(products.status, "active"), isNull(products.deletedAt), eq(productVariants.isActive, true)))
    .orderBy(asc(products.name));
  const items = rows.map((r) => {
    const list = r.vPrice ?? r.pPrice;
    const sale = r.vPrice != null ? r.vDisc : (r.vDisc ?? r.pDisc);
    return { variantId: r.variantId, label: `${r.name}${r.variant !== "Default" ? ` — ${r.variant}` : ""}`, sku: r.sku, barcode: r.barcode, price: sale != null && sale < list ? sale : list, available: Math.max(0, (r.onHand ?? 0) - (r.reserved ?? 0)) };
  });
  return (
    <div>
      <AdminHeader title="Point of sale" description="In-store sales update inventory and issue receipts instantly. Prices shown before VAT; totals are calculated on the server." />
      <PosTerminal items={items} canDiscount={can(staff, "orders.manage") || can(staff, "products.edit")} />
    </div>
  );
}
