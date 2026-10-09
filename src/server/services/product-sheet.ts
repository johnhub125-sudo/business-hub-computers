import "server-only";
import ExcelJS from "exceljs";
import { asc } from "drizzle-orm";
import { db } from "../db";
import { brands, categories, productConditions } from "../db/schema";
import { UserError } from "../errors";

/**
 * The Excel template for adding many products at once (Admin → Products → Add product).
 * `key` is the internal field name used by importProducts(); `header` is what staff see.
 */
type Column = { key: string; header: string; width: number; required?: boolean; help: string; list?: "category" | "subcategory" | "brand" | "condition" | "yesno" | "status" };

export const SHEET_COLUMNS: Column[] = [
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

const MAX_ROWS = 1000;
const NAVY = "FF1B2A7B";
const RED = "FFD62828";
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "");

// Header text (or the old CSV column name) → internal key.
const HEADER_KEYS = new Map<string, string>();
for (const c of SHEET_COLUMNS) {
  HEADER_KEYS.set(norm(c.header), c.key);
  HEADER_KEYS.set(norm(c.key), c.key);
}
HEADER_KEYS.set("sku", "sku"); // optional: accepted when present, generated when absent
HEADER_KEYS.set("costprice", "purchase_price");
HEADER_KEYS.set("stock", "stock");
HEADER_KEYS.set("quantity", "stock");
HEADER_KEYS.set("specs", "specifications");
for (const h of ["serial", "serials", "serialnumber", "serialno", "serialnos", "sn", "imei"]) HEADER_KEYS.set(h, "serial_numbers");

const colLetter = (n: number) => {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Builds the .xlsx template with dropdowns filled from the live categories, brands and conditions. */
export async function buildProductTemplate(): Promise<Buffer> {
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
        cell.dataValidation = { type: "list", allowBlank: true, formulae: [range], showErrorMessage: strict, errorStyle: "error", errorTitle: c.header, error: `Please choose a ${c.header.toLowerCase()} from the list.` };
      } else if (["price", "discount_price", "purchase_price"].includes(c.key)) {
        cell.dataValidation = { type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: c.header, error: "Enter an amount in naira using numbers only, e.g. 450000." };
        cell.numFmt = "#,##0";
      } else if (c.key === "stock") {
        cell.dataValidation = { type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: c.header, error: "Enter a whole number, e.g. 5." };
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
    ["1.", "Go to the Products sheet. Fill one row per product. Columns with a red heading (marked *) are required."],
    ["2.", "Use the dropdowns for Category, Subcategory, Condition and the Yes/No columns. Type a new Brand if it is not in the list."],
    ["3.", "Save the file, go back to Admin → Products → Add product, choose the file and press Check file."],
    ["4.", "If the check passes, press Import. Nothing is saved unless every row is valid, so a mistake never leaves you with half an import."],
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

/** Reads a filled template (or any .xlsx with the same headings) into rows keyed by internal field name. */
export async function parseProductSheet(data: ArrayBuffer): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new UserError("That file could not be read. Please upload the Excel template (.xlsx) or a CSV file.");
  }
  const ws = wb.getWorksheet("Products") ?? wb.worksheets[0];
  if (!ws) throw new UserError("The workbook has no sheets.");

  const keys: (string | null)[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    keys[col] = HEADER_KEYS.get(norm(cell.text ?? "")) ?? null;
  });
  if (!keys.includes("name")) throw new UserError("The first row must contain the template headings (Product name, Category, …). Download a fresh template and try again.");

  const rows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const out: Record<string, string> = {};
    let any = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = keys[col];
      if (!key) return;
      const v = cell.value;
      // Numbers come back as numbers; never let Excel's display format ("450,000") reach the parser.
      const text = (typeof v === "number" ? String(v) : (cell.text ?? "")).trim();
      if (text) {
        out[key] = text;
        any = true;
      }
    });
    if (any) rows.push({ ...out, __row: String(n) });
  });
  return rows;
}
