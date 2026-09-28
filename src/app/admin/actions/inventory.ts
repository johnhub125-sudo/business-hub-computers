"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { productVariants, products } from "@/server/db/schema";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { adjustStock } from "@/server/services/inventory";

const schema = z.object({
  variantId: z.string().uuid(),
  type: z.enum(["adjustment", "damage", "return", "correction", "purchase"]),
  quantity: z.coerce.number().int().refine((n) => n !== 0, "Quantity cannot be zero").refine((n) => Math.abs(n) <= 100000, "Too large"),
  note: z.string().trim().min(3, "Explain the reason").max(500),
});

/** Manual stock movement with mandatory reason; damage/return/purchase direction is enforced. */
export async function adjustStockAction(input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("inventory.manage");
    const d = schema.parse(input);
    let delta = d.quantity;
    if (d.type === "damage") delta = -Math.abs(d.quantity);
    if (d.type === "return" || d.type === "purchase") delta = Math.abs(d.quantity);
    const [v] = await db.select({ sku: productVariants.sku, name: products.name }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(eq(productVariants.id, d.variantId));
    if (!v) throw new UserError("Variant not found.");
    await db.transaction(async (tx) => {
      const res = await adjustStock(tx, { variantId: d.variantId, delta, type: d.type, referenceType: "manual", referenceId: staff.id, userId: staff.id, note: d.note });
      await audit({ actor: staff, action: "inventory.adjusted", module: "Inventory", description: `${d.type} ${delta > 0 ? "+" : ""}${delta} on ${v.name} (${v.sku}): ${d.note}`, entityType: "variant", entityId: d.variantId, after: { onHand: res.onHand, delta, type: d.type } }, tx);
    });
    refresh();
  }, "Stock updated");
}
