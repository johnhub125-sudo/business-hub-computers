/**
 * Makes a product sheet usable however it was filled in: recognises column headings in any wording
 * or order, finds the heading row, and reads amounts, quantities, yes/no and status the way people
 * actually type them. Pure functions, so they are easy to test.
 */

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Heading → internal field. Order matters: the more specific rules come first. */
const HEADER_RULES: [RegExp, string][] = [
  [/^(sku|product code|item code|code|part (no|number)|barcode sku)$/, "sku"],
  [/serial|imei|\bs ?n\b|\bsn\b/, "serial_numbers"],
  [/dropship.*(day|lead|deliver)/, "dropship_days"],
  [/dropship/, "dropship_partner"],
  [/sub ?categ|sub ?group|sub ?type/, "subcategory"],
  [/short desc|summary|tagline/, "short_description"],
  [/spec|feature|config/, "specifications"],
  [/^description of goods$|^goods description$/, "name"],
  [/desc|details|about/, "description"],
  [/(cost|purchase|buying|buy|landing|landed) ?(price|amount)?|^cost/, "purchase_price"],
  [/discount|promo|offer|sale price|special price|now price|new price/, "discount_price"],
  [/price|amount|selling|rate|naira|^ngn$/, "price"],
  [/qty|quantity|stock|units|pcs|pieces|^no of|available|on hand|inventory/, "stock"],
  [/categ|^type$|^group$|department|class/, "category"],
  [/brand|make|manufacturer|oem|vendor/, "brand"],
  [/condition|grade|^state$|^used/, "condition"],
  [/warrant|guarantee/, "warranty"],
  [/featur|highlight|homepage/, "featured"],
  [/^deal|hot deal|on sale/, "deal"],
  [/new arriv|^new$|latest/, "new_arrival"],
  [/best ?sell|top ?sell|popular/, "best_seller"],
  [/status|visib|publish|active/, "status"],
  [/name|product|item|model|title|goods|description of goods/, "name"],
];

/** "Selling Price (₦) *" → "price". Unknown headings return null and their column is ignored. */
export function headerKey(heading: string): string | null {
  const h = norm(heading);
  if (!h) return null;
  // "Featured" must not be read as "specifications" (feature) — exact flag words win.
  if (/^featured$/.test(h)) return "featured";
  for (const [re, key] of HEADER_RULES) if (re.test(h)) return key;
  return null;
}

/**
 * Finds the heading row (any of the first 15 rows) and turns the grid into rows keyed by field.
 * `__row` keeps the spreadsheet row number for messages.
 */
export function gridToRows(grid: string[][]): { rows: Record<string, string>[]; columns: string[]; ignored: string[] } | null {
  let best = { at: -1, score: 0, keys: [] as (string | null)[] };
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const keys: (string | null)[] = [];
    const used = new Set<string>();
    for (const cell of grid[r] ?? []) {
      const k = headerKey(cell ?? "");
      // A field is taken by the first column that claims it.
      keys.push(k && !used.has(k) ? k : null);
      if (k) used.add(k);
    }
    const score = used.size + (used.has("name") ? 3 : 0);
    if (used.has("name") && score > best.score) best = { at: r, score, keys };
  }
  if (best.at < 0) return null;
  const rows: Record<string, string>[] = [];
  for (let r = best.at + 1; r < grid.length; r++) {
    const out: Record<string, string> = {};
    let any = false;
    best.keys.forEach((k, c) => {
      const v = (grid[r]?.[c] ?? "").trim();
      if (k && v) {
        out[k] = v;
        any = true;
      }
    });
    if (any) rows.push({ ...out, __row: String(r + 1) });
  }
  const headings = grid[best.at] ?? [];
  return {
    rows,
    columns: best.keys.filter((k): k is string => Boolean(k)),
    ignored: headings.filter((h, i) => h?.trim() && !best.keys[i]).map((h) => h.trim()),
  };
}

/** "₦450,000" · "450k" · "1.2m" · "N 450 000.00" · "450000" → naira as a number; null if no amount. */
export function lenientAmount(input: string | undefined): number | null {
  if (!input) return null;
  const s = input.toLowerCase().replace(/[₦,\s]|ngn|naira|^n(?=\d)/g, "");
  const m = /(-?\d+(?:\.\d+)?)(k|m)?/.exec(s);
  if (!m) return null;
  let v = Number(m[1]);
  if (m[2] === "k") v *= 1_000;
  if (m[2] === "m") v *= 1_000_000;
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100) / 100;
}

/** "5" · "5 pcs" · "05" · "5.0" → 5; null if no whole number can be read. */
export function lenientCount(input: string | undefined): number | null {
  if (!input) return null;
  const m = /-?\d+(?:\.\d+)?/.exec(input.replace(/,/g, ""));
  if (!m) return null;
  const v = Math.round(Number(m[0]));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** Yes/No in any of the usual spellings. Anything unclear is treated as blank (no change). */
export function lenientYesNo(input: string | undefined): boolean | undefined {
  if (!input) return undefined;
  const v = input.trim().toLowerCase();
  if (/^(y|yes|yeah|yep|true|1|x|✓|✔|on|ok)$/.test(v)) return true;
  if (/^(n|no|nope|false|0|-|off|none)$/.test(v)) return false;
  return undefined;
}

export function lenientStatus(input: string | undefined): "active" | "draft" | "archived" {
  const v = (input ?? "").trim().toLowerCase();
  if (/draft|hidden|hide|private|unpublish|inactive|^no$|off/.test(v)) return "draft";
  if (/archiv|discontinu|retired/.test(v)) return "archived";
  return "active";
}

/** "sn1, sn2 ,SN3" → ["SN1", "SN2", "SN3"]. Also splits on spaces when the cell has no commas. */
export function parseSerials(text: string): string[] {
  let parts = text.split(/[,;\n\r\t|/]+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 1 && /\s/.test(parts[0]) && parts[0].split(/\s+/).every((p) => p.length >= 4)) parts = parts[0].split(/\s+/);
  return parts.map((x) => x.replace(/\s+/g, " ").toUpperCase()).filter((x) => x.length <= 64);
}

/** "Processor: Core i5; RAM - 8GB" → { Processor: "Core i5", RAM: "8GB" }. Free text is kept as "Details". */
export function parseSpecifications(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(/[;\n|]+/)) {
    const m = /^\s*([^:=]{1,60}?)\s*(?::|=|\s-\s)\s*(.+)$/.exec(part);
    if (m && m[2].trim() && Object.keys(out).length < 40) out[m[1].trim()] = m[2].trim().slice(0, 300);
  }
  if (!Object.keys(out).length && text.trim()) out.Details = text.trim().slice(0, 300);
  return out;
}

/** 0…1 similarity of two names (bigram overlap), for catching typos like "Computrs". */
export function similarity(a: string, b: string): number {
  const x = norm(a).replace(/ /g, "");
  const y = norm(b).replace(/ /g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let both = 0;
  for (const [g, n] of gx) both += Math.min(n, gy.get(g) ?? 0);
  return (2 * both) / (x.length - 1 + (y.length - 1)) || 0;
}

/** Exact name/slug, then singular/plural, then the closest name above `min` similarity. */
export function bestMatch<T extends { name: string; slug: string }>(list: T[], value: string, min = 0.78): T | undefined {
  const v = norm(value);
  if (!v) return undefined;
  const plain = (s: string) => norm(s).replace(/s\b/g, "");
  const exact = list.find((x) => norm(x.name) === v || x.slug === v.replace(/ /g, "-")) ?? list.find((x) => plain(x.name) === plain(value));
  if (exact) return exact;
  let top: { item?: T; score: number } = { score: 0 };
  for (const item of list) {
    const score = similarity(item.name, value);
    if (score > top.score) top = { item, score };
  }
  return top.score >= min ? top.item : undefined;
}

/** "used", "tokunbo", "foreign used" → the shop's UK Used condition; "new", "sealed" → Brand New. */
export function conditionFor<T extends { name: string; slug: string }>(list: T[], value: string): T | undefined {
  const v = norm(value);
  const named = (re: RegExp) => list.find((c) => re.test(norm(c.name)));
  if (/refurb/.test(v)) return named(/refurb/) ?? named(/used/);
  if (/used|tokunbo|foreign|uk|pre owned|second|fairly|open box/.test(v)) return named(/uk used/) ?? named(/used/);
  if (/new|sealed|^bn$|brand/.test(v)) return named(/brand new/) ?? named(/new/);
  return bestMatch(list, value, 0.6);
}

/** Category keywords per kind of device, to place a product whose category was left blank. */
export const KIND_CATEGORY_HINTS: Record<string, RegExp> = {
  laptop: /laptop|computer|notebook/,
  gaming: /gaming|laptop|computer/,
  desktop: /desktop|computer|pc/,
  monitor: /monitor|display|computer/,
  printer: /printer|print/,
  projector: /projector/,
  power: /power|solar|energy|inverter/,
  ups: /ups|power|inverter/,
  keyboard: /accessor|keyboard|peripheral/,
  mouse: /accessor|mouse|peripheral/,
  headset: /accessor|audio|headset|sound/,
  phone: /phone|tablet|mobile|gadget/,
  storage: /storage|accessor|drive/,
  network: /network|router|accessor/,
  accessory: /accessor/,
};

/** Title case for names typed in all capitals or all lower case ("CHARGERS" → "Chargers"). */
export function tidyName(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t === t.toUpperCase() || t === t.toLowerCase() ? t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : t;
}
