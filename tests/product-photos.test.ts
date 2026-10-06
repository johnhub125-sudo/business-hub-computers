import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No network in tests: DNS, the Brave API and image downloads are simulated; storage is in memory.
let dnsAnswer = "93.184.216.34";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: dnsAnswer, family: 4 }]) }));

const stored = new Map<string, number>();
vi.mock("@/server/storage", () => ({
  uploadFile: vi.fn(async (input: { file: File; folder: string }) => {
    const pathname = `${input.folder}/${input.file.name}`;
    stored.set(pathname, input.file.size);
    return { id: "asset", url: `/media/${pathname}`, pathname, mime: "image/webp", size: input.file.size };
  }),
  deleteFile: vi.fn(async (pathname: string) => void stored.delete(pathname)),
}));

import { db } from "@/server/db";
import { brands, categories, productConditions, productImages, products } from "@/server/db/schema";
import { modelTokens, searchTerms } from "@/server/integrations/image-search";
import { listProducts } from "@/server/queries/catalog";
import { downloadPhoto, findPhotosBatch, keepGeneratedPicture, photosWaiting, requeueAllPhotos } from "@/server/services/product-photos";
import { saveSetting, SETTINGS_DEFAULTS } from "@/server/settings";
import { resetDb } from "./support/fixtures";

type Hit = { title: string; url: string; properties: { url: string; width?: number; height?: number } };
let braveResults: (query: string) => Hit[] = () => [];
let braveStatus = 200;
const braveQueries: string[] = [];
let photo: Buffer;

const OFFICIAL: Hit = { title: "HP EliteBook 840 G8 Notebook PC", url: "https://www.hp.com/us-en/shop/pdp/hp-elitebook-840-g8", properties: { url: "https://ssl-product-images.www8-hp.com/digmedialib/prodimg/840-g8.png", width: 1200, height: 900 } };
const RESELLER: Hit = { title: "HP EliteBook 840 G8 - buy now", url: "https://www.some-shop.example/hp-840-g8", properties: { url: "https://cdn.some-shop.example/img/840-g8.jpg", width: 2000, height: 2000 } };
const UNRELATED: Hit = { title: "HP logo", url: "https://www.hp.com/about", properties: { url: "https://www.hp.com/logo.svg", width: 800, height: 800 } };

async function addProduct(name = "HP EliteBook 840 G8 Core i7 (UK Used)") {
  const [cat] = await db.select().from(categories);
  const [cond] = await db.select().from(productConditions);
  const [brand] = await db.select().from(brands);
  const [p] = await db.insert(products).values({ sku: `S-${Math.random().toString(36).slice(2, 10)}`, name, slug: `p-${Math.random().toString(36).slice(2, 10)}`, categoryId: cat.id, conditionId: cond.id, brandId: brand.id, price: 52_000_000, status: "active" }).returning();
  return p;
}

describe("real product photos", () => {
  beforeEach(async () => {
    await resetDb();
    stored.clear();
    braveQueries.length = 0;
    braveStatus = 200;
    dnsAnswer = "93.184.216.34";
    photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#cccccc" } }).jpeg().toBuffer();
    await db.insert(categories).values({ name: "Computers", slug: "computers" });
    await db.insert(productConditions).values({ name: "UK Used", slug: "uk-used", isCollection: true });
    await db.insert(brands).values({ name: "HP", slug: "hp" });
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        if (url.hostname === "api.search.brave.com") {
          const q = url.searchParams.get("q") ?? "";
          braveQueries.push(q);
          return new Response(JSON.stringify({ type: "images", results: braveResults(q) }), { status: braveStatus, headers: { "content-type": "application/json" } });
        }
        return new Response(new Uint8Array(photo), { status: 200, headers: { "content-type": "image/jpeg" } });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("prefers the manufacturer's site, stores a small WebP and shows it in the shop", async () => {
    const p = await addProduct();
    braveResults = () => [RESELLER, UNRELATED, OFFICIAL];

    const res = await findPhotosBatch(5);
    expect(res).toMatchObject({ ready: true, processed: 1, found: 1, remaining: 0 });
    expect(braveQueries[0]).toBe("HP EliteBook 840 G8 Core i7 site:hp.com"); // condition words stripped, official site asked first

    const [img] = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    expect(img).toMatchObject({ source: "auto", sourceUrl: OFFICIAL.url });
    expect(img.url).toMatch(/^\/media\/products\/.+\.webp$/);
    expect(stored.get(img.pathname!)).toBeLessThan(photo.byteLength); // shrunk to max 1000px WebP
    expect((await db.select().from(products).where(eq(products.id, p.id)))[0].photoSearch).toBe("found");
    expect((await listProducts({})).items[0].image).toBe(img.url);
  });

  it("falls back to another shop's matching photo, unless restricted to the manufacturer", async () => {
    const a = await addProduct();
    braveResults = () => [RESELLER, UNRELATED];
    expect(await findPhotosBatch(5)).toMatchObject({ found: 1 });
    expect((await db.select().from(productImages).where(eq(productImages.productId, a.id)))[0].sourceUrl).toBe(RESELLER.url);

    await saveSetting("storefront", { ...SETTINGS_DEFAULTS.storefront, photosVendorOnly: true }, null);
    const b = await addProduct("HP EliteBook 850 G8");
    braveResults = () => [{ ...RESELLER, title: "HP EliteBook 850 G8" }];
    expect(await findPhotosBatch(5)).toMatchObject({ processed: 1, found: 0 });
    expect(await db.select().from(productImages).where(eq(productImages.productId, b.id))).toHaveLength(0);
    expect((await db.select().from(products).where(eq(products.id, b.id)))[0].photoSearch).toBe("not_found");
    expect((await listProducts({})).items.find((x) => x.id === b.id)!.image).toMatch(/^\/product-art\//); // 3D picture stays
  });

  it("never uses a photo of a different model", async () => {
    await addProduct();
    braveResults = () => [{ ...OFFICIAL, title: "HP EliteBook 1040 G10 Notebook PC", properties: { ...OFFICIAL.properties, url: "https://ssl-product-images.www8-hp.com/x/1040-g10.png" } }];
    expect(await findPhotosBatch(5)).toMatchObject({ processed: 1, found: 0 });
  });

  it("pauses when the search allowance runs out and continues later", async () => {
    await addProduct();
    await addProduct("HP ProBook 450 G9");
    braveStatus = 429;
    const res = await findPhotosBatch(5);
    expect(res).toMatchObject({ processed: 0, found: 0, remaining: 2 });
    expect(res.message).toMatch(/allowance/);
    expect(await photosWaiting()).toBe(2); // still queued
  });

  it("does nothing when switched off or not configured", async () => {
    await addProduct();
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    expect(await findPhotosBatch(5)).toMatchObject({ ready: false, processed: 0 });
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-key");
    await saveSetting("storefront", { ...SETTINGS_DEFAULTS.storefront, autoPhotos: false }, null);
    expect(await findPhotosBatch(5)).toMatchObject({ ready: false, processed: 0 });
    expect(braveQueries).toHaveLength(0);
  });

  it("lets staff go back to the 3D picture and search again later", async () => {
    const p = await addProduct();
    braveResults = () => [OFFICIAL];
    await findPhotosBatch(5);
    expect(stored.size).toBe(1);

    expect(await keepGeneratedPicture(p.id)).toBe(1);
    expect(stored.size).toBe(0);
    expect(await db.select().from(productImages).where(eq(productImages.productId, p.id))).toHaveLength(0);
    expect((await db.select().from(products).where(eq(products.id, p.id)))[0].photoSearch).toBe("off");
    expect(await requeueAllPhotos()).toBe(0); // "off" products are left alone
    expect(await photosWaiting()).toBe(0);
  });

  it("only downloads pictures from public https addresses", async () => {
    await expect(downloadPhoto("http://www.hp.com/a.png")).rejects.toThrow(/https/);
    await expect(downloadPhoto("https://127.0.0.1/a.png")).rejects.toThrow(/not allowed/);
    await expect(downloadPhoto("https://localhost/a.png")).rejects.toThrow(/not allowed/);
    dnsAnswer = "10.0.0.5"; // a public-looking name that resolves to an internal address
    await expect(downloadPhoto("https://internal.example.com/a.png")).rejects.toThrow(/not allowed/);
    dnsAnswer = "93.184.216.34";
    photo = Buffer.from("<html>not a picture</html>");
    await expect(downloadPhoto("https://www.hp.com/a.png")).rejects.toThrow(/not a usable picture/);
  });

  it("builds sensible search terms", () => {
    expect(searchTerms("EliteBook 840 G8 Core i7 (UK Used)", "HP")).toBe("HP EliteBook 840 G8 Core i7");
    expect(searchTerms("Dell Latitude 5420 Brand New", "Dell")).toBe("Dell Latitude 5420");
    expect(modelTokens("HP EliteBook 840 G8 16GB 512GB")).toEqual(["840", "g8"]);
    expect(modelTokens("HP LaserJet Pro M404dn")).toEqual(["m404dn"]);
    expect(modelTokens("Lenovo ThinkPad T14 Core i5 11th Gen 15.6inch DDR4")).toEqual(["t14"]);
  });
});
