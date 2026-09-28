import "server-only";
import { asc, eq } from "drizzle-orm";
import type { ProductForm } from "@/components/admin/product-editor";
import { koboToNairaString } from "@/lib/money";
import { db } from "@/server/db";
import { brands, categories, inventory, productConditions, productImages, productVariants, productVideos, products, suppliers } from "@/server/db/schema";

const n = (k: number | null | undefined) => (k == null ? "" : koboToNairaString(k).replace(/\.00$/, ""));

export async function editorOptions() {
  const [b, c, co, s] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories).orderBy(asc(categories.sortOrder)),
    db.select({ id: productConditions.id, name: productConditions.name }).from(productConditions).orderBy(asc(productConditions.sortOrder)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
  ]);
  return { brands: b, categories: c, conditions: co, suppliers: s };
}

export function emptyProduct(): ProductForm {
  return {
    id: null,
    name: "",
    slug: "",
    sku: `BHC-${Date.now().toString(36).toUpperCase()}`,
    barcode: "",
    brandId: "",
    categoryId: "",
    subcategoryId: "",
    conditionId: "",
    shortDescription: "",
    description: "",
    specs: [["Processor", ""], ["RAM", ""], ["Storage", ""], ["Screen", ""]],
    purchasePrice: "",
    price: "",
    discountPrice: "",
    vatExempt: false,
    minStockLevel: "2",
    warranty: "",
    warrantyMonths: "",
    supplierId: "",
    weightGrams: "",
    dimensions: "",
    status: "draft",
    flags: { isFeatured: false, isDeal: false, isNewArrival: true, isBestSeller: false, isClearance: false, isRecommended: false, isTrending: false },
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    variants: [{ id: null, name: "Default", sku: "", barcode: "", price: "", discountPrice: "", attributes: [], image: "", isDefault: true, isActive: true, openingStock: "0" }],
    videos: [],
    images: [],
  };
}

export async function productForm(id: string): Promise<ProductForm | null> {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) return null;
  const [variants, images, videos] = await Promise.all([
    db
      .select({ v: productVariants, onHand: inventory.onHand })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.sortOrder)),
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder)),
    db.select().from(productVideos).where(eq(productVideos.productId, id)).orderBy(asc(productVideos.sortOrder)),
  ]);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    barcode: p.barcode ?? "",
    brandId: p.brandId ?? "",
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId ?? "",
    conditionId: p.conditionId,
    shortDescription: p.shortDescription ?? "",
    description: p.description ?? "",
    specs: Object.entries(p.specifications ?? {}),
    purchasePrice: n(p.purchasePrice),
    price: n(p.price),
    discountPrice: n(p.discountPrice),
    vatExempt: p.vatExempt,
    minStockLevel: String(p.minStockLevel),
    warranty: p.warranty ?? "",
    warrantyMonths: p.warrantyMonths != null ? String(p.warrantyMonths) : "",
    supplierId: p.supplierId ?? "",
    weightGrams: p.weightGrams != null ? String(p.weightGrams) : "",
    dimensions: p.dimensions ?? "",
    status: p.status,
    flags: { isFeatured: p.isFeatured, isDeal: p.isDeal, isNewArrival: p.isNewArrival, isBestSeller: p.isBestSeller, isClearance: p.isClearance, isRecommended: p.isRecommended, isTrending: p.isTrending },
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    seoKeywords: p.seoKeywords ?? "",
    variants: variants.map(({ v, onHand }) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      barcode: v.barcode ?? "",
      price: n(v.price),
      discountPrice: n(v.discountPrice),
      attributes: Object.entries(v.attributes ?? {}),
      image: v.image ?? "",
      isDefault: v.isDefault,
      isActive: v.isActive,
      openingStock: "0",
      onHand: onHand ?? 0,
    })),
    videos: videos.map((v) => ({ url: v.url, title: v.title ?? "" })),
    images: images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
  };
}
