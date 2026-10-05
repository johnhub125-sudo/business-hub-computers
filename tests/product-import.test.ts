import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { renderProductArt } from "@/lib/product-art";
import { productKind } from "@/lib/product-kind";
import { db } from "@/server/db";
import { brands, categories, inventory, productConditions, productVariants, products } from "@/server/db/schema";
import { productArtUrl, productImage, readArtSegment } from "@/server/product-art-url";
import { listProducts } from "@/server/queries/catalog";
import { buildProductTemplate, parseProductSheet, SHEET_COLUMNS } from "@/server/services/product-sheet";
import { importProducts } from "@/server/services/products";
import { makeUser, resetDb } from "./support/fixtures";

const staff = { id: "", email: "admin@example.test", roleLabel: "Super Admin" };

async function seedCatalogue() {
  const [computers] = await db.insert(categories).values({ name: "Computers", slug: "computers" }).returning();
  await db.insert(categories).values([
    { name: "Business Laptops", slug: "business-laptops", parentId: computers.id },
    { name: "Printers", slug: "printers" },
  ]);
  await db.insert(productConditions).values([
    { name: "Brand New", slug: "brand-new", isCollection: true },
    { name: "UK Used", slug: "uk-used", isCollection: true },
  ]);
  await db.insert(brands).values({ name: "HP", slug: "hp" });
}

/** Fills the downloaded template the way a staff member would in Excel. */
async function fillTemplate(rows: Record<string, string | number>[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildProductTemplate()).buffer as ArrayBuffer);
  const ws = wb.getWorksheet("Products")!;
  rows.forEach((r, i) => {
    for (const [key, value] of Object.entries(r)) ws.getCell(i + 2, SHEET_COLUMNS.findIndex((c) => c.key === key) + 1).value = value;
  });
  return parseProductSheet((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe("Excel product import", () => {
  beforeEach(async () => {
    await resetDb();
    staff.id = await makeUser({ userType: "staff" });
    await seedCatalogue();
  });

  it("offers the live categories, brands and conditions as dropdowns", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildProductTemplate()).buffer as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Products", "Lists", "How to use"]);
    const lists = wb.getWorksheet("Lists")!;
    expect(lists.getColumn(1).values).toContain("Computers");
    expect(lists.getColumn(2).values).toContain("Business Laptops");
    expect(wb.getWorksheet("Products")!.getCell("C2").dataValidation?.type).toBe("list");
  });

  it("puts every product in the right place, with stock, specs and a picture", async () => {
    const rows = await fillTemplate([
      { sku: "HP-840-G8", name: "HP EliteBook 840 G8 Core i7", category: "Computers", subcategory: "Business Laptops", brand: "HP", condition: "UK Used", price: 520000, discount_price: 495000, stock: 4, specifications: "Processor: Core i7 11th Gen; RAM: 16GB; Storage: 512GB SSD", featured: "Yes", deal: "Yes" },
      { sku: "EPS-L3250", name: "Epson EcoTank L3250 Printer", category: "Printers", brand: "Epson", condition: "Brand New", price: 285000, stock: 2, status: "Draft" },
    ]);

    const check = await importProducts(rows, staff, true);
    expect(check).toMatchObject({ ok: true, count: 2, created: 0 });
    expect(check.notes[0]).toContain("Epson");
    expect(await db.select().from(products)).toHaveLength(0); // checking never saves

    const res = await importProducts(rows, staff, false);
    expect(res).toMatchObject({ ok: true, created: 2, updated: 0 });

    const [laptop] = await db.select().from(products).where(eq(products.sku, "HP-840-G8"));
    const [sub] = await db.select().from(categories).where(eq(categories.slug, "business-laptops"));
    const [used] = await db.select().from(productConditions).where(eq(productConditions.slug, "uk-used"));
    expect(laptop).toMatchObject({ price: 52_000_000, discountPrice: 49_500_000, subcategoryId: sub.id, conditionId: used.id, status: "active", isFeatured: true, isDeal: true, isNewArrival: false });
    expect(laptop.specifications).toEqual({ Processor: "Core i7 11th Gen", RAM: "16GB", Storage: "512GB SSD" });
    const [stock] = await db.select({ onHand: inventory.onHand }).from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).where(eq(productVariants.productId, laptop.id));
    expect(stock.onHand).toBe(4);
    expect(await db.select().from(brands).where(eq(brands.slug, "epson"))).toHaveLength(1); // new brand created

    // Storefront: only the Active product is listed, under UK Used and Deals, with an automatic picture.
    const shop = await listProducts({});
    expect(shop.items.map((p) => p.name)).toEqual(["HP EliteBook 840 G8 Core i7"]);
    expect((await listProducts({ condition: ["uk-used"], flag: "deal" })).total).toBe(1);
    expect(shop.items[0].image).toMatch(/^\/product-art\/.+\.svg$/);
  });

  it("updates an existing SKU without wiping blank cells or re-adding stock", async () => {
    await importProducts(await fillTemplate([{ sku: "HP-840-G8", name: "HP EliteBook 840 G8", category: "Computers", condition: "UK Used", price: 520000, stock: 4, specifications: "RAM: 16GB", featured: "Yes" }]), staff, false);
    const res = await importProducts(await fillTemplate([{ sku: "HP-840-G8", name: "HP EliteBook 840 G8", category: "Computers", condition: "UK Used", price: 499000, stock: 9 }]), staff, false);
    expect(res).toMatchObject({ created: 0, updated: 1 });
    const [p] = await db.select().from(products).where(eq(products.sku, "HP-840-G8"));
    expect(p).toMatchObject({ price: 49_900_000, isFeatured: true, specifications: { RAM: "16GB" } });
    const [stock] = await db.select({ onHand: inventory.onHand }).from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).where(eq(productVariants.productId, p.id));
    expect(stock.onHand).toBe(4);
  });

  it("reports every problem with its Excel row number and saves nothing", async () => {
    const rows = await fillTemplate([
      { sku: "OK-1", name: "HP ProBook 440", category: "Computers", condition: "Brand New", price: 400000 },
      { sku: "BAD 2", name: "X", category: "Phones", condition: "Brand New", price: 0 },
      { sku: "BAD-3", name: "Canon Printer", category: "Printers", subcategory: "Business Laptops", condition: "Brand New", price: 100000, discount_price: 150000, featured: "maybe" },
    ]);
    const res = await importProducts(rows, staff, false);
    expect(res.ok).toBe(false);
    expect(res.errors.map((e) => e.row)).toEqual(expect.arrayContaining([3, 4]));
    expect(res.errors.some((e) => e.row === 2)).toBe(false);
    expect(await db.select().from(products)).toHaveLength(0);
  });
});

describe("automatic product pictures", () => {
  const source = { name: "HP EliteBook 840 G8 <Core i7>", brand: "HP", category: "Computers", condition: "UK Used", specs: { Processor: "Core i7", RAM: "16GB" } };

  it("recognises the device type from the name first, then the category", () => {
    expect(productKind({ name: "HP Wireless Mouse", category: "Accessories" })).toBe("mouse");
    expect(productKind({ name: "ASUS ROG Strix G16", category: "Computers" })).toBe("gaming");
    expect(productKind({ name: "Dell OptiPlex 7090", category: "Computers" })).toBe("desktop");
    expect(productKind({ name: "Model X200", category: "Printers" })).toBe("printer");
    expect(productKind({ name: "Something else", category: "Misc" })).toBe("accessory");
  });

  it("uses a signed address that cannot be forged or altered", () => {
    const url = productArtUrl(source);
    const segment = url.replace("/product-art/", "");
    expect(readArtSegment(segment)).toMatchObject({ n: source.name, b: "HP", k: "laptop", c: "UK Used", s: ["Core i7", "16GB"] });
    expect(readArtSegment(segment.replace(/^./, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(readArtSegment("anything.AAAAAAAAAAAAAAAA.svg")).toBeNull();
  });

  it("keeps a real photo, and gives small tiles a compact picture shared across products", () => {
    expect(productImage("https://cdn.example/photo.jpg", source)).toBe("https://cdn.example/photo.jpg");
    expect(productImage("/images/catalog/laptop-1.svg", source)).toMatch(/^\/product-art\//);
    expect(productArtUrl(source, true)).toBe(productArtUrl({ ...source, name: "HP ProBook 450 G9" }, true));
  });

  it("draws a small, safe SVG", () => {
    const svg = renderProductArt({ name: source.name, brand: "HP", kind: "laptop", accent: "#3B82F6", condition: "UK Used", specs: ["Core i7", "16GB"] });
    expect(svg).toContain("&lt;Core i7&gt;");
    expect(svg).not.toContain("<Core");
    expect(svg.length).toBeLessThan(9000);
    expect(renderProductArt({ name: "", kind: "printer", accent: "#D62828", compact: true }).length).toBeLessThan(6000);
  });
});
