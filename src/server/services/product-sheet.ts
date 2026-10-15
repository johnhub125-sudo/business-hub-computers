import "server-only";
import ExcelJS from "exceljs";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { brands, categories, productConditions, productSerials, products } from "../db/schema";
import { UserError } from "../errors";
import { parseCsvGrid } from "@/lib/csv";
import { gridToRows } from "./import-tidy";

/**
 * The Excel template for adding many products at once (Admin → Products → Add product).
 * `key` is the internal field name used by importProducts(); `header` is what staff see.
 */
type Column = { key: string; header: string; width: number; required?: boolean; help: string; list?: "category" | "subcategory" | "brand" | "condition" | "yesno" | "status" };

const TEMPLATE_COLUMNS: Column[] = [
  { key: "name", header: "Product name", width: 44, required: true, help: "The full name customers will see. The product code (SKU) and web address are created for you. A row with the same name and condition as an existing product updates it." },
  { key: "category", header: "Category", width: 20, required: true, list: "category", help: "Pick from the list. Decides where the product appears in the shop menu." },
  { key: "subcategory", header: "Subcategory", width: 22, list: "subcategory", help: "Optional. Must belong to the chosen category." },
  { key: "brand", header: "Brand", width: 16, list: "brand", help: "Pick from the list or type a new brand — new brands are created for you." },
  { key: "condition", header: "Condition", width: 16, required: true, list: "condition", help: "Brand New, UK Used, etc. Puts the product under the Brand New or UK Used menu." },
  { key: "price", header: "Price (₦)", width: 14, required: true, help: "Selling price in naira, numbers only (e.g. 450000)." },
  { key: "discount_price", header: "Discount price (₦)", width: 18, help: "Optional. Lower than the price. Shows the old price crossed out." },
  { key: "purchase_price", header: "Cost price (₦)", width: 16, help: "Optional. What you paid. Never shown to customers." },
  { key: "stock", header: "Stock quantity", width: 15, help: "How many you have now. For an existing product this replaces its stock; leave blank to keep it unchanged." },
  { key: "serial_numbers", header: "Serial numbers", width: 44, help: "Optional. Type the serial number of every unit in this one cell, separated by commas, e.g. 5CG1234ABC, 5CG1234ABD, 5CG1234ABE. They are counted for you: 3 serial numbers = 3 in stock, so leave Stock quantity blank. For a product already in the shop, new serial numbers are added to its stock; ones already recorded are not counted again." },
  { key: "short_description", header: "Short description", width: 44, help: "One or two sentences shown near the price." },
  { key: "description", header: "Full description", width: 54, help: "Optional longer description." },
  { key: "specifications", header: "Specifications", width: 54, help: "Format — Name: value; Name: value. Example — Processor: Core i5; RAM: 8GB; Storage: 256GB SSD. The first three appear on the product picture." },
  { key: "warranty", header: "Warranty", width: 20, help: "E.g. 6 months warranty." },
  { key: "featured", header: "Featured", width: 11, list: "yesno", help: "Yes shows it in Featured and in the home page carousel." },
  { key: "deal", header: "Deal", width: 9, list: "yesno", help: "Yes shows it on the Deals page." },
  { key: "new_arrival", header: "New arrival", width: 13, list: "yesno", help: "Yes shows it under New arrivals." },
  { key: "best_seller", header: "Best seller", width: 13, list: "yesno", help: "Yes shows it under Best sellers." },
  { key: "status", header: "Status", width: 11, list: "status", help: "Active = visible in the shop straight away (default). Draft = saved but hidden." },
  { key: "dropship_partner", header: "Dropship partner", width: 24, help: "Only for goods supplied and shipped by another company: type that company’s name. Leave blank for goods from your own stock." },
  { key: "dropship_days", header: "Dropship delivery days", width: 22, help: "For dropship goods: usual number of days to deliver, e.g. 7." },
];

export const SHEET_COLUMNS = TEMPLATE_COLUMNS;

const MAX_ROWS = 1000;
const NAVY = "FF1B2A7B";
const RED = "FFD62828";
const colLetter = (n: number) => {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Current products as template rows, so the sheet can be edited in Excel and imported back. */
async function currentProductRows(): Promise<Record<string, string | number>[]> {
  const [rows, serials, cats] = await Promise.all([
    db
      .select({
        p: products,
        brand: brands.name,
        condition: productConditions.name,
        stock: sql<number>`coalesce((SELECT sum(i.on_hand) FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.product_id = ${products.id}),0)::int`,
      })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .innerJoin(productConditions, eq(productConditions.id, products.conditionId))
      .where(isNull(products.deletedAt))
      .orderBy(asc(products.name))
      .limit(MAX_ROWS),
    db.select({ productId: productSerials.productId, serial: productSerials.serial }).from(productSerials).where(eq(productSerials.status, "in_stock")).orderBy(asc(productSerials.serial)),
    db.select({ id: categories.id, name: categories.name }).from(categories),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const bySerial = new Map<string, string[]>();
  for (const s of serials) bySerial.set(s.productId, [...(bySerial.get(s.productId) ?? []), s.serial]);
  const yn = (v: boolean) => (v ? "Yes" : "No");
  const blankable = (o: Record<string, string | number | null | undefined>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "")) as Record<string, string | number>;
  return rows.map(({ p, brand, condition, stock }) => {
    const sn = bySerial.get(p.id) ?? [];
    return blankable({
      sku: p.sku,
      name: p.name,
      category: catName.get(p.categoryId),
      subcategory: p.subcategoryId ? catName.get(p.subcategoryId) : "",
      brand,
      condition,
      price: p.price / 100,
      discount_price: p.discountPrice != null ? p.discountPrice / 100 : null,
      purchase_price: p.purchasePrice ? p.purchasePrice / 100 : null,
      // With serial numbers the count is the quantity, so Stock stays blank (and is left unchanged on import).
      stock: sn.length || p.fulfilment === "dropship" ? null : stock,
      serial_numbers: sn.join(", "),
      short_description: p.shortDescription,
      description: p.description,
      specifications: Object.entries(p.specifications ?? {}).map(([k, v]) => `${k}: ${v}`).join("; "),
      warranty: p.warranty,
      featured: yn(p.isFeatured),
      deal: yn(p.isDeal),
      new_arrival: yn(p.isNewArrival),
      best_seller: yn(p.isBestSeller),
      status: p.status === "draft" ? "Draft" : p.status === "active" ? "Active" : p.status,
      dropship_partner: p.fulfilment === "dropship" ? p.dropshipPartner : "",
      dropship_days: p.fulfilment === "dropship" ? p.dropshipLeadDays : null,
    });
  });
}

/**
 * Builds the .xlsx template with dropdowns filled from the live categories, brands and conditions.
 * With `withProducts`, the sheet comes filled with the current products (and a SKU column that
 * identifies each one), ready to edit and import back.
 */
export async function buildProductTemplate(opts: { withProducts?: boolean } = {}): Promise<Buffer> {
  const SHEET_COLUMNS: Column[] = opts.withProducts ? [{ key: "sku", header: "SKU", width: 18, help: "Identifies the product. Do not change it. Leave blank on a new row and one is created for you." }, ...TEMPLATE_COLUMNS] : TEMPLATE_COLUMNS;
  const filled = opts.withProducts ? await currentProductRows() : [];
  const [cats, brs, conds] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select({ name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db.select({ name: productConditions.name }).from(productConditions).orderBy(asc(productConditions.sortOrder)),
  ]);
  const lists: Record<NonNullable<Column["list"]>, string[]> = {
    category: cats.filter((c) => !c.parentId).map((c) => c.name),
    subcategory: cats.filter((c) => c.parentId).map((c) => c.name),
    brand: brs.map((b) => b.name),
    condition: conds.map((c) => c.name),
    yesno: ["Yes", "No"],
    status: ["Active", "Draft"],
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Business Hub Computers";
  wb.created = new Date();

  // ── Products (the sheet staff fill in) ──
  const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  ws.columns = SHEET_COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.height = 30;
  head.eachCell((cell, i) => {
    const col = SHEET_COLUMNS[i - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.required ? RED : NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.note = col.help;
  });

  filled.forEach((r, i) => {
    SHEET_COLUMNS.forEach((c, n) => {
      if (r[c.key] !== undefined) ws.getCell(i + 2, n + 1).value = r[c.key];
    });
  });

  // ── Lists (feeds the dropdowns) ──
  const ls = wb.addWorksheet("Lists");
  const listKeys = Object.keys(lists) as (keyof typeof lists)[];
  const listRange: Partial<Record<keyof typeof lists, string>> = {};
  listKeys.forEach((k, i) => {
    const col = i + 1;
    ls.getColumn(col).width = 26;
    const title = ls.getCell(1, col);
    title.value = k === "yesno" ? "Yes / No" : k[0].toUpperCase() + k.slice(1);
    title.font = { bold: true };
    lists[k].forEach((v, r) => (ls.getCell(r + 2, col).value = v));
    if (lists[k].length) listRange[k] = `Lists!$${colLetter(col)}$2:$${colLetter(col)}$${lists[k].length + 1}`;
  });

  SHEET_COLUMNS.forEach((c, i) => {
    const letter = colLetter(i + 1);
    const range = c.list ? listRange[c.list] : undefined;
    for (let r = 2; r <= MAX_ROWS + 1; r++) {
      const cell = ws.getCell(`${letter}${r}`);
      if (range) {
        // Brands accept new names; every other list must match.
        const strict = c.list !== "brand";
        cell.dataValidation = { type: "list", allowBlank: true, formulae: [range], showErrorMessage: strict, errorStyle: "warning", errorTitle: c.header, error: `Please choose a ${c.header.toLowerCase()} from the list.` };
      } else if (["price", "discount_price", "purchase_price"].includes(c.key)) {
        cell.dataValidation = { type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, errorStyle: "warning", errorTitle: c.header, error: "Enter an amount in naira using numbers only, e.g. 450000." };
        cell.numFmt = "#,##0";
      } else if (c.key === "stock") {
        cell.dataValidation = { type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, errorStyle: "warning", errorTitle: c.header, error: "Enter a whole number, e.g. 5." };
      } else if (c.key === "serial_numbers") {
        // Text format, so Excel never turns a long numeric serial into 3.57E+14.
        cell.numFmt = "@";
        cell.alignment = { wrapText: true, vertical: "top" };
      }
    }
  });

  // ── How to use ──
  const hs = wb.addWorksheet("How to use");
  hs.getColumn(1).width = 26;
  hs.getColumn(2).width = 110;
  const lines: [string, string][] = [
    ["Add many products at once", ""],
    ["1.", "Go to the Products sheet. Fill one row per product. Only the Product name is truly needed: a missing category is worked out from the name, a missing condition becomes Brand New, and a product without a price is saved hidden (Draft) until you add one."],
    ["2.", "Use the dropdowns for Category, Subcategory, Condition and the Yes/No columns. Type a new Brand if it is not in the list."],
    ["3.", "Save the file, go back to Admin → Products → Add product, choose the file and press Check file."],
    ["4.", "Press Import. Small mistakes (a misspelt category, ₦ signs or commas in prices, “used” instead of UK Used, the same product on two rows) are corrected for you and listed on screen. Only rows without a product name are skipped."],
    ["", ""],
    ["Where products appear", "Category and Subcategory decide the shop menu. Condition puts the product under Brand New or UK Used. Featured, Deal, New arrival and Best seller add it to those sections. Status “Active” shows it immediately."],
    ["Pictures", "Every product gets an automatic 3D picture straight away. The site then looks for a real photo on the manufacturer’s website in the background and swaps it in. You can replace or remove any picture on the product’s edit page."],
    ["Product codes", "You do not enter a SKU or web address — both are created automatically for every new product."],
    ["Updating products", "A row with the same product name and condition as an existing product updates its details and price. A number in Stock quantity replaces the product’s stock; leave it blank to keep the current stock."],
    ["Serial numbers", "Put all the serial numbers of a product in its Serial numbers cell, separated by commas. The count becomes the stock, so you do not fill Stock quantity. Uploading more serial numbers for the same product later adds them to its stock."],
    ["Limit", `Up to ${MAX_ROWS.toLocaleString()} products per file.`],
    ["", ""],
    ["Column guide", ""],
    ...SHEET_COLUMNS.map((c): [string, string] => [c.required ? `${c.header} *` : c.header, c.help]),
    ["", ""],
    ["Example row", "Product name: HP EliteBook 840 G8 Core i7 · Category: Computers · Subcategory: Business Laptops · Brand: HP · Condition: UK Used · Price: 520000 · Serial numbers: 5CG1234ABC, 5CG1234ABD, 5CG1234ABE, 5CG1234ABF (= 4 in stock) · Specifications: Processor: Core i7 11th Gen; RAM: 16GB; Storage: 512GB SSD · Featured: Yes"],
  ];
  lines.forEach(([a, b], i) => {
    const row = hs.getRow(i + 1);
    row.getCell(1).value = a;
    row.getCell(2).value = b;
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).alignment = { vertical: "top" };
    row.getCell(1).font = { bold: true, color: i === 0 ? { argb: NAVY } : undefined, size: i === 0 ? 14 : 11 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A worksheet as plain text cells (numbers kept exact, formulas as their result). */
function sheetGrid(ws: ExcelJS.Worksheet): string[][] {
  const grid: string[][] = [];
  // Only rows that hold values (the template formats 1,000 empty rows).
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r > 5000) return;
    const out: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (c > 60) return;
      const v = cell.value as unknown;
      let text: string;
      if (typeof v === "number") text = String(v);
      else if (v instanceof Date) text = v.toISOString().slice(0, 10);
      else if (v && typeof v === "object" && "result" in v) text = String((v as { result: unknown }).result ?? "");
      else text = cell.text ?? "";
      out[c - 1] = text.trim();
    });
    grid[r - 1] = Array.from(out, (x) => x ?? "");
  });
  return Array.from(grid, (x) => x ?? []);
}

/**
 * Reads a product sheet into rows keyed by field. Works with our template and with any sheet that
 * has a product-name column: headings may be worded differently, in any order, below a title row,
 * and on any worksheet.
 */
export async function parseProductSheet(data: ArrayBuffer): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new UserError("That file could not be opened. Save it in Excel as “Excel Workbook (.xlsx)” or as CSV and upload it again.");
  }
  // Prefer the Products sheet, then any sheet whose headings include a product name.
  const sheets = [wb.getWorksheet("Products"), ...wb.worksheets].filter((w): w is ExcelJS.Worksheet => Boolean(w) && w!.name !== "Lists" && w!.name !== "How to use");
  for (const ws of sheets) {
    const found = gridToRows(sheetGrid(ws));
    if (found?.rows.length) return found.rows;
  }
  throw new UserError("No product list was found in the file. Make sure one column is headed “Product name” (or Item, Product, Model) with one product per row.");
}

/** Same as parseProductSheet, for CSV files. */
export function parseProductCsv(text: string): Record<string, string>[] {
  const found = gridToRows(parseCsvGrid(text));
  if (!found?.rows.length) throw new UserError("No product list was found in the file. Make sure one column is headed “Product name” (or Item, Product, Model) with one product per row.");
  return found.rows;
}
