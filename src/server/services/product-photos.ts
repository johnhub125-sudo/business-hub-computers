import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { brands, productImages, products } from "../db/schema";
import { appEnv, integrations } from "../env";
import { UserError } from "../errors";
import { findProductPhotos, ImageSearchError } from "../integrations/image-search";
import { log } from "../logger";
import { getSetting } from "../settings";
import { deleteFile, uploadFile } from "../storage";

/**
 * Real product photos, found in the background.
 *
 * A product starts as `photoSearch = "pending"`. A batch job (after an import, from the admin
 * button, and from the daily cron) looks each one up, downloads the best match, shrinks it to a
 * small WebP and stores it like any uploaded image. Until then — and whenever nothing suitable is
 * found — the storefront shows the automatic 3D picture, so customers never wait on this.
 */

const MAX_DOWNLOAD = 12 * 1024 * 1024;

function privateAddress(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}

/** Only public https addresses may be fetched (blocks requests to internal networks). */
async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError("That is not a valid picture link.");
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) throw new UserError("Use an https:// picture link.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || host === "localhost" || !host.includes(".")) throw new UserError("That picture link is not allowed.");
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((a) => privateAddress(a.address))) throw new UserError("That picture link is not allowed.");
  return url;
}

/** Downloads a picture and returns a compact WebP (max 1000px, white background). */
export async function downloadPhoto(link: string): Promise<Buffer> {
  let url = await assertPublicUrl(link);
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5", "User-Agent": "Mozilla/5.0 (compatible; BusinessHubCatalog/1.0)" },
    }).catch(() => null);
    if (!res) throw new UserError("The picture could not be downloaded.");
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new UserError("The picture could not be downloaded.");
  const type = res.headers.get("content-type") ?? "";
  if (type && !type.startsWith("image/") && !type.startsWith("application/octet-stream")) throw new UserError("That link is not a picture.");
  if (Number(res.headers.get("content-length") ?? 0) > MAX_DOWNLOAD) throw new UserError("That picture is too large.");
  const raw = Buffer.from(await res.arrayBuffer());
  if (raw.byteLength > MAX_DOWNLOAD) throw new UserError("That picture is too large.");
  try {
    const img = sharp(raw, { failOn: "error", limitInputPixels: 40_000_000 });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 240) throw new UserError("That picture is too small to use.");
    return await img.rotate().resize(1000, 1000, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).webp({ quality: 82 }).toBuffer();
  } catch (err) {
    if (err instanceof UserError) throw err;
    throw new UserError("That file is not a usable picture.");
  }
}

/** Stores a prepared picture as a product image. Auto-found photos go first when the product has none. */
async function attachPhoto(product: { id: string; name: string; slug: string }, webp: Buffer, source: "auto" | "upload", sourceUrl: string | null, userId: string | null) {
  const file = new File([new Uint8Array(webp)], `${product.slug.slice(0, 60)}.webp`, { type: "image/webp" });
  const up = await uploadFile({ file, kind: "image", folder: `products/${product.id}`, access: "public", userId, entityType: "product", entityId: product.id, alt: product.name });
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${productImages.sortOrder}), -1)::int` }).from(productImages).where(eq(productImages.productId, product.id));
  const [row] = await db.insert(productImages).values({ productId: product.id, url: up.url, pathname: up.pathname, alt: product.name, source, sourceUrl, sortOrder: max + 1 }).returning();
  return row;
}

export function photoSearchReady() {
  // Storage is required to keep the photo; local development falls back to disk.
  return integrations.imageSearch() && (integrations.blob() || appEnv() === "development");
}

const hasRealPhoto = sql`EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = ${products.id} AND pi.url NOT LIKE '/images/catalog/%')`;
const waiting = and(eq(products.photoSearch, "pending"), isNull(products.deletedAt), ne(products.status, "archived"), sql`NOT ${hasRealPhoto}`);

/** How many products are still waiting for a real photo. */
export async function photosWaiting() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(waiting);
  return n;
}

type Outcome = "found" | "not_found";

async function searchOne(p: { id: string; name: string; slug: string; brand: string | null }, vendorOnly: boolean, userId: string | null): Promise<Outcome> {
  const candidates = await findProductPhotos({ name: p.name, brand: p.brand }, { vendorOnly });
  for (const c of candidates.slice(0, 3)) {
    try {
      const webp = await downloadPhoto(c.imageUrl);
      await attachPhoto(p, webp, "auto", c.pageUrl || c.imageUrl, userId);
      await db.update(products).set({ photoSearch: "found", photoCheckedAt: new Date() }).where(eq(products.id, p.id));
      return "found";
    } catch (err) {
      if (!(err instanceof UserError)) log.warn("Photo candidate failed", { product: p.id, err: String(err) });
    }
  }
  await db.update(products).set({ photoSearch: "not_found", photoCheckedAt: new Date() }).where(eq(products.id, p.id));
  return "not_found";
}

export type PhotoBatch = { ready: boolean; processed: number; found: number; remaining: number; message?: string };

/**
 * Looks up real photos for up to `limit` waiting products. Safe to run repeatedly and concurrently
 * with browsing; stops early (leaving products pending) if the search allowance runs out.
 */
export async function findPhotosBatch(limit: number, userId: string | null = null): Promise<PhotoBatch> {
  const settings = await getSetting("storefront");
  if (!settings.autoPhotos) return { ready: false, processed: 0, found: 0, remaining: 0, message: "Automatic photo search is switched off in Settings → Storefront & effects." };
  if (!photoSearchReady()) {
    return { ready: false, processed: 0, found: 0, remaining: await photosWaiting(), message: integrations.imageSearch() ? "File storage is not connected, so found photos cannot be saved." : "Photo search is not set up yet (BRAVE_SEARCH_API_KEY)." };
  }
  const batch = await db
    .select({ id: products.id, name: products.name, slug: products.slug, brand: brands.name })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(waiting)
    .orderBy(asc(products.photoCheckedAt), asc(products.createdAt))
    .limit(Math.min(Math.max(limit, 1), 25));
  let found = 0;
  let processed = 0;
  let message: string | undefined;
  for (const p of batch) {
    try {
      if ((await searchOne(p, settings.photosVendorOnly, userId)) === "found") found++;
      processed++;
    } catch (err) {
      if (err instanceof ImageSearchError) {
        message = err.message;
        break; // allowance used up or key problem: keep the rest pending
      }
      log.error("Photo search failed for product", { product: p.id, err });
      await db.update(products).set({ photoSearch: "not_found", photoCheckedAt: new Date() }).where(eq(products.id, p.id));
      processed++;
    }
  }
  return { ready: true, processed, found, remaining: await photosWaiting(), message };
}

async function loadProduct(productId: string) {
  const [p] = await db.select({ id: products.id, name: products.name, slug: products.slug, brand: brands.name }).from(products).leftJoin(brands, eq(brands.id, products.brandId)).where(eq(products.id, productId));
  if (!p) throw new UserError("Product not found.");
  return p;
}

/** Removes photos that were found automatically (uploaded photos are never touched). */
async function removeAutoPhotos(productId: string) {
  const autos = await db.select().from(productImages).where(and(eq(productImages.productId, productId), eq(productImages.source, "auto")));
  for (const img of autos) {
    await db.delete(productImages).where(eq(productImages.id, img.id));
    if (img.pathname) await deleteFile(img.pathname).catch(() => {});
  }
  return autos.length;
}

/** Admin: search again for one product now, replacing a previously auto-found photo. */
export async function refindPhoto(productId: string, userId: string): Promise<Outcome> {
  if (!photoSearchReady()) throw new UserError("Photo search is not set up yet. Add BRAVE_SEARCH_API_KEY in Vercel and connect file storage.");
  const p = await loadProduct(productId);
  const settings = await getSetting("storefront");
  await removeAutoPhotos(productId);
  try {
    return await searchOne(p, settings.photosVendorOnly, userId);
  } catch (err) {
    if (err instanceof ImageSearchError) throw new UserError(err.message);
    throw err;
  }
}

/** Admin: go back to the automatic 3D picture and stop searching for this product. */
export async function keepGeneratedPicture(productId: string) {
  await loadProduct(productId);
  const removed = await removeAutoPhotos(productId);
  await db.update(products).set({ photoSearch: "off", photoCheckedAt: new Date() }).where(eq(products.id, productId));
  return removed;
}

/** Admin: add a picture from a link (e.g. copied from the manufacturer's page). */
export async function addPhotoFromLink(productId: string, link: string, userId: string) {
  const p = await loadProduct(productId);
  const webp = await downloadPhoto(link.trim());
  return attachPhoto(p, webp, "upload", link.trim().slice(0, 500), userId);
}

/** Puts every product without a real photo back in the queue (admin "search all again"). */
export async function requeueAllPhotos() {
  const rows = await db
    .update(products)
    .set({ photoSearch: "pending" })
    .where(and(isNull(products.deletedAt), ne(products.photoSearch, "off"), ne(products.photoSearch, "pending"), sql`NOT ${hasRealPhoto}`))
    .returning({ id: products.id });
  return rows.length;
}
