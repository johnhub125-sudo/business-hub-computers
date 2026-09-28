import "server-only";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { nairaToKobo } from "@/lib/money";
import { audit } from "../audit";
import { db } from "../db";
import { productVariants, products, purchaseItems, purchases } from "../db/schema";
import { UserError } from "../errors";
import type { StaffContext } from "../session";
import { adjustStock } from "./inventory";
import { nextNumber } from "./numbers";

export const purchaseSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  supplierInvoice: z.string().trim().max(80).optional().nullable(),
  purchaseDate: z.string().min(8),
  notes: z.string().trim().max(2000).optional().nullable(),
  attachmentUrl: z.string().max(500).optional().nullable(),
  status: z.enum(["draft", "ordered"]),
  items: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(100000), unitCost: z.union([z.string(), z.number()]) }))
    .min(1, "Add at least one item")
    .max(200),
});

type Staff = Pick<StaffContext, "id" | "email" | "roleLabel">;

export async function savePurchase(raw: unknown, staff: Staff) {
  const d = purchaseSchema.parse(raw);
  const items = d.items.map((i) => {
    const unitCost = nairaToKobo(String(i.unitCost));
    if (unitCost < 0) throw new UserError("Unit cost cannot be negative.");
    return { variantId: i.variantId, quantity: i.quantity, unitCost, lineTotal: unitCost * i.quantity };
  });
  const variants = await db.select({ id: productVariants.id }).from(productVariants).where(inArray(productVariants.id, items.map((i) => i.variantId)));
  if (variants.length !== new Set(items.map((i) => i.variantId)).size) throw new UserError("One or more products were not found.");
  const totalCost = items.reduce((s, i) => s + i.lineTotal, 0);
  const date = new Date(`${d.purchaseDate}T12:00:00+01:00`);

  return db.transaction(async (tx) => {
    let id = d.id ?? null;
    if (id) {
      const [existing] = await tx.select().from(purchases).where(eq(purchases.id, id)).for("update");
      if (!existing) throw new UserError("Purchase not found.");
      if (existing.status === "received" || existing.status === "cancelled") throw new UserError("Received or cancelled purchases can't be edited.");
      await tx.update(purchases).set({ supplierId: d.supplierId || null, supplierInvoice: d.supplierInvoice || null, purchaseDate: date, notes: d.notes || null, attachmentUrl: d.attachmentUrl || null, status: d.status, totalCost, updatedAt: new Date() }).where(eq(purchases.id, id));
      await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    } else {
      const purchaseNumber = await nextNumber(tx, "purchase");
      const [p] = await tx.insert(purchases).values({ purchaseNumber, supplierId: d.supplierId || null, supplierInvoice: d.supplierInvoice || null, purchaseDate: date, notes: d.notes || null, attachmentUrl: d.attachmentUrl || null, status: d.status, totalCost, createdBy: staff.id }).returning({ id: purchases.id });
      id = p.id;
    }
    await tx.insert(purchaseItems).values(items.map((i) => ({ ...i, purchaseId: id! })));
    await audit({ actor: staff, action: d.id ? "purchase.updated" : "purchase.created", module: "Purchases", description: `${d.id ? "Updated" : "Recorded"} purchase (${items.length} line(s), ₦${(totalCost / 100).toLocaleString()})`, entityType: "purchase", entityId: id }, tx);
    return { id: id! };
  });
}

/** Confirms receipt: adds stock for every line exactly once (ledger idempotency keys). */
export async function receivePurchase(id: string, staff: Staff, updateCostPrices: boolean) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(purchases).where(eq(purchases.id, id)).for("update");
    if (!p) throw new UserError("Purchase not found.");
    if (p.status === "received") throw new UserError("This purchase has already been received.");
    if (p.status === "cancelled") throw new UserError("This purchase was cancelled.");
    const lines = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    for (const l of lines) {
      await adjustStock(tx, { variantId: l.variantId, delta: l.quantity, type: "purchase", referenceType: "purchase", referenceId: id, userId: staff.id, note: `Received on ${p.purchaseNumber}`, idempotencyKey: `purchase:${id}:${l.id}` });
      if (updateCostPrices) {
        const [v] = await tx.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, l.variantId));
        if (v) await tx.update(products).set({ purchasePrice: l.unitCost, updatedAt: new Date() }).where(eq(products.id, v.productId));
      }
    }
    await tx.update(purchases).set({ status: "received", receivedBy: staff.id, receivedAt: new Date(), updatedAt: new Date() }).where(eq(purchases.id, id));
    await audit({ actor: staff, action: "purchase.received", module: "Purchases", description: `Received ${p.purchaseNumber}: ${lines.reduce((s, l) => s + l.quantity, 0)} unit(s) added to stock`, entityType: "purchase", entityId: id }, tx);
  });
}

export async function cancelPurchase(id: string, staff: Staff) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(purchases).where(eq(purchases.id, id)).for("update");
    if (!p) throw new UserError("Purchase not found.");
    if (p.status === "received") throw new UserError("Received purchases can't be cancelled. Use an inventory adjustment instead.");
    await tx.update(purchases).set({ status: "cancelled", updatedAt: new Date() }).where(eq(purchases.id, id));
    await audit({ actor: staff, action: "purchase.cancelled", module: "Purchases", description: `Cancelled ${p.purchaseNumber}`, entityType: "purchase", entityId: id }, tx);
  });
}
