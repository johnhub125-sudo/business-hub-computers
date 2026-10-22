import "server-only";
import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { BRAND_DEFAULTS } from "@/lib/brand";
import { nairaToKobo } from "@/lib/money";
import { slugify } from "@/lib/utils";
import { audit, diff } from "../audit";
import { db, type Tx } from "../db";
import { brands, categories, inventory, orderItems, productConditions, productImages, productVariants, productVideos, products, cartItems, wishlistItems, productSerials } from "../db/schema";
import { UserError } from "../errors";
import type { StaffContext } from "../session";
import { adjustStock } from "./inventory";
import { bestMatch, conditionFor, KIND_CATEGORY_HINTS, lenientAmount, lenientCount, lenientStatus, lenientYesNo, norm, parseSerials, parseSpecifications, tidyName } from "./import-tidy";
import { productKind } from "@/lib/product-kind";
import { templateById } from "@/lib/product-templates";

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
    fulfilment: z.enum(["stock", "dropship"]).default("stock"),
    dropshipPartner: z.string().trim().max(120).optional().nullable(),
    dropshipLeadDays: z.coerce.number().int().min(0).max(120).optional().nullable(),
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
    if (p.fulfilment === "dropship" && !p.dropshipPartner) ctx.addIssue({ code: "custom", path: ["dropshipPartner"], message: "Enter the partner company that supplies this product" });
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
      fulfilment: input.fulfilment,
      dropshipPartner: input.fulfilment === "dropship" ? input.dropshipPartner || null : null,
      dropshipLeadDays: input.fulfilment === "dropship" ? (input.dropshipLeadDays ?? null) : null,
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
      await removeDemoProducts(tx, staff);
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

/* ───────────── placeholder catalogue ───────────── */

/**
 * The demo products that ship with a new store are placeholders. As soon as staff add a real product
 * (form or import) the untouched placeholders are removed: taken out of the shop, carts and
 * wishlists, with their stock zeroed in the ledger. A placeholder that staff have edited is treated as
 * adopted and is kept. They are soft-deleted, so order history and reports stay intact.
 */
export async function removeDemoProducts(tx: Tx, staff: Pick<StaffContext, "id" | "email" | "roleLabel">): Promise<number> {
  const demo = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(isNull(products.createdBy), isNull(products.deletedAt), sql`${products.updatedAt} = ${products.createdAt}`));
  if (!demo.length) return 0;
  const ids = demo.map((d) => d.id);
  const variants = await tx.select({ id: productVariants.id, onHand: inventory.onHand, reserved: inventory.reserved }).from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id)).where(inArray(productVariants.productId, ids));
  for (const v of variants) {
    const spare = (v.onHand ?? 0) - (v.reserved ?? 0);
    if (spare > 0) await adjustStock(tx, { variantId: v.id, delta: -spare, type: "correction", referenceType: "product", referenceId: "demo-cleanup", userId: staff.id, note: "Placeholder product removed" });
  }
  if (variants.length) await tx.delete(cartItems).where(inArray(cartItems.variantId, variants.map((v) => v.id)));
  await tx.delete(wishlistItems).where(inArray(wishlistItems.productId, ids));
  await tx.update(products).set({ deletedAt: new Date(), status: "archived", isFeatured: false, isDeal: false, updatedAt: new Date() }).where(inArray(products.id, ids));
  await audit({ actor: staff, action: "product.demo_removed", module: "Products", description: `Removed ${ids.length} placeholder product(s) now that real products exist` }, tx);
  return ids.length;
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

export const IMPORT_COLUMNS = ["sku", "name", "category", "subcategory", "brand", "condition", "price", "discount_price", "purchase_price", "stock", "serial_numbers", "short_description", "description", "specifications", "warranty", "featured", "deal", "new_arrival", "best_seller", "status", "dropship_partner", "dropship_days"] as const;

/** Friendly column names for error messages. */
const IMPORT_LABELS: Record<string, string> = { sku: "SKU", name: "Product name", category: "Category", subcategory: "Subcategory", brand: "Brand", condition: "Condition", price: "Price", discount_price: "Discount price", purchase_price: "Cost price", stock: "Stock quantity", serial_numbers: "Serial numbers", dropship_partner: "Dropship partner", dropship_days: "Dropship delivery days", short_description: "Short description", description: "Full description", specifications: "Specifications", warranty: "Warranty", featured: "Featured", deal: "Deal", new_arrival: "New arrival", best_seller: "Best seller", status: "Status" };

export { parseSerials, parseSpecifications } from "./import-tidy";

/** A row after tidying: every value is already usable, so no row is refused for how it was typed. */
type CleanRow = {
  row: number;
  sku: string;
  name: string;
  brand: string;
  categoryId: string; // an existing id, or "new:<slug>" for a category this import creates
  subcategoryId: string | null;
  conditionId: string;
  price: number; // kobo
  discount_price: number | null;
  purchase_price: number | null;
  stock: number | undefined;
  serials: string[];
  dropship_partner: string;
  dropship_days: number | undefined;
  short_description: string;
  description: string;
  specs: Record<string, string>;
  warranty: string;
  featured: boolean | undefined;
  deal: boolean | undefined;
  new_arrival: boolean | undefined;
  best_seller: boolean | undefined;
  status: "active" | "draft" | "archived";
  brandKey: string | null;
};

/** "Power Station" → "POW" */
const categoryCode = (name: string) => (name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "GEN").toUpperCase();

/**
 * `errors` lists rows that could not be imported at all (only rows without a product name);
 * `notes` explains every automatic correction. `ok` is false only when nothing can be imported.
 */
export type ImportResult = { ok: boolean; errors: { row: number; message: string }[]; notes: string[]; count: number; created: number; updated: number };

const MAX_IMPORT_ROWS = 2000;
const clip = (s: string | undefined, n: number) => (s ?? "").replace(/\s+$/g, "").trim().slice(0, n);

/**
 * `blankStockAsOne`: a product with neither a Stock quantity nor serial numbers gets 1 in stock
 * (only where the shop has none), instead of showing "Out of stock". Staff choose this on upload.
 */
export async function importProducts(input: Record<string, string>[], staff: Pick<StaffContext, "id" | "email" | "roleLabel">, dryRun: boolean, opts: { blankStockAsOne?: boolean } = {}): Promise<ImportResult> {
  if (!input.length) throw new UserError("The file has no product rows. Put one product on each row under the headings.");
  const rows = input.slice(0, MAX_IMPORT_ROWS);
  const [cats, conds, brs] = await Promise.all([db.select().from(categories), db.select().from(productConditions).orderBy(asc(productConditions.sortOrder)), db.select().from(brands)]);
  const errors: { row: number; message: string }[] = [];
  const fixes: string[] = []; // "Row 4: …" — what was corrected automatically
  const fix = (row: number, message: string) => fixes.push(`Row ${row}: ${message}`);
  const topCats = cats.filter((c) => !c.parentId);
  const newCategories = new Map<string, string>(); // slug → name
  const newCategoryIcons = new Map<string, string>(); // slug → icon, for department templates
  // Subcategories created by this import: key "<parent id or new:slug>|<slug>".
  const newSubcategories = new Map<string, { name: string; parent: string; slug: string }>();
  const subSlugTaken = (slug: string) => cats.some((c) => c.slug === slug) || [...newCategories.keys()].includes(slug) || [...newSubcategories.values()].some((x) => x.slug === slug);
  const addSubcategory = (parent: string, parentSlug: string, name: string) => {
    let slug = slugify(name);
    if (!slug) return null;
    const key = `${parent}|${slug}`;
    if (!newSubcategories.has(key)) {
      if (subSlugTaken(slug)) slug = `${parentSlug}-${slug}`;
      newSubcategories.set(key, { name: tidyName(name).slice(0, 80), parent, slug });
    }
    return `newsub:${key}`;
  };
  const parentSlugOf = (id: string) => (id.startsWith("new:") ? id.slice(4) : (cats.find((c) => c.id === id)?.slug ?? "cat"));

  // Department templates fix the category (and, for computers, the condition) of every row.
  const templateCategory = new Map<string, string>(); // template id → category name to use
  for (const id of new Set(rows.map((r) => r.__template).filter(Boolean))) {
    const t = templateById(id);
    if (!t) continue;
    const existing = topCats.find((c) => c.slug === t.category.slug) ?? topCats.find((c) => t.category.match.test(c.name));
    templateCategory.set(id, existing?.name ?? t.category.name);
    if (!existing) {
      newCategories.set(t.category.slug, t.category.name);
      newCategoryIcons.set(t.category.slug, t.category.icon);
    }
  }
  const newBrands = new Map<string, string>(); // slug → name as typed
  const defaultCondition = conditionFor(conds, "brand new") ?? conds[0];
  if (!defaultCondition) throw new UserError("Add at least one product condition (Settings → Catalogue) before importing.");

  /** Category for a row: typed name (typos forgiven), a subcategory's parent, a guess from the product name, or a new category. */
  const placeCategory = (row: number, typed: string, typedSub: string, name: string): { categoryId: string; subcategoryId: string | null; label: string } => {
    if (typed) {
      const top = bestMatch(topCats, typed);
      if (top) {
        if (norm(top.name) !== norm(typed)) fix(row, `category “${typed}” read as “${top.name}”`);
        return { categoryId: top.id, subcategoryId: null, label: top.name };
      }
      const sub = bestMatch(cats.filter((c) => c.parentId), typed);
      if (sub) {
        const parent = topCats.find((c) => c.id === sub.parentId)!;
        fix(row, `“${typed}” is a subcategory — placed under ${parent.name} › ${sub.name}`);
        return { categoryId: parent.id, subcategoryId: sub.id, label: parent.name };
      }
      const name2 = tidyName(typed).slice(0, 80);
      const slug = slugify(name2);
      const hintFor = KIND_CATEGORY_HINTS[productKind({ name })];
      const home = hintFor && productKind({ name }) !== "accessory" ? topCats.find((c) => hintFor.test(c.name.toLowerCase())) : undefined;
      if (slug && home) {
        const sub = addSubcategory(home.id, home.slug, name2);
        fix(row, `“${typed}” placed under ${home.name} › ${name2}`);
        return { categoryId: home.id, subcategoryId: sub, label: home.name };
      }
      if (slug) {
        if (!newCategories.has(slug)) newCategories.set(slug, name2);
        return { categoryId: `new:${slug}`, subcategoryId: null, label: name2 };
      }
    }
    if (typedSub) {
      const sub = bestMatch(cats.filter((c) => c.parentId), typedSub);
      if (sub) {
        const parent = topCats.find((c) => c.id === sub.parentId)!;
        fix(row, `no category given — placed under ${parent.name} (from subcategory ${sub.name})`);
        return { categoryId: parent.id, subcategoryId: sub.id, label: parent.name };
      }
    }
    const hint = KIND_CATEGORY_HINTS[productKind({ name })];
    const guess = hint && topCats.find((c) => hint.test(c.name.toLowerCase()));
    if (guess) {
      fix(row, `no category given — placed under ${guess.name}`);
      return { categoryId: guess.id, subcategoryId: null, label: guess.name };
    }
    const others = topCats.find((c) => /^others?$|^general$|^miscellaneous$/i.test(c.name));
    fix(row, `no category given — placed under ${others?.name ?? "Others"}`);
    if (others) return { categoryId: others.id, subcategoryId: null, label: others.name };
    newCategories.set("others", "Others");
    return { categoryId: "new:others", subcategoryId: null, label: "Others" };
  };

  /** Department template rows always go to the template's category, never to a guess. */
  const templatePlace = (t: NonNullable<ReturnType<typeof templateById>>) => {
    const catName = templateCategory.get(t.id) ?? t.category.name;
    const existing = topCats.find((c) => c.name === catName);
    return existing ? { categoryId: existing.id, subcategoryId: null, label: existing.name } : { categoryId: `new:${t.category.slug}`, subcategoryId: null, label: t.category.name };
  };

  const clean: CleanRow[] = [];
  rows.forEach((r, i) => {
    const row = Number(r.__row) || i + 2;
    const name = clip(r.name, 200).replace(/\s+/g, " ");
    if (!name) {
      // A row with details but no name cannot become a product.
      if (Object.keys(r).some((k) => k !== "__row" && r[k]?.trim())) errors.push({ row, message: "skipped — no product name" });
      return;
    }
    // A row with only a name ("BRAND NEW", "MONITORS") is a section heading people put in their sheet, not a product.
    const details = ["sku", "category", "subcategory", "brand", "condition", "price", "discount_price", "purchase_price", "stock", "serial_numbers", "short_description", "description", "specifications", "warranty", "dropship_partner"];
    if (!details.some((k) => r[k]?.trim())) {
      errors.push({ row, message: `skipped — “${name}” looks like a section heading (no price or details)` });
      return;
    }
    if ((r.name ?? "").trim().length > 200) fix(row, "product name shortened to 200 characters");

    const tpl = r.__template ? templateById(r.__template) : undefined;
    const place = tpl ? templatePlace(tpl) :placeCategory(row, clip(r.category, 80), clip(r.subcategory, 80), name);
    let subcategoryId = place.subcategoryId;
    if (r.subcategory?.trim() && !subcategoryId) {
      const sub = place.categoryId.startsWith("new:") ? undefined : bestMatch(cats.filter((c) => c.parentId === place.categoryId), r.subcategory);
      const offered = tpl && bestMatch(tpl.subcategories.map((n) => ({ name: n, slug: slugify(n) })), r.subcategory);
      if (sub) subcategoryId = sub.id;
      else if (offered) subcategoryId = addSubcategory(place.categoryId, parentSlugOf(place.categoryId), offered.name);
      else fix(row, `subcategory “${r.subcategory.trim()}” is not under ${place.label} — left out`);
    }

    let cond = tpl?.condition ? conditionFor(conds, tpl.condition) : r.condition?.trim() ? conditionFor(conds, r.condition) : undefined;
    if (!cond) {
      if (r.condition?.trim()) fix(row, `condition “${r.condition.trim()}” not recognised — set to ${defaultCondition.name}`);
      cond = defaultCondition;
    } else if (!tpl?.condition && norm(cond.name) !== norm(r.condition ?? "")) fix(row, `condition “${r.condition!.trim()}” read as ${cond.name}`);

    let status = lenientStatus(r.status);
    let price = lenientAmount(r.price);
    if (!price) {
      fix(row, r.price?.trim() ? `price “${r.price.trim()}” not readable — saved as Draft (hidden) until a price is added` : "no price — saved as Draft (hidden) until a price is added");
      price = 0;
      status = "draft";
    }
    let discount = lenientAmount(r.discount_price);
    if (r.discount_price?.trim() && discount == null) fix(row, `discount “${r.discount_price.trim()}” not readable — left out`);
    if (discount != null && price > 0) {
      if (discount > price) {
        fix(row, "discount price was higher than the price — the two were swapped");
        [price, discount] = [discount, price];
      } else if (discount === price || discount === 0) discount = null;
    } else if (price === 0) discount = null;
    const purchase = lenientAmount(r.purchase_price);
    if (r.purchase_price?.trim() && purchase == null) fix(row, `cost price “${r.purchase_price.trim()}” not readable — left out`);

    let stock = r.stock?.trim() ? (lenientCount(r.stock) ?? undefined) : undefined;
    if (r.stock?.trim() && stock === undefined) fix(row, `stock “${r.stock.trim()}” not readable — stock left unchanged`);
    if (stock !== undefined && stock > 100000) {
      fix(row, `stock ${stock} looks wrong — stock left unchanged`);
      stock = undefined;
    }

    const typedSerials = parseSerials(r.serial_numbers ?? "");
    const serials = [...new Set(typedSerials)];
    if (serials.length < typedSerials.length) fix(row, `${typedSerials.length - serials.length} repeated serial number(s) counted once`);
    if (serials.length && stock !== undefined && stock !== serials.length) fix(row, `stock ${stock} replaced by the ${serials.length} serial numbers`);
    if (serials.length) stock = undefined;

    const yes = (k: string) => {
      const v = lenientYesNo(r[k]);
      if (r[k]?.trim() && v === undefined) fix(row, `“${r[k].trim()}” in ${IMPORT_LABELS[k]} not understood — left as it was`);
      return v;
    };

    let brandKey: string | null = null;
    const brandTyped = clip(r.brand, 60);
    if (brandTyped) {
      const existing = bestMatch(brs, brandTyped, 0.85);
      brandKey = existing?.slug ?? (slugify(brandTyped) || null);
      if (brandKey && !existing && !newBrands.has(brandKey)) newBrands.set(brandKey, tidyName(brandTyped));
    }

    const days = r.dropship_days?.trim() ? lenientCount(r.dropship_days) : null;
    clean.push({
      row,
      sku: clip(r.sku, 64).toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9._-]/g, ""),
      name,
      brand: brandTyped,
      categoryId: place.categoryId,
      subcategoryId,
      conditionId: cond.id,
      price: Math.round(price * 100),
      discount_price: discount != null ? Math.round(discount * 100) : null,
      purchase_price: purchase != null ? Math.round(purchase * 100) : null,
      stock,
      serials,
      dropship_partner: clip(r.dropship_partner, 120),
      dropship_days: days != null && days <= 365 ? days : undefined,
      short_description: clip(r.short_description, 500),
      description: clip(r.description, 20000),
      specs: parseSpecifications(clip(r.specifications, 4000)),
      warranty: clip(r.warranty, 200),
      featured: yes("featured"),
      deal: yes("deal"),
      new_arrival: yes("new_arrival"),
      best_seller: yes("best_seller"),
      status,
      brandKey,
    });
  });

  // The same product on several rows (same SKU, or same name and condition) is combined into one.
  const nameKey = (name: string, conditionId: string) => `${name.trim().toLowerCase()}|${conditionId}`;
  const keyOf = (p: CleanRow) => (p.sku ? `sku:${p.sku}` : `name:${nameKey(p.name, p.conditionId)}`);
  const merged = new Map<string, CleanRow>();
  for (const p of clean) {
    const k = keyOf(p);
    const first = merged.get(k);
    if (!first) {
      merged.set(k, p);
      continue;
    }
    fix(p.row, `same product as row ${first.row} — combined into one`);
    const stock = first.stock !== undefined || p.stock !== undefined ? (first.stock ?? 0) + (p.stock ?? 0) : undefined;
    const serials = [...new Set([...first.serials, ...p.serials])];
    const filled = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== "" && v !== null && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)));
    merged.set(k, { ...first, ...filled, row: first.row, stock: serials.length ? undefined : stock, serials, price: p.price || first.price, status: p.price ? p.status : first.status } as CleanRow);
  }
  // A serial number belongs to one unit: if it appears on two products, the first keeps it.
  const owner = new Map<string, number>();
  for (const p of merged.values()) {
    const kept = p.serials.filter((s) => !owner.has(s));
    if (kept.length < p.serials.length) fix(p.row, `${p.serials.length - kept.length} serial number(s) already used on another row were left out`);
    for (const s of kept) owner.set(s, p.row);
    p.serials = kept;
  }
  const parsed = [...merged.values()];

  const notes: string[] = [];
  if (input.length > MAX_IMPORT_ROWS) notes.push(`Only the first ${MAX_IMPORT_ROWS.toLocaleString()} rows were read — import the rest in a second file.`);
  if (newSubcategories.size) notes.push(`New subcategor${newSubcategories.size === 1 ? "y" : "ies"} ${dryRun ? "will be" : "were"} created: ${[...newSubcategories.values()].map((x) => x.name).join(", ")}.`);
  if (newCategories.size) notes.push(`New categor${newCategories.size === 1 ? "y" : "ies"} ${dryRun ? "will be" : "were"} created: ${[...newCategories.values()].join(", ")}.`);
  if (newBrands.size) notes.push(`${newBrands.size} new brand(s) ${dryRun ? "will be" : "were"} created: ${[...newBrands.values()].join(", ")}.`);
  const withSerials = parsed.filter((p) => p.serials.length);
  if (withSerials.length) notes.push(`${withSerials.reduce((n, p) => n + p.serials.length, 0)} serial number(s) on ${withSerials.length} product(s) counted as stock.`);
  // Never let products go "Out of stock" silently because nobody entered a quantity.
  const noQuantity = parsed.filter((p) => p.stock === undefined && !p.serials.length && !p.dropship_partner);
  const fillBlank = (p: (typeof parsed)[number]) => Boolean(opts.blankStockAsOne) && noQuantity.includes(p);
  if (noQuantity.length) {
    const list = noQuantity.slice(0, 8).map((p) => `row ${p.row} ${p.name.slice(0, 40)}`).join("; ") + (noQuantity.length > 8 ? `; …and ${noQuantity.length - 8} more` : "");
    if (opts.blankStockAsOne) notes.unshift(`${noQuantity.length} product(s) had no Stock quantity or serial numbers — ${dryRun ? "they will get" : "they got"} 1 in stock (only where the shop had none). Update the real quantity later.`);
    else notes.unshift(`⚠ ${noQuantity.length} product(s) have no Stock quantity and no Serial numbers, so customers will see them as “Out of stock”: ${list}. Fill Stock quantity or Serial numbers, or tick “Put 1 in stock where the quantity is blank”.`);
  }
  if (fixes.length) notes.push(`${fixes.length} correction(s) made automatically:`, ...fixes.slice(0, 200), ...(fixes.length > 200 ? [`…and ${fixes.length - 200} more.`] : []));
  if (!parsed.length) return { ok: false, errors: errors.length ? errors : [{ row: 0, message: "No products found. Put the product name in a column headed “Product name”." }], notes, count: 0, created: 0, updated: 0 };
  if (dryRun) return { ok: true, errors, notes, count: parsed.length, created: 0, updated: 0 };

  let created = 0;
  let updated = 0;
  let stockSet = 0;
  let serialsAdded = 0;
  let demoRemoved = 0;
  await db.transaction(async (tx) => {
    const brandIds = new Map(brs.map((b) => [b.slug, b.id]));
    for (const [slug, name] of newBrands) {
      const [b] = await tx.insert(brands).values({ name, slug }).onConflictDoUpdate({ target: brands.slug, set: { slug } }).returning({ id: brands.id });
      brandIds.set(slug, b.id);
    }
    // Categories typed in the file that the shop did not have yet.
    const newCatIds = new Map<string, string>();
    for (const [slug, name] of newCategories) {
      const [c] = await tx.insert(categories).values({ name, slug, icon: newCategoryIcons.get(slug) ?? null }).onConflictDoUpdate({ target: categories.slug, set: { slug } }).returning({ id: categories.id });
      newCatIds.set(slug, c.id);
    }
    const catId = (id: string) => (id.startsWith("new:") ? newCatIds.get(id.slice(4))! : id);
    const newSubIds = new Map<string, string>();
    for (const [key, sub] of newSubcategories) {
      const [c] = await tx.insert(categories).values({ name: sub.name, slug: sub.slug, parentId: catId(sub.parent) }).onConflictDoUpdate({ target: categories.slug, set: { slug: sub.slug } }).returning({ id: categories.id });
      newSubIds.set(`newsub:${key}`, c.id);
    }
    const subId = (id: string | null) => (id?.startsWith("newsub:") ? newSubIds.get(id)! : id);
    const current = await tx.select({ id: products.id, sku: products.sku, name: products.name, conditionId: products.conditionId, deletedAt: products.deletedAt }).from(products);
    const bySku = new Map(current.map((c) => [c.sku.toUpperCase(), c]));
    const byName = new Map(current.filter((c) => !c.deletedAt).map((c) => [nameKey(c.name, c.conditionId), c]));
    // Next free number for generated SKUs, continuing from the highest one in use.
    const prefix = BRAND_DEFAULTS.company.shortName.toUpperCase();
    const generated = new RegExp(`^${prefix}-[A-Z]+-(\\d+)$`);
    let nextNumber = Math.max(0, ...current.map((c) => Number(generated.exec(c.sku.toUpperCase())?.[1] ?? 0))) + 1;
    const newSku = (categoryId: string) => {
      const top = cats.find((c) => c.id === categoryId) ?? { name: newCategories.get(categoryId.slice(4)) ?? "" };
      for (;;) {
        const sku = `${prefix}-${categoryCode(top?.name ?? "")}-${String(nextNumber++).padStart(4, "0")}`;
        if (!bySku.has(sku)) return sku;
      }
    };
    for (const p of parsed) {
      const existing = (p.sku ? bySku.get(p.sku.toUpperCase()) : undefined) ?? byName.get(nameKey(p.name, p.conditionId));
      const sku = existing?.sku ?? (p.sku || newSku(p.categoryId));
      bySku.set(sku.toUpperCase(), existing ?? { id: "", sku, name: p.name, conditionId: p.conditionId, deletedAt: null });
      const flags = { isFeatured: p.featured, isDeal: p.deal, isNewArrival: p.new_arrival, isBestSeller: p.best_seller };
      const base = {
        name: p.name,
        brandId: p.brandKey ? (brandIds.get(p.brandKey) ?? null) : null,
        categoryId: catId(p.categoryId),
        subcategoryId: subId(p.subcategoryId),
        conditionId: p.conditionId,
        price: p.price,
        discountPrice: p.discount_price ?? null,
        purchasePrice: p.purchase_price ?? 0,
        shortDescription: p.short_description || null,
        description: p.description || null,
        warranty: p.warranty || null,
        status: p.status,
        ...(p.dropship_partner ? { fulfilment: "dropship", dropshipPartner: p.dropship_partner, dropshipLeadDays: p.dropship_days ?? null } : {}),
        updatedAt: new Date(),
      };
      if (existing) {
        // Blank cells never wipe details, prices or flags of an existing product.
        const keep = Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== undefined));
        if (!p.brandKey) delete (base as Partial<typeof base>).brandId;
        if (!p.subcategoryId) delete (base as Partial<typeof base>).subcategoryId;
        if (!p.short_description) delete (base as Partial<typeof base>).shortDescription;
        if (!p.description) delete (base as Partial<typeof base>).description;
        if (!p.warranty) delete (base as Partial<typeof base>).warranty;
        if (p.purchase_price == null) delete (base as Partial<typeof base>).purchasePrice;
        if (!p.price) for (const k of ["price", "discountPrice", "status"] as const) delete (base as Partial<typeof base>)[k];
        await tx
          .update(products)
          .set({ ...base, ...keep, ...(Object.keys(p.specs).length ? { specifications: p.specs } : {}) })
          .where(eq(products.id, existing.id));
        // Keep stock in step with the sheet: a number in "Stock quantity" becomes the new stock on hand.
        if (p.serials.length && existing.id) {
          // Serial numbers add units: each serial not yet recorded for this product is one more in stock.
          const variants = await tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.productId, existing.id), eq(productVariants.isActive, true)));
          if (variants.length === 1) {
            const added = await tx.insert(productSerials).values(p.serials.map((serial) => ({ productId: existing.id, serial }))).onConflictDoNothing().returning({ id: productSerials.id });
            if (added.length) {
              await adjustStock(tx, { variantId: variants[0].id, delta: added.length, type: "purchase", referenceType: "import", referenceId: existing.id, userId: staff.id, note: `${added.length} serial number(s) added by product import` });
              serialsAdded += added.length;
              stockSet++;
            }
            if (added.length < p.serials.length) notes.push(`${p.name}: ${p.serials.length - added.length} serial number(s) were already recorded and were not counted again.`);
          } else if (variants.length > 1) {
            notes.push(`${p.name}: has several variants, so its serial numbers were not added.`);
          }
        } else if ((p.stock !== undefined || fillBlank(p)) && existing.id) {
          const variants = await tx.select({ id: productVariants.id, onHand: inventory.onHand }).from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id)).where(and(eq(productVariants.productId, existing.id), eq(productVariants.isActive, true)));
          if (variants.length === 1) {
            // A blank quantity only fills a product that has none; it never lowers real stock.
            const target = p.stock ?? Math.max(1, variants[0].onHand ?? 0);
            const delta = target - (variants[0].onHand ?? 0);
            if (delta !== 0) {
              try {
                await tx.transaction((sp) => adjustStock(sp, { variantId: variants[0].id, delta, type: "correction", referenceType: "import", referenceId: existing.id, userId: staff.id, note: "Stock set by product import" }));
                stockSet++;
              } catch {
                notes.push(`${p.name}: stock was not changed because ${target} is below the units already reserved for orders.`);
              }
            }
          } else if (variants.length > 1) {
            notes.push(`${p.name}: has several variants, so its stock was not changed. Set stock per variant under Inventory.`);
          }
        }
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
            sku,
            slug: await uniqueProductSlug(tx, p.name, null),
            createdBy: staff.id,
          })
          .returning({ id: products.id });
        const [v] = await tx.insert(productVariants).values({ productId: np.id, sku: `${sku}-STD`, isDefault: true }).returning({ id: productVariants.id });
        await tx.insert(inventory).values({ variantId: v.id });
        if (p.serials.length) {
          await tx.insert(productSerials).values(p.serials.map((serial) => ({ productId: np.id, serial })));
          serialsAdded += p.serials.length;
        }
        const opening = p.serials.length || p.stock || (fillBlank(p) ? 1 : 0);
        if (opening > 0) await adjustStock(tx, { variantId: v.id, delta: opening, type: "purchase", referenceType: "import", referenceId: np.id, userId: staff.id, note: "Import opening stock" });
        created++;
      }
    }
    // The first real products replace the placeholder catalogue.
    if (created > 0) demoRemoved = await removeDemoProducts(tx, staff);
    await audit({ actor: staff, action: "product.imported", module: "Products", description: `Product import: ${created} created, ${updated} updated${stockSet ? `, stock set on ${stockSet}` : ""}${newBrands.size ? `, ${newBrands.size} brand(s) added` : ""}` }, tx);
  });
  if (serialsAdded) notes.unshift(`${serialsAdded} serial number(s) recorded and counted as stock.`);
  if (stockSet) notes.unshift(`Stock updated on ${stockSet} existing product(s).`);
  if (demoRemoved) notes.unshift(`${demoRemoved} placeholder product(s) were removed — the shop now shows only your own products.`);
  return { ok: true, errors: [], notes, count: parsed.length, created, updated };
}
