import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { renderProductArt } from "@/lib/product-art";
import { productKind } from "@/lib/product-kind";
import { db } from "@/server/db";
import { brands, categories, inventory, productConditions, productSerials, productVariants, products } from "@/server/db/schema";
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
    for (const [key, value] of Object.entries(r)) {
      const col = SHEET_COLUMNS.findIndex((c) => c.key === key);
      if (col < 0) throw new Error(`The template has no “${key}” column`);
      ws.getCell(i + 2, col + 1).value = value;
    }
  });
  return parseProductSheet((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const stockOf = async (productId: string) => {
  const [s] = await db.select({ onHand: inventory.onHand }).from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).where(eq(productVariants.productId, productId));
  return s.onHand;
};

describe("Excel product import", () => {
  beforeEach(async () => {
    await resetDb();
    staff.id = await makeUser({ userType: "staff" });
    await seedCatalogue();
  });

  it("offers the live categories, brands and conditions as dropdowns, and asks for no SKU", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildProductTemplate()).buffer as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Products", "Lists", "How to use"]);
    const lists = wb.getWorksheet("Lists")!;
    expect(lists.getColumn(1).values).toContain("Computers");
    expect(lists.getColumn(2).values).toContain("Business Laptops");
    const ws = wb.getWorksheet("Products")!;
    expect(ws.getCell("A1").text).toBe("Product name *");
    expect(ws.getRow(1).values).not.toContain("SKU *");
    expect(ws.getCell("B2").dataValidation?.type).toBe("list"); // Category
  });

  it("creates the SKU and web address, and puts every product in the right place", async () => {
    await db.insert(products).values({ sku: "BHC-POW-0033", name: "Existing power station", slug: "existing", categoryId: (await db.select().from(categories).where(eq(categories.slug, "printers")))[0].id, conditionId: (await db.select().from(productConditions))[0].id, price: 100 });
    const rows = await fillTemplate([
      { name: "HP EliteBook 840 G8 Core i7", category: "Computers", subcategory: "Business Laptops", brand: "HP", condition: "UK Used", price: 520000, discount_price: 495000, stock: 4, specifications: "Processor: Core i7 11th Gen; RAM: 16GB; Storage: 512GB SSD", featured: "Yes", deal: "Yes" },
      { name: "Epson EcoTank L3250 Printer", category: "Printers", brand: "Epson", condition: "Brand New", price: 285000, stock: 2, status: "Draft" },
    ]);

    const check = await importProducts(rows, staff, true);
    expect(check).toMatchObject({ ok: true, count: 2, created: 0 });
    expect(check.notes[0]).toContain("Epson");
    expect(await db.select().from(products)).toHaveLength(1); // checking never saves

    const res = await importProducts(rows, staff, false);
    expect(res).toMatchObject({ ok: true, created: 2, updated: 0 });

    const [laptop] = await db.select().from(products).where(eq(products.name, "HP EliteBook 840 G8 Core i7"));
    const [printer] = await db.select().from(products).where(eq(products.name, "Epson EcoTank L3250 Printer"));
    // Generated codes continue from the highest number already in use.
    expect(laptop.sku).toBe("BHC-COM-0034");
    expect(printer.sku).toBe("BHC-PRI-0035");
    expect(laptop.slug).toBe("hp-elitebook-840-g8-core-i7");
    expect(laptop.photoSearch).toBe("pending");

    const [sub] = await db.select().from(categories).where(eq(categories.slug, "business-laptops"));
    const [used] = await db.select().from(productConditions).where(eq(productConditions.slug, "uk-used"));
    expect(laptop).toMatchObject({ price: 52_000_000, discountPrice: 49_500_000, subcategoryId: sub.id, conditionId: used.id, status: "active", isFeatured: true, isDeal: true, isNewArrival: false });
    expect(laptop.specifications).toEqual({ Processor: "Core i7 11th Gen", RAM: "16GB", Storage: "512GB SSD" });
    expect(await stockOf(laptop.id)).toBe(4);
    expect(await db.select().from(brands).where(eq(brands.slug, "epson"))).toHaveLength(1); // new brand created

    // Storefront: only the Active product is listed, under UK Used and Deals, with an automatic picture.
    const shop = await listProducts({ condition: ["uk-used"] });
    expect(shop.items.map((p) => p.name)).toEqual(["HP EliteBook 840 G8 Core i7"]);
    expect((await listProducts({ condition: ["uk-used"], flag: "deal" })).total).toBe(1);
    expect(shop.items[0].image).toMatch(/^\/product-art\/.+\.svg$/);
  });

  it("updates a product with the same name and condition: blank cells are kept, stock follows the sheet", async () => {
    await importProducts(await fillTemplate([{ name: "HP EliteBook 840 G8", category: "Computers", condition: "UK Used", price: 520000, stock: 4, specifications: "RAM: 16GB", featured: "Yes" }]), staff, false);
    const res = await importProducts(
      await fillTemplate([
        { name: "hp elitebook 840 g8", category: "Computers", condition: "UK Used", price: 499000, stock: 9 },
        { name: "HP EliteBook 840 G8", category: "Computers", condition: "Brand New", price: 900000, stock: 1 }, // same name, other condition = another product
      ]),
      staff,
      false,
    );
    expect(res).toMatchObject({ created: 1, updated: 1 });
    const all = await db.select().from(products).orderBy(products.sku);
    expect(all.map((p) => p.sku)).toEqual(["BHC-COM-0001", "BHC-COM-0002"]);
    expect(all[0]).toMatchObject({ price: 49_900_000, isFeatured: true, specifications: { RAM: "16GB" } });
    expect(await stockOf(all[0].id)).toBe(9); // the sheet said 9, so stock is now 9 (not 4 + 9)
  });

  it("still accepts a file that brings its own SKUs", async () => {
    const res = await importProducts([{ sku: "MY-CODE-1", name: "Canon PIXMA G3420", category: "Printers", condition: "Brand New", price: "165000" }], staff, false);
    expect(res.created).toBe(1);
    expect((await db.select().from(products))[0].sku).toBe("MY-CODE-1");
  });

  it("reports every problem with its Excel row number and saves nothing", async () => {
    const rows = await fillTemplate([
      { name: "HP ProBook 440", category: "Computers", condition: "Brand New", price: 400000 },
      { name: "X", category: "Phones", condition: "Brand New", price: 0 },
      { name: "Canon Printer", category: "Printers", subcategory: "Business Laptops", condition: "Brand New", price: 100000, discount_price: 150000, featured: "maybe" },
      { name: "hp probook 440", category: "Computers", condition: "Brand New", price: 410000 },
    ]);
    const res = await importProducts(rows, staff, false);
    expect(res.ok).toBe(false);
    expect(res.errors.map((e) => e.row)).toEqual(expect.arrayContaining([3, 4]));
    expect(res.errors.some((e) => e.row === 2)).toBe(false);
    expect(res.errors.some((e) => /Unknown category “Phones”/.test(e.message))).toBe(true);
    expect(res.errors.some((e) => /appears more than once/.test(e.message))).toBe(true);
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

describe("Serial numbers in the product import", () => {
  beforeEach(async () => {
    await resetDb();
    staff.id = await makeUser({ userType: "staff" });
    await seedCatalogue();
  });
  const row = { name: "HP EliteBook 840 G8", category: "Computers", condition: "UK Used", price: 520000 };
  const serialsOf = async (productId: string) => (await db.select().from(productSerials).where(eq(productSerials.productId, productId))).map((s) => s.serial).sort();

  it("counts the serial numbers in one cell as the stock quantity", async () => {
    const res = await importProducts(await fillTemplate([{ ...row, serial_numbers: "5cg001, 5CG002 ,5CG003,\n5CG004" }]), staff, false);
    expect(res.ok).toBe(true);
    const [p] = await db.select().from(products);
    expect(await stockOf(p.id)).toBe(4);
    expect(await serialsOf(p.id)).toEqual(["5CG001", "5CG002", "5CG003", "5CG004"]);
  });

  it("adds only new serial numbers to an existing product", async () => {
    await importProducts(await fillTemplate([{ ...row, serial_numbers: "A1, A2" }]), staff, false);
    const res = await importProducts(await fillTemplate([{ ...row, serial_numbers: "A2, A3, A4" }]), staff, false);
    const [p] = await db.select().from(products);
    expect(await stockOf(p.id)).toBe(4);
    expect(await serialsOf(p.id)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(res.notes.join(" ")).toContain("already recorded");
  });

  it("refuses repeated serial numbers and a stock quantity that disagrees", async () => {
    const twice = await importProducts(await fillTemplate([{ ...row, serial_numbers: "A1, A2, a1" }]), staff, true);
    expect(twice.ok).toBe(false);
    const mismatch = await importProducts(await fillTemplate([{ ...row, stock: 5, serial_numbers: "A1, A2" }]), staff, true);
    expect(mismatch.errors[0].message).toContain("2 serial numbers");
    const shared = await importProducts(await fillTemplate([{ ...row, serial_numbers: "A1" }, { ...row, condition: "Brand New", serial_numbers: "A1" }]), staff, true);
    expect(shared.errors[0].message).toContain("also on row");
    expect((await importProducts(await fillTemplate([{ ...row, stock: 2, serial_numbers: "A1, A2" }]), staff, true)).ok).toBe(true);
  });
});

describe("Export to Excel and import back", () => {
  beforeEach(async () => {
    await resetDb();
    staff.id = await makeUser({ userType: "staff" });
    await seedCatalogue();
  });

  it("round-trips products with their serial numbers; added serials raise the stock", async () => {
    await importProducts(
      await fillTemplate([
        { name: "HP EliteBook 840 G8", category: "Computers", subcategory: "Business Laptops", brand: "HP", condition: "UK Used", price: 520000, serial_numbers: "A1, A2", specifications: "RAM: 16GB", featured: "Yes" },
        { name: "Epson EcoTank L3250 Printer", category: "Printers", condition: "Brand New", price: 285000, stock: 7 },
      ]),
      staff,
      false,
    );
    const before = await db.select().from(products);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildProductTemplate({ withProducts: true })).buffer as ArrayBuffer);
    const ws = wb.getWorksheet("Products")!;
    const head = (ws.getRow(1).values as string[]).map((h) => String(h ?? "").replace(" *", ""));
    const hp = [2, 3].find((r) => ws.getCell(r, head.indexOf("Product name")).text.startsWith("HP"))!;
    const sn = ws.getCell(hp, head.indexOf("Serial numbers"));
    expect(sn.text).toBe("A1, A2");
    expect(ws.getCell(hp, head.indexOf("Stock quantity")).text).toBe("");

    // Unchanged export imported back: nothing moves.
    const same = await importProducts(await parseProductSheet((await wb.xlsx.writeBuffer()) as ArrayBuffer), staff, false);
    expect(same).toMatchObject({ ok: true, created: 0, updated: 2 });
    expect(await db.select().from(products)).toHaveLength(2);
    for (const p of before) expect(await stockOf(p.id)).toBe(p.name.startsWith("HP") ? 2 : 7);

    // Three more units typed into the same cell.
    sn.value = "A1, A2, A3, A4, A5";
    await importProducts(await parseProductSheet((await wb.xlsx.writeBuffer()) as ArrayBuffer), staff, false);
    const hpProduct = before.find((p) => p.name.startsWith("HP"))!;
    expect(await stockOf(hpProduct.id)).toBe(5);
    const [after] = await db.select().from(products).where(eq(products.id, hpProduct.id));
    expect(after).toMatchObject({ price: hpProduct.price, isFeatured: true, specifications: { RAM: "16GB" }, subcategoryId: hpProduct.subcategoryId, slug: hpProduct.slug });
  });
});
