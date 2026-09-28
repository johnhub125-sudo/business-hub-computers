import { eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PurchaseActions } from "@/components/admin/purchase-actions";
import { PurchaseForm } from "@/components/admin/purchase-form";
import { AdminHeader, Panel, Table } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { formatMoney, koboToNairaString } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { productVariants, products, purchaseItems, purchases, suppliers, user } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";
import { purchaseFormOptions } from "../form-data";

export const metadata: Metadata = { title: "Purchase" };

export default async function PurchasePage({ params }: PageProps<"/admin/purchases/[id]">) {
  await requireStaffPage("purchases.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(purchases).where(eq(purchases.id, id));
  if (!p) notFound();
  const [items, [supplier], [receiver]] = await Promise.all([
    db.select({ i: purchaseItems, name: products.name, variant: productVariants.name, sku: productVariants.sku }).from(purchaseItems).innerJoin(productVariants, eq(productVariants.id, purchaseItems.variantId)).innerJoin(products, eq(products.id, productVariants.productId)).where(eq(purchaseItems.purchaseId, id)),
    p.supplierId ? db.select().from(suppliers).where(eq(suppliers.id, p.supplierId)) : Promise.resolve([]),
    p.receivedBy ? db.select({ name: user.name }).from(user).where(eq(user.id, p.receivedBy)) : Promise.resolve([]),
  ]);
  const editable = p.status === "draft" || p.status === "ordered";
  const opts = editable ? await purchaseFormOptions() : null;

  return (
    <div className="space-y-6">
      <AdminHeader
        title={p.purchaseNumber}
        description={
          <span className="flex items-center gap-2">
            {formatDate(p.purchaseDate)} · {supplier?.name ?? "No supplier"} <Badge tone={p.status === "received" ? "success" : p.status === "cancelled" ? "neutral" : "info"}>{p.status}</Badge>
          </span>
        }
        back={{ href: "/admin/purchases", label: "Purchases" }}
        actions={editable && <PurchaseActions id={p.id} />}
      />
      {p.status === "received" && (
        <Panel>
          <p className="text-sm">
            Received by <strong>{receiver?.name ?? "—"}</strong> on {formatDateTime(p.receivedAt)}. Stock was added to inventory.
          </p>
        </Panel>
      )}
      {p.attachmentUrl && (
        <a href={`/api/files/${p.attachmentUrl}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:underline">
          <FileText className="size-4" aria-hidden /> View attachment
        </a>
      )}
      {editable && opts ? (
        <PurchaseForm
          {...opts}
          initial={{
            id: p.id,
            supplierId: p.supplierId ?? "",
            supplierInvoice: p.supplierInvoice ?? "",
            purchaseDate: new Date(p.purchaseDate.getTime() + 3_600_000).toISOString().slice(0, 10),
            notes: p.notes ?? "",
            attachmentUrl: p.attachmentUrl ?? "",
            status: p.status as "draft" | "ordered",
            items: items.map(({ i }) => ({ variantId: i.variantId, quantity: String(i.quantity), unitCost: koboToNairaString(i.unitCost) })),
          }}
        />
      ) : (
        <Table head={["Product", "SKU", "Qty", "Unit cost", "Line total"]}>
          {items.map(({ i, name, variant, sku }) => (
            <tr key={i.id}>
              <td>
                {name}
                {variant !== "Default" && <span className="block text-xs text-muted">{variant}</span>}
              </td>
              <td className="font-mono text-xs">{sku}</td>
              <td>{i.quantity}</td>
              <td>{formatMoney(i.unitCost)}</td>
              <td className="font-semibold">{formatMoney(i.lineTotal)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="text-right font-bold">
              Total
            </td>
            <td className="font-extrabold">{formatMoney(p.totalCost)}</td>
          </tr>
        </Table>
      )}
      {p.notes && !editable && <Panel title="Notes">{p.notes}</Panel>}
    </div>
  );
}
