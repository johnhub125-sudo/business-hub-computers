import "server-only";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { nairaToKobo } from "@/lib/money";
import { slugify } from "@/lib/utils";
import { audit, diff } from "../audit";
import { db, type Tx } from "../db";
import { brands, categories, inventory, orderItems, productConditions, productImages, productVariants, productVideos, products } from "../db/schema";
import { UserError } from "../errors";
import type { StaffContext } from "../session";
import { adjustStock } from "./inventory";

const naira = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).trim();
  if (!s) return null;
  try {
    const k = nairaToKobo(s);
    if (k < 0) throw new Error();
    return k;
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
    return z.NEVER;
  }
});

const variantSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/, "SKU: letters, numbers, . _ - only"),
  barcode: z.string().trim().max(64).optional().nullable(),
  price: naira.nullable().optional(),
  discountPrice: naira.nullable().optional(),
  attributes: z.record(z.string().max(40), z.string().max(120)).default({}),
  image: z.string().max(500).optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  openingStock: z.coerce.number().int().min(0).max(100000).optional().default(0),
});

export const productSchema = z
  .object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(3).max(200),
    slug: z.string().trim().max(120).optional().nullable(),
    sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/, "SKU: letters, numbers, . _ - only"),
    barcode: z.string().trim().max(64).optional().nullable(),
    brandId: z.string().uuid().optional().nullable(),
    categoryId: z.string().uuid({ message: "Choose a category" }),
    subcategoryId: z.string().uuid().optional().nullable(),
    conditionId: z.string().uuid({ message: "Choose a condition" }),
    shortDescription: z.string().trim().max(500).optional().nullable(),
    description: z.string().trim().max(20000).optional().nullable(),
    specifications: z.record(z.string().max(60), z.string().max(300)).default({}),
    purchasePrice: naira.nullable().optional(),
    price: naira.refine((v) => v != null && v > 0, "Price is required"),
    discountPrice: naira.nullable().optional(),
    vatExempt: z.boolean().default(false),
    minStockLevel: z.coerce.number().int().min(0).max(10000).default(2),
    warranty: z.string().trim().max(200).optional().nullable(),
    warrantyMonths: z.coerce.number().int().min(0).max(120).optional().nullable(),
    supplierId: z.string().uuid().optional().nullable(),
    weightGrams: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
    dimensions: z.string().trim().max(100).optional().nullable(),
    status: z.enum(["draft", "active", "archived"]),
    isFeatured: z.boolean().default(false),
    isDeal: z.boolean().default(false),
    isNewArrival: z.boolean().default(false),
    isBestSeller: z.boolean().default(false),
    isClearance: z.boolean().default(false),
    isRecommended: z.boolean().default(false),
    isTrending: z.boolean().default(false),
    seoTitle: z.string().trim().max(120).optional().nullable(),
    seoDescription: z.string().trim().max(300).optional().nullable(),
    seoKeywords: z.string().trim().max(300).optional().nullable(),
    variants: z.array(variantSchema).min(1, "Add at least one variant").max(50),
    videos: z.array(z.object({ url: z.string().url().max(500), title: z.string().max(120).optional().nullable() })).max(10).default([]),
    imageOrder: z.array(z.object({ id: z.string().uuid(), alt: z.string().max(200).optional().nullable() })).default([]),
  })
  .superRefine((p, ctx) => {
    if (p.discountPrice != null && p.price != null && p.discountPrice > p.price) ctx.addIssue({ code: "custom", path: ["discountPrice"], message: "Discount price must be below the price" });
    const skus = p.variants.map((v) => v.sku.toUpperCase());
    if (new Set(skus).size !== skus.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Variant SKUs must be unique" });
    p.variants.forEach((v, i) => {
      if (v.discountPrice != null && (v.price ?? p.price ?? 0) < v.discountPrice) ctx.addIssue({ code: "custom", path: ["variants", i, "discountPrice"], message: "Variant discount must be below its price" });
    });
  });

export type ProductInput = z.input<typeof productSchema>;

async function uniqueProductSlug(tx: Tx, base: string, id: string | null) {
  let slug = slugify(base) || "product";
  for (let i = 2; i < 100; i++) {
    const clash = await tx.select({ id: products.id }).from(products).where(id ? and(eq(products.slug, slug), ne(products.id, id)) : eq(products.slug, slug));
    if (!clash.length) return slug;
    slug = `${slugify(base)}-${i}`;
  }
  return `${slugify(base)}-${Date.now()}`;
}

export async function saveProduct(raw: unknown, staff: Pick<StaffContext, "id" | "email" | "roleLabel">) {
  const input = productSchema.parse(raw);
  return db.transaction(async (tx) => {
    const id = input.id ?? null;
    const [skuClash] = await tx.select({ id: products.id }).from(products).where(id ? and(eq(products.sku, input.sku), ne(products.id, id)) : eq(products.sku, input.sku));
    if (skuClash) throw new UserError("Another product already uses this SKU.", { sku: "SKU already in use" });

    const values = {
      name: input.name,
      slug: await uniqueProductSlug(tx, input.slug || input.name, id),
      sku: input.sku,
      barcode: input.barcode || null,
      brandId: input.brandId || null,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId || null,
      conditionId: input.conditionId,
      shortDescription: input.shortDescription || null,
      description: input.description || null,
      specifications: input.specifications,
      purchasePrice: input.purchasePrice ?? 0,
      price: input.price!,
      discountPrice: input.discountPrice ?? null,
      vatExempt: input.vatExempt,
      minStockLevel: input.minStockLevel,
      warranty: input.warranty || null,
      warrantyMonths: input.warrantyMonths ?? null,
      supplierId: input.supplierId || null,
      weightGrams: input.weightGrams ?? null,
      dimensions: input.dimensions || null,
      status: input.status,
      isFeatured: input.isFeatured,
      isDeal: input.isDeal,
      isNewArrival: input.isNewArrival,
      isBestSeller: input.isBestSeller,
      isClearance: input.isClearance,
      isRecommended: input.isRecommended,
      isTrending: input.isTrending,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      seoKeywords: input.seoKeywords || null,
      updatedAt: new Date(),
    };

    let productId: string;
    if (id) {
      const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
      if (!before) throw new UserError("Product not found.");
      await tx.update(products).set(values).where(eq(products.id, id));
      productId = id;
      const d = diff(before as Record<string, unknown>, values as Record<string, unknown>);
      if (before.price !== values.price || before.discountPrice !== values.discountPrice) {
        await audit({ actor: staff, action: "product.price_changed", module: "Products", description: `Price changed on ${values.name}`, entityType: "product", entityId: id, before: { price: before.price, discountPrice: before.discountPrice }, after: { price: values.price, discountPrice: values.discountPrice } }, tx);
      }
      if (d.changed) await audit({ actor: staff, action: "product.updated", module: "Products", description: `Edited product ${values.name}`, entityType: "product", entityId: id, before: d.before, after: d.after }, tx);
    } else {
      const [created] = await tx.insert(products).values({ ...values, createdBy: staff.id }).returning({ id: products.id });
      productId = created.id;
      await audit({ actor: staff, action: "product.created", module: "Products", description: `Created product ${values.name}`, entityType: "product", entityId: productId, after: { sku: values.sku, price: values.price, status: values.status } }, tx);
    }

    // ── Variants ─────────────────────────────────────────────
    const hasDefault = input.variants.some((v) => v.isDefault);
    const keepIds: string[] = [];
    for (const [i, v] of input.variants.entries()) {
      const [clash] = await tx.select({ id: productVariants.id }).from(productVariants).where(v.id ? and(eq(productVariants.sku, v.sku), ne(productVariants.id, v.id)) : eq(productVariants.sku, v.sku));
      if (clash) throw new UserError(`Variant SKU ${v.sku} is already used by another product.`);
      const vals = {
        productId,
        name: v.name,
        sku: v.sku,
        barcode: v.barcode || null,
        price: v.price ?? null,
        discountPrice: v.discountPrice ?? null,
        attributes: v.attributes,
        image: v.image || null,
        isDefault: hasDefault ? v.isDefault : i === 0,
        isActive: v.isActive,
        sortOrder: i,
        updatedAt: new Date(),
      };
      if (v.id) {
        const res = await tx.update(productVariants).set(vals).where(and(eq(productVariants.id, v.id), eq(productVariants.productId, productId))).returning({ id: productVariants.id });
        if (!res.length) throw new UserError("Variant not found.");
        keepIds.push(v.id);
      } else {
        const [nv] = await tx.insert(productVariants).values(vals).returning({ id: productVariants.id });
        keepIds.push(nv.id);
        await tx.insert(inventory).values({ variantId: nv.id }).onConflictDoNothing();
        if (v.openingStock > 0) {
          await adjustStock(tx, { variantId: nv.id, delta: v.openingStock, type: "purchase", referenceType: "product", referenceId: productId, userId: staff.id, note: "Opening stock" });
        }
      }
    }
    // Removed variants: delete if never sold, otherwise deactivate (keeps order history intact).
    const removed = await tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.productId, productId), keepIds.length ? notInArray(productVariants.id, keepIds) : undefined));
    for (const r of removed) {
      const [sold] = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.variantId, r.id)).limit(1);
      if (sold) await tx.update(productVariants).set({ isActive: false, isDefault: false }).where(eq(productVariants.id, r.id));
      else await tx.delete(productVariants).where(eq(productVariants.id, r.id));
    }

    // ── Videos & image order/alt ──────────────────────────────
    await tx.delete(productVideos).where(eq(productVideos.productId, productId));
    if (input.videos.length) await tx.insert(productVideos).values(input.videos.map((v, i) => ({ productId, url: v.url, title: v.title || null, sortOrder: i })));
    for (const [i, img] of input.imageOrder.entries()) {
      await tx.update(productImages).set({ sortOrder: i, alt: img.alt || null }).where(and(eq(productImages.id, img.id), eq(productImages.productId, productId)));
    }
    return { id: productId, slug: values.slug };
  });
}

/* ───────────── bulk operations (spec §80) ───────────── */

export async function bulkUpdate(ids: string[], op: { kind: "status"; status: "draft" | "active" | "archived" } | { kind: "category"; categoryId: string } | { kind: "price"; percent: number } | { kind: "flag"; flag: "isFeatured" | "isDeal" | "isNewArrival"; value: boolean } | { kind: "delete" }, staff: Pick<StaffContext, "id" | "email" | "roleLabel">) {
  if (!ids.length || ids.length > 500) throw new UserError("Select between 1 and 500 products.");
  return db.transaction(async (tx) => {
    switch (op.kind) {
      case "status":
        await tx.update(products).set({ status: op.status, updatedAt: new Date() }).where(inArray(products.id, ids));
        break;
      case "category": {
        const [c] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, op.categoryId));
        if (!c) throw new UserError("Category not found.");
        await tx.update(products).set({ categoryId: op.categoryId, updatedAt: new Date() }).where(inArray(products.id, ids));
        break;
      }
      case "price": {
        if (!Number.isFinite(op.percent) || op.percent <= -90 || op.percent > 500 || op.percent === 0) throw new UserError("Enter a percentage between -90 and 500.");
        const factor = sql`(1 + ${op.percent}::numeric / 100)`;
        await tx
          .update(products)
          .set({ price: sql`round(${products.price} * ${factor})::bigint`, discountPrice: sql`CASE WHEN ${products.discountPrice} IS NULL THEN NULL ELSE round(${products.discountPrice} * ${factor})::bigint END`, updatedAt: new Date() })
          .where(inArray(products.id, ids));
        await tx
          .update(productVariants)
          .set({ price: sql`CASE WHEN ${productVariants.price} IS NULL THEN NULL ELSE round(${productVariants.price} * ${factor})::bigint END`, discountPrice: sql`CASE WHEN ${productVariants.discountPrice} IS NULL THEN NULL ELSE round(${productVariants.discountPrice} * ${factor})::bigint END` })
          .where(inArray(productVariants.productId, ids));
        break;
      }
      case "flag":
        await tx.update(products).set({ [op.flag]: op.value, updatedAt: new Date() }).where(inArray(products.id, ids));
        break;
      case "delete":
        // Soft delete — keeps order history and reports intact.
        await tx.update(products).set({ deletedAt: new Date(), status: "archived", updatedAt: new Date() }).where(inArray(products.id, ids));
        break;
    }
    await audit({ actor: staff, action: `product.bulk_${op.kind}`, module: "Products", description: `Bulk ${op.kind} on ${ids.length} product(s)`, after: { op, ids } }, tx);
  });
}

/* ───────────── Excel / CSV import (validated before any write) ───────────── */

export const IMPORT_COLUMNS = ["sku", "name", "category", "subcategory", "brand", "condition", "price", "discount_price", "purchase_price", "stock", "short_description", "description", "specifications", "warranty", "featured", "deal", "new_arrival", "best_seller", "status"] as const;

/** Friendly column names for error messages. */
const IMPORT_LABELS: Record<string, string> = { sku: "SKU", name: "Product name", category: "Category", subcategory: "Subcategory", brand: "Brand", condition: "Condition", price: "Price", discount_price: "Discount price", purchase_price: "Cost price", stock: "Stock quantity", short_description: "Short description", description: "Full description", specifications: "Specifications", warranty: "Warranty", featured: "Featured", deal: "Deal", new_arrival: "New arrival", best_seller: "Best seller", status: "Status" };

/** "Yes"/"No" cells. Blank stays undefined so an update never switches a flag off by accident. */
const yesNo = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    if (/^(y|yes|true|1)$/i.test(v)) return true;
    if (/^(n|no|false|0)$/i.test(v)) return false;
    ctx.addIssue({ code: "custom", message: "use Yes or No" });
    return z.NEVER;
  });

/** "Processor: Core i5; RAM: 8GB" → { Processor: "Core i5", RAM: "8GB" } */
export function parseSpecifications(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(/[;\n]+/)) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const key = part.slice(0, i).trim().slice(0, 60);
    const value = part.slice(i + 1).trim().slice(0, 300);
    if (key && value && Object.keys(out).length < 40) out[key] = value;
  }
  return out;
}

const importRow = z.object({
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/, "letters, numbers, . _ - only"),
  name: z.string().trim().min(3).max(200),
  brand: z.string().trim().max(60).optional().default(""),
  category: z.string().trim().min(1, "required"),
  subcategory: z.string().trim().max(80).optional().default(""),
  condition: z.string().trim().min(1, "required"),
  price: naira.refine((v) => v != null && v > 0, "price required"),
  discount_price: naira.nullable().optional(),
  purchase_price: naira.nullable().optional(),
  stock: z.coerce.number().int().min(0).max(100000).optional().default(0),
  short_description: z.string().trim().max(500).optional().default(""),
  description: z.string().trim().max(20000).optional().default(""),
  specifications: z.string().trim().max(4000).optional().default(""),
  warranty: z.string().trim().max(200).optional().default(""),
  featured: yesNo,
  deal: yesNo,
  new_arrival: yesNo,
  best_seller: yesNo,
  // Blank = Active, so an imported product appears in the shop straight away.
  status: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || "active")
    .pipe(z.enum(["draft", "active", "archived"])),
});

export type ImportResult = { ok: boolean; errors: { row: number; message: string }[]; notes: string[]; count: number; created: number; updated: number };

export async function importProducts(rows: Record<string, string>[], staff: Pick<StaffContext, "id" | "email" | "roleLabel">, dryRun: boolean): Promise<ImportResult> {
  if (!rows.length) throw new UserError("The file has no product rows.");
  if (rows.length > 2000) throw new UserError("Import at most 2,000 rows at a time.");
  const [cats, conds, brs] = await Promise.all([db.select().from(categories), db.select().from(productConditions), db.select().from(brands)]);
  const find = <T extends { name: string; slug: string }>(list: T[], v: string) => list.find((x) => x.slug === slugify(v) || x.name.toLowerCase() === v.toLowerCase());
  const errors: { row: number; message: string }[] = [];
  const parsed: (z.infer<typeof importRow> & { categoryId: string; subcategoryId: string | null; conditionId: string; brandKey: string | null; specs: Record<string, string> })[] = [];
  const newBrands = new Map<string, string>(); // slug → name as typed
  rows.forEach((r, i) => {
    const row = Number(r.__row) || i + 2;
    const res = importRow.safeParse(r);
    const fail = (message: string) => {
      errors.push({ row, message });
      return undefined;
    };
    if (!res.success) {
      fail(res.error.issues.map((x) => `${IMPORT_LABELS[String(x.path[0])] ?? x.path.join(".")}: ${x.message}`).join("; "));
      // Still report an unknown category/condition, so one check shows everything wrong with the row.
      if (r.category?.trim() && !find(cats, r.category.trim())) fail(`Unknown category “${r.category.trim()}” — choose one from the dropdown`);
      if (r.condition?.trim() && !find(conds, r.condition.trim())) fail(`Unknown condition “${r.condition.trim()}” — choose one from the dropdown`);
      return;
    }
    const d = res.data;
    const cat = find(cats.filter((c) => !c.parentId), d.category) ?? find(cats, d.category) ?? fail(`Unknown category “${d.category}” — choose one from the dropdown`);
    const cond = find(conds, d.condition) ?? fail(`Unknown condition “${d.condition}” — choose one from the dropdown`);
    let subcategoryId: string | null = null;
    let ok = Boolean(cat && cond);
    if (d.subcategory && cat) {
      const sub = find(cats.filter((c) => c.parentId === cat.id), d.subcategory) ?? fail(`“${d.subcategory}” is not a subcategory of ${cat.name}`);
      if (sub) subcategoryId = sub.id;
      else ok = false;
    }
    if (d.discount_price != null && d.discount_price > d.price!) {
      fail("Discount price is above the price");
      ok = false;
    }
    let brandKey: string | null = null;
    if (d.brand) {
      const existing = find(brs, d.brand);
      brandKey = existing?.slug ?? (slugify(d.brand) || null);
      if (!brandKey) {
        fail(`Brand “${d.brand}” is not a usable name`);
        ok = false;
      } else if (!existing && !newBrands.has(brandKey)) newBrands.set(brandKey, d.brand);
    }
    if (ok && cat && cond) parsed.push({ ...d, categoryId: cat.id, subcategoryId, conditionId: cond.id, brandKey, specs: parseSpecifications(d.specifications) });
  });
  const dupes = parsed.map((p) => p.sku.toUpperCase()).filter((s, i, a) => a.indexOf(s) !== i);
  if (dupes.length) errors.push({ row: 0, message: `The same SKU appears more than once in the file: ${[...new Set(dupes)].join(", ")}` });
  const notes = newBrands.size ? [`${newBrands.size} new brand(s) will be created: ${[...newBrands.values()].join(", ")}`] : [];
  if (errors.length || dryRun) return { ok: errors.length === 0, errors, notes, count: parsed.length, created: 0, updated: 0 };

  let created = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    const brandIds = new Map(brs.map((b) => [b.slug, b.id]));
    for (const [slug, name] of newBrands) {
      const [b] = await tx.insert(brands).values({ name, slug }).onConflictDoUpdate({ target: brands.slug, set: { slug } }).returning({ id: brands.id });
      brandIds.set(slug, b.id);
    }
    for (const p of parsed) {
      const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.sku, p.sku));
      const flags = { isFeatured: p.featured, isDeal: p.deal, isNewArrival: p.new_arrival, isBestSeller: p.best_seller };
      const base = {
        name: p.name,
        brandId: p.brandKey ? (brandIds.get(p.brandKey) ?? null) : null,
        categoryId: p.categoryId,
        subcategoryId: p.subcategoryId,
        conditionId: p.conditionId,
        price: p.price!,
        discountPrice: p.discount_price ?? null,
        purchasePrice: p.purchase_price ?? 0,
        shortDescription: p.short_description || null,
        description: p.description || null,
        warranty: p.warranty || null,
        status: p.status,
        updatedAt: new Date(),
      };
      if (existing) {
        // Blank cells never wipe specifications or switch flags off on an existing product.
        const keep = Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== undefined));
        await tx
          .update(products)
          .set({ ...base, ...keep, ...(Object.keys(p.specs).length ? { specifications: p.specs } : {}) })
          .where(eq(products.id, existing.id));
        updated++;
      } else {
        const [np] = await tx
          .insert(products)
          .values({
            ...base,
            specifications: p.specs,
            isFeatured: p.featured ?? false,
            isDeal: p.deal ?? false,
            isNewArrival: p.new_arrival ?? false,
            isBestSeller: p.best_seller ?? false,
            sku: p.sku,
            slug: await uniqueProductSlug(tx, p.name, null),
            createdBy: staff.id,
          })
          .returning({ id: products.id });
        const [v] = await tx.insert(productVariants).values({ productId: np.id, sku: `${p.sku}-STD`, isDefault: true }).returning({ id: productVariants.id });
        await tx.insert(inventory).values({ variantId: v.id });
        if (p.stock > 0) await adjustStock(tx, { variantId: v.id, delta: p.stock, type: "purchase", referenceType: "import", referenceId: np.id, userId: staff.id, note: "Import opening stock" });
        created++;
      }
    }
    await audit({ actor: staff, action: "product.imported", module: "Products", description: `Product import: ${created} created, ${updated} updated${newBrands.size ? `, ${newBrands.size} brand(s) added` : ""}` }, tx);
  });
  return { ok: true, errors: [], notes: [], count: parsed.length, created, updated };
}
