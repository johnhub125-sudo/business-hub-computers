/**
 * Works out what kind of device a product is, from its name and category. Drives the automatic
 * product picture (server-rendered) and the interactive 3D model, so both always match.
 */
export const PRODUCT_KINDS = ["laptop", "gaming", "desktop", "monitor", "printer", "projector", "power", "ups", "keyboard", "mouse", "headset", "phone", "storage", "network", "accessory"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const KIND_LABEL: Record<ProductKind, string> = {
  laptop: "Laptop",
  gaming: "Gaming laptop",
  desktop: "Desktop PC",
  monitor: "Monitor",
  printer: "Printer",
  projector: "Projector",
  power: "Power station",
  ups: "UPS",
  keyboard: "Keyboard",
  mouse: "Mouse",
  headset: "Headset",
  phone: "Phone / tablet",
  storage: "Storage drive",
  network: "Router / network",
  accessory: "Accessory",
};

// First match wins. The product name is checked before the category, because it is more specific
// ("HP Wireless Mouse" in Accessories is a mouse).
const RULES: [RegExp, ProductKind][] = [
  [/\b(ups|uninterruptible|inverter)\b/, "ups"],
  [/\b(power ?station|power ?bank|solar generator|battery pack|ecoflow|bluetti|jackery)\b/, "power"],
  [/\b(projector|beamer)\b/, "projector"],
  [/\b(printer|laserjet|deskjet|officejet|inkjet|ecotank|scanner|photocopier|copier)\b/, "printer"],
  [/\b(monitor|display|curved screen)\b/, "monitor"],
  [/\b(keyboard)\b/, "keyboard"],
  [/\b(mouse|trackpad|trackball)\b/, "mouse"],
  [/\b(headset|headphone|headphones|earbud|earbuds|earphone|earphones|airpods|speaker)\b/, "headset"],
  [/\b(router|switch|access point|modem|mifi|wi-?fi extender|network)\b/, "network"],
  [/\b(ssd|hdd|hard drive|hard disk|flash drive|usb drive|pendrive|memory card|sd card|nas)\b/, "storage"],
  [/\b(phone|smartphone|iphone|ipad|tablet|galaxy tab)\b/, "phone"],
  [/\b(gaming|rog|predator|legion|alienware|omen|nitro|tuf)\b/, "gaming"],
  [/\b(desktop|tower|workstation|all[- ]in[- ]one|aio|mini pc|optiplex|prodesk|elitedesk|thinkcentre|imac|cpu unit)\b/, "desktop"],
  [/\b(laptop|notebook|macbook|chromebook|ultrabook|thinkpad|elitebook|probook|latitude|inspiron|pavilion|ideapad|vivobook|zenbook|surface)\b/, "laptop"],
];

const CATEGORY_RULES: [RegExp, ProductKind][] = [
  [/gaming/, "gaming"],
  [/desktop|workstation/, "desktop"],
  [/laptop|computer/, "laptop"],
  [/monitor/, "monitor"],
  [/printer/, "printer"],
  [/projector/, "projector"],
  [/power|battery/, "power"],
];

export function productKind(input: { name: string; category?: string | null; subcategory?: string | null }): ProductKind {
  const name = input.name.toLowerCase();
  for (const [re, kind] of RULES) if (re.test(name)) return kind;
  const cat = `${input.subcategory ?? ""} ${input.category ?? ""}`.toLowerCase();
  for (const [re, kind] of CATEGORY_RULES) if (re.test(cat)) return kind;
  return "accessory";
}

const ACCENTS = ["#3B82F6", "#D62828", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4", "#EC4899", "#14B8A6"];

/** Stable accent colour per product (same product → same colour everywhere). */
export function kindAccent(seed: string, kind?: ProductKind): string {
  if (kind === "gaming") return "#D62828";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

const SPEC_PRIORITY = [/processor|cpu|chip/i, /ram|memory/i, /storage|ssd|hdd|disk/i, /display|screen|size|resolution/i, /graphics|gpu/i, /capacity|output|power|wattage/i, /speed|ppm|lumens|refresh/i];

/** Up to `max` short spec values to print on the picture, most important first. */
export function headlineSpecs(specs: Record<string, string> | null | undefined, max = 3): string[] {
  const entries = Object.entries(specs ?? {}).filter(([, v]) => v && v.trim());
  const picked: string[] = [];
  const used = new Set<string>();
  for (const re of SPEC_PRIORITY) {
    const hit = entries.find(([k]) => re.test(k) && !used.has(k));
    if (hit) {
      used.add(hit[0]);
      picked.push(hit[1].trim());
    }
    if (picked.length >= max) return picked;
  }
  for (const [k, v] of entries) {
    if (picked.length >= max) break;
    if (!used.has(k)) picked.push(v.trim());
  }
  return picked;
}

/* ---------------- automatic picture URLs ---------------- */

/** Seeded demo illustrations count as "no real photo yet". */
export const isPlaceholderImage = (url: string | null | undefined) => !url || url.startsWith("/images/catalog/");
/** True for an automatic picture address (built in src/server/product-art-url.ts). */
export const isProductArt = (url: string | null | undefined) => Boolean(url?.startsWith("/product-art/"));
