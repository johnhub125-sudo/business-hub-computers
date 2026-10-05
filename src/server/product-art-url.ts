import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { headlineSpecs, isPlaceholderImage, kindAccent, productKind, type ProductKind } from "@/lib/product-kind";
import { db, type Executor } from "./db";
import { brands, categories, productConditions, products } from "./db/schema";

/**
 * Automatic product pictures are addressed by their content:
 *   /product-art/<details, base64url>.<signature>.svg
 * The details ride in the address, so drawing a picture needs no database query and the result can
 * be cached forever (a changed product simply gets a new address). The signature stops anyone from
 * making the site draw text of their own choosing.
 */
export type ArtPayload = { n: string; b?: string; k: ProductKind; a: string; c?: string; s?: string[]; m?: 1 };

const secret = () => process.env.BETTER_AUTH_SECRET || "development-only-art-secret";
const sign = (data: string) => createHmac("sha256", secret()).update(`product-art:${data}`).digest("base64url").slice(0, 16);

export type ArtSource = { name: string; brand?: string | null; category?: string | null; subcategory?: string | null; condition?: string | null; specs?: Record<string, string> | null };

/** `compact` is for small tiles such as product cards: device only, no text. */
export function productArtUrl(p: ArtSource, compact = false): string {
  const kind = productKind({ name: p.name, category: p.category, subcategory: p.subcategory });
  const accent = kindAccent(p.brand ?? p.name, kind);
  if (compact) return artPath({ n: "", k: kind, a: accent, m: 1 });
  const payload: ArtPayload = { n: p.name.slice(0, 120), k: kind, a: accent };
  if (p.brand) payload.b = p.brand.slice(0, 40);
  if (p.condition) payload.c = p.condition.slice(0, 24);
  const specs = headlineSpecs(p.specs);
  if (specs.length) payload.s = specs.map((s) => s.slice(0, 24));
  return artPath(payload);
}

function artPath(payload: ArtPayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `/product-art/${data}.${sign(data)}.svg`;
}

/** The picture to show: the real photo when one was uploaded, otherwise the automatic picture. */
export function productImage(photo: string | null | undefined, p: ArtSource, compact = false): string {
  return isPlaceholderImage(photo) ? productArtUrl(p, compact) : photo!;
}

/** Parses and verifies the path segment of a picture address. Returns null when it is not genuine. */
export function readArtSegment(segment: string): ArtPayload | null {
  const m = /^([A-Za-z0-9_-]{8,1200})\.([A-Za-z0-9_-]{16})\.svg$/.exec(segment);
  if (!m) return null;
  const expected = Buffer.from(sign(m[1]));
  const got = Buffer.from(m[2]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    return JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")) as ArtPayload;
  } catch {
    return null;
  }
}

/**
 * Automatic pictures for several products in one query (carts, order lists).
 * Pass the open transaction when there is one, so no second connection is needed.
 */
export async function productArtUrls(productIds: string[], tx: Executor = db): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!productIds.length) return out;
  const rows = await tx
    .select({ id: products.id, name: products.name, specs: products.specifications, brand: brands.name, category: categories.name, condition: productConditions.name })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(productConditions, eq(productConditions.id, products.conditionId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(inArray(products.id, productIds));
  for (const r of rows) out.set(r.id, productArtUrl(r, true));
  return out;
}
