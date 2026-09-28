import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { productVariants, products, suppliers } from "@/server/db/schema";

export async function purchaseFormOptions() {
  const [variants, sups] = await Promise.all([
    db
      .select({ id: productVariants.id, name: products.name, variant: productVariants.name, sku: productVariants.sku, cost: products.purchasePrice })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .orderBy(asc(products.name), asc(productVariants.sortOrder)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name)),
  ]);
  return {
    variants: variants.map((v) => ({ id: v.id, label: `${v.name}${v.variant !== "Default" ? ` — ${v.variant}` : ""} (${v.sku})`, cost: v.cost })),
    suppliers: sups,
  };
}
