import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, notLike, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "../db";
import { productImage } from "../product-art-url";
import {
  brands,
  categories,
  inventory,
  productConditions,
  productImages,
  productVariants,
  productVideos,
  products,
  reviews,
  user,
} from "../db/schema";

/* ─────────────── shared fragments ─────────────── */

const listPriceExpr = sql<number>`coalesce((SELECT v.price FROM product_variants v WHERE v.product_id = ${products.id} AND v.is_active ORDER BY v.is_default DESC, v.sort_order LIMIT 1), ${products.price})`;
const salePriceExpr = sql<number | null>`(SELECT CASE WHEN v.price IS NOT NULL THEN v.discount_price ELSE coalesce(v.discount_price, ${products.discountPrice}) END FROM product_variants v WHERE v.product_id = ${products.id} AND v.is_active ORDER BY v.is_default DESC, v.sort_order LIMIT 1)`;
const effectivePriceExpr = sql<number>`coalesce(${salePriceExpr}, ${listPriceExpr})`;
const stockExpr = sql<number>`coalesce((SELECT sum(greatest(i.on_hand - i.reserved, 0)) FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.product_id = ${products.id} AND v.is_active), 0)::int`;
/** First real photo, if any (seeded demo illustrations don't count). Without one, `productImage()` supplies the automatic picture. */
export const photoExpr = sql<string | null>`(SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id} AND pi.url NOT LIKE '/images/catalog/%' ORDER BY pi.sort_order LIMIT 1)`;
const defaultVariantExpr = sql<string | null>`(SELECT v.id FROM product_variants v WHERE v.product_id = ${products.id} AND v.is_active ORDER BY v.is_default DESC, v.sort_order LIMIT 1)`;
const variantCountExpr = sql<number>`(SELECT count(*)::int FROM product_variants v WHERE v.product_id = ${products.id} AND v.is_active)`;

export const cardFields = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  shortDescription: products.shortDescription,
  brand: brands.name,
  condition: productConditions.name,
  conditionSlug: productConditions.slug,
  listPrice: listPriceExpr,
  salePrice: salePriceExpr,
  rating: products.ratingAverage,
  ratingCount: products.ratingCount,
  stock: stockExpr,
  image: photoExpr,
  // Only used to draw the automatic picture; removed again in normaliseCard.
  artCategory: categories.name,
  artSpecs: products.specifications,
  variantCount: variantCountExpr,
  variantId: defaultVariantExpr,
  isDeal: products.isDeal,
  isNewArrival: products.isNewArrival,
  isBestSeller: products.isBestSeller,
  isClearance: products.isClearance,
  warranty: products.warranty,
  createdAt: products.createdAt,
};

export type ProductCardData = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  brand: string | null;
  condition: string;
  conditionSlug: string;
  listPrice: number;
  salePrice: number | null;
  rating: string;
  ratingCount: number;
  stock: number;
  image: string;
  variantCount: number;
  variantId: string | null;
  isDeal: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isClearance: boolean;
  warranty: string | null;
  createdAt: Date;
};

function normaliseCard(row: Record<string, unknown>): ProductCardData {
  const { artCategory, artSpecs, ...r } = row as Record<string, unknown> & { artCategory: string; artSpecs: Record<string, string> };
  const c = r as ProductCardData & { image: string | null };
  return {
    ...c,
    image: productImage(c.image, { name: c.name, brand: c.brand, category: artCategory, condition: c.condition, specs: artSpecs }, true),
    listPrice: Number(r.listPrice),
    salePrice: r.salePrice == null ? null : Number(r.salePrice),
    stock: Number(r.stock),
    variantCount: Number(r.variantCount),
  };
}

const visible = and(eq(products.status, "active"), isNull(products.deletedAt));

function baseCardQuery() {
  return db
    .select(cardFields)
    .from(products)
    .innerJoin(productConditions, eq(productConditions.id, products.conditionId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId));
}

/* ─────────────── listing / search ─────────────── */

export const SORTS = {
  relevance: "Best match",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  popular: "Most popular",
  rating: "Best rated",
  discount: "Biggest discount",
  availability: "In stock first",
} as const;
export type SortKey = keyof typeof SORTS;

export type ProductFilters = {
  q?: string;
  category?: string; // slug (parent or child)
  sub?: string; // child slug
  brand?: string[];
  condition?: string[];
  min?: number; // kobo
  max?: number;
  ram?: string[];
  storage?: string[];
  processor?: string[];
  screen?: string[];
  inStock?: boolean;
  warranty?: boolean;
  rating?: number;
  discounted?: boolean;
  flag?: "featured" | "deal" | "new" | "bestseller" | "clearance" | "recommended" | "trending";
  sort?: SortKey;
  page?: number;
  perPage?: number;
};

const specMatch = (key: string, values: string[]) =>
  or(
    ...values.map(
      (v) =>
        sql`(${products.specifications}->>${key} ILIKE ${"%" + v + "%"} OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.attributes->>${key} ILIKE ${"%" + v + "%"}))`,
    ),
  );

export async function listProducts(f: ProductFilters) {
  const perPage = Math.min(Math.max(f.perPage ?? 24, 1), 60);
  const page = Math.max(f.page ?? 1, 1);
  const where: (SQL | undefined)[] = [visible];

  if (f.category) {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, f.category));
    if (!cat) return { items: [], total: 0, page, pages: 0 };
    where.push(or(eq(products.categoryId, cat.id), eq(products.subcategoryId, cat.id)));
  }
  if (f.sub) {
    const [sub] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, f.sub));
    if (sub) where.push(or(eq(products.subcategoryId, sub.id), eq(products.categoryId, sub.id)));
  }
  if (f.brand?.length) where.push(inArray(brands.slug, f.brand));
  if (f.condition?.length) where.push(inArray(productConditions.slug, f.condition));
  if (f.min != null) where.push(sql`${effectivePriceExpr} >= ${f.min}`);
  if (f.max != null) where.push(sql`${effectivePriceExpr} <= ${f.max}`);
  if (f.ram?.length) where.push(specMatch("RAM", f.ram));
  if (f.storage?.length) where.push(specMatch("Storage", f.storage));
  if (f.processor?.length) where.push(specMatch("Processor", f.processor));
  if (f.screen?.length) where.push(specMatch("Screen", f.screen));
  if (f.inStock) where.push(sql`${stockExpr} > 0`);
  if (f.warranty) where.push(sql`coalesce(${products.warrantyMonths}, 0) >= 12`);
  if (f.rating) where.push(sql`${products.ratingAverage} >= ${f.rating}`);
  if (f.discounted) where.push(sql`${salePriceExpr} IS NOT NULL AND ${salePriceExpr} < ${listPriceExpr}`);
  const flagCol = {
    featured: products.isFeatured,
    deal: products.isDeal,
    new: products.isNewArrival,
    bestseller: products.isBestSeller,
    clearance: products.isClearance,
    recommended: products.isRecommended,
    trending: products.isTrending,
  } as const;
  if (f.flag) where.push(eq(flagCol[f.flag], true));

  let rank: SQL | undefined;
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const tsv = sql`to_tsvector('english', coalesce(${products.name}, '') || ' ' || coalesce(${products.sku}, '') || ' ' || coalesce(${products.shortDescription}, '') || ' ' || coalesce(${products.description}, ''))`;
    const tsq = sql`websearch_to_tsquery('english', ${q})`;
    where.push(
      or(
        sql`${tsv} @@ ${tsq}`,
        ilike(products.name, like),
        ilike(products.sku, like),
        ilike(brands.name, like),
        ilike(categories.name, like),
        ilike(productConditions.name, like),
        sql`${products.specifications}::text ILIKE ${like}`,
        sql`EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = ${products.id} AND (pv.sku ILIKE ${like} OR pv.attributes::text ILIKE ${like}))`,
      ),
    );
    rank = sql`(ts_rank(${tsv}, ${tsq}) + CASE WHEN ${products.name} ILIKE ${like} THEN 1 ELSE 0 END)`;
  }

  const sort = f.sort ?? (q ? "relevance" : "newest");
  const orderBy: SQL[] = [];
  switch (sort) {
    case "price_asc":
      orderBy.push(sql`${effectivePriceExpr} ASC`);
      break;
    case "price_desc":
      orderBy.push(sql`${effectivePriceExpr} DESC`);
      break;
    case "popular":
      orderBy.push(desc(products.soldCount), desc(products.viewCount));
      break;
    case "rating":
      orderBy.push(desc(products.ratingAverage), desc(products.ratingCount));
      break;
    case "discount":
      orderBy.push(sql`(${listPriceExpr} - ${effectivePriceExpr})::float / greatest(${listPriceExpr}, 1) DESC`);
      break;
    case "availability":
      orderBy.push(sql`(${stockExpr} > 0) DESC`);
      break;
    case "relevance":
      if (rank) orderBy.push(sql`${rank} DESC`);
      break;
  }
  orderBy.push(desc(products.createdAt), asc(products.id));

  const cond = and(...where);
  const [rows, [{ total }]] = await Promise.all([
    baseCardQuery()
      .where(cond)
      .orderBy(...orderBy)
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(productConditions, eq(productConditions.id, products.conditionId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(cond),
  ]);
  return { items: rows.map(normaliseCard), total, page, pages: Math.ceil(total / perPage) };
}

export async function productRail(source: string, value?: string, limit = 10): Promise<ProductCardData[]> {
  const map: Record<string, ProductFilters> = {
    featured: { flag: "featured", sort: "newest" },
    deal: { flag: "deal", sort: "discount" },
    new: { flag: "new", sort: "newest" },
    bestseller: { flag: "bestseller", sort: "popular" },
    trending: { flag: "trending", sort: "popular" },
    recommended: { flag: "recommended" },
    clearance: { flag: "clearance" },
    condition: { condition: value ? [value] : undefined, sort: "popular" },
    category: { category: value, sort: "popular" },
  };
  const filters = map[source] ?? { sort: "newest" };
  const res = await listProducts({ ...filters, perPage: limit });
  if (res.items.length === 0 && source === "new") return (await listProducts({ sort: "newest", perPage: limit })).items;
  return res.items;
}

export async function searchSuggestions(q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const rows = await db
    .select({ name: products.name, slug: products.slug, image: photoExpr, price: effectivePriceExpr, brand: brands.name, category: categories.name, condition: productConditions.name, specs: products.specifications })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(productConditions, eq(productConditions.id, products.conditionId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(visible, or(ilike(products.name, like), ilike(products.sku, like), ilike(brands.name, like))))
    .orderBy(desc(products.soldCount))
    .limit(6);
  return rows.map(({ category, condition, specs, ...r }) => ({ ...r, image: productImage(r.image, { name: r.name, brand: r.brand, category, condition, specs }, true) }));
}

/* ─────────────── product detail ─────────────── */

export const getProductBySlug = cache(async (slug: string) => {
  const [p] = await db
    .select({
      product: products,
      brand: brands,
      category: categories,
      condition: productConditions,
    })
    .from(products)
    .innerJoin(productConditions, eq(productConditions.id, products.conditionId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), visible));
  if (!p) return null;
  const [variants, images, videos, sub] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        sku: productVariants.sku,
        attributes: productVariants.attributes,
        price: productVariants.price,
        discountPrice: productVariants.discountPrice,
        image: productVariants.image,
        isDefault: productVariants.isDefault,
        onHand: inventory.onHand,
        reserved: inventory.reserved,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(productVariants.productId, p.product.id), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.sortOrder)),
    db.select().from(productImages).where(and(eq(productImages.productId, p.product.id), notLike(productImages.url, "/images/catalog/%"))).orderBy(asc(productImages.sortOrder)),
    db.select().from(productVideos).where(eq(productVideos.productId, p.product.id)).orderBy(asc(productVideos.sortOrder)),
    p.product.subcategoryId ? db.select().from(categories).where(eq(categories.id, p.product.subcategoryId)) : Promise.resolve([]),
  ]);
  return {
    ...p,
    subcategory: sub[0] ?? null,
    images,
    videos,
    variants: variants.map((v) => {
      const list = v.price ?? p.product.price;
      const sale = v.price != null ? v.discountPrice : (v.discountPrice ?? p.product.discountPrice);
      return { ...v, listPrice: list, salePrice: sale != null && sale < list ? sale : null, available: Math.max(0, (v.onHand ?? 0) - (v.reserved ?? 0)) };
    }),
  };
});

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function relatedProducts(productId: string, categoryId: string, limit = 8) {
  const rows = await baseCardQuery()
    .where(and(visible, eq(products.categoryId, categoryId), ne(products.id, productId)))
    .orderBy(desc(products.soldCount), desc(products.createdAt))
    .limit(limit);
  return rows.map(normaliseCard);
}

/** Products that appear in the same paid orders ("frequently purchased together"). */
export async function frequentlyBoughtWith(productId: string, limit = 4) {
  const co = await db.execute<{ product_id: string; n: number }>(sql`
    SELECT oi2.product_id, count(*)::int n
    FROM order_items oi1
    JOIN orders o ON o.id = oi1.order_id AND o.payment_status = 'successful'
    JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id <> oi1.product_id
    WHERE oi1.product_id = ${productId}
    GROUP BY oi2.product_id ORDER BY n DESC LIMIT ${limit}`);
  const ids = co.rows.map((r) => r.product_id).filter(Boolean);
  if (!ids.length) {
    // fall back to popular accessories
    const [acc] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "accessories"));
    if (!acc) return [];
    return (await baseCardQuery().where(and(visible, eq(products.categoryId, acc.id), ne(products.id, productId))).orderBy(desc(products.soldCount)).limit(limit)).map(normaliseCard);
  }
  return (await baseCardQuery().where(and(visible, inArray(products.id, ids))).limit(limit)).map(normaliseCard);
}

export async function productsByIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await baseCardQuery().where(and(visible, inArray(products.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, normaliseCard(r)]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as ProductCardData[];
}

export async function productReviews(productId: string) {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      comment: reviews.comment,
      photos: reviews.photos,
      isVerifiedPurchase: reviews.isVerifiedPurchase,
      adminResponse: reviews.adminResponse,
      createdAt: reviews.createdAt,
      author: user.name,
    })
    .from(reviews)
    .innerJoin(user, eq(user.id, reviews.userId))
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")))
    .orderBy(desc(reviews.createdAt))
    .limit(50);
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.filter((r) => r.rating === star).length }));
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  return { rows, dist, avg, count: rows.length };
}

export async function latestReviews(limit = 6) {
  return db
    .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, comment: reviews.comment, createdAt: reviews.createdAt, author: user.name, productName: products.name, productSlug: products.slug })
    .from(reviews)
    .innerJoin(user, eq(user.id, reviews.userId))
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.status, "approved"))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

/* ─────────────── navigation / facets ─────────────── */

export const getNavigation = cache(async () => {
  const [cats, conds, brandRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select().from(productConditions).where(eq(productConditions.isActive, true)).orderBy(asc(productConditions.sortOrder)),
    db.select({ name: brands.name, slug: brands.slug, logo: brands.logo }).from(brands).where(eq(brands.isActive, true)).orderBy(asc(brands.sortOrder)),
  ]);
  const top = cats.filter((c) => !c.parentId);
  return {
    categories: top.map((c) => ({ ...c, children: cats.filter((x) => x.parentId === c.id) })),
    allCategories: cats,
    collections: conds.filter((c) => c.isCollection),
    conditions: conds,
    brands: brandRows,
  };
});

export async function categoryCounts() {
  const rows = await db
    .select({ categoryId: products.categoryId, n: sql<number>`count(*)::int` })
    .from(products)
    .where(visible)
    .groupBy(products.categoryId);
  return new Map(rows.map((r) => [r.categoryId, r.n]));
}

export const FACET_OPTIONS = {
  ram: ["4GB", "8GB", "16GB", "32GB", "64GB"],
  storage: ["128GB", "256GB", "512GB", "1TB", "2TB"],
  processor: ["Core i3", "Core i5", "Core i7", "Core i9", "Ryzen 5", "Ryzen 7", "Apple M"],
  screen: ['13', '14"', '15.6"', '17"', '24"', '27"'],
};

export async function incrementView(productId: string) {
  await db.update(products).set({ viewCount: sql`${products.viewCount} + 1` }).where(eq(products.id, productId));
}

