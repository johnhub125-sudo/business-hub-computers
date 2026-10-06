import "server-only";
import { log } from "../logger";

/**
 * Finds a real photo of a product with the Brave Search image API, preferring the manufacturer's
 * own website. Never called while a customer is loading a page — only from background jobs and
 * admin actions (see services/product-photos.ts).
 */

/** Official sites and image hosts per brand (lower-case brand name → domains). */
export const VENDOR_DOMAINS: Record<string, string[]> = {
  hp: ["hp.com", "www8-hp.com", "hp-cdn.com"],
  dell: ["dell.com", "delltechnologies.com"],
  lenovo: ["lenovo.com", "static.pub"],
  apple: ["apple.com"],
  asus: ["asus.com"],
  acer: ["acer.com"],
  msi: ["msi.com"],
  microsoft: ["microsoft.com"],
  samsung: ["samsung.com"],
  lg: ["lg.com"],
  toshiba: ["toshiba.com", "dynabook.com"],
  dynabook: ["dynabook.com"],
  sony: ["sony.com"],
  huawei: ["huawei.com"],
  epson: ["epson.com", "epson.eu", "epson.co.uk"],
  canon: ["canon.com", "canon.co.uk", "canon-europe.com", "usa.canon.com"],
  brother: ["brother.com", "brother-usa.com", "brother.co.uk"],
  xerox: ["xerox.com"],
  kyocera: ["kyoceradocumentsolutions.com"],
  benq: ["benq.com"],
  viewsonic: ["viewsonic.com"],
  aoc: ["aoc.com"],
  philips: ["philips.com"],
  logitech: ["logitech.com", "logitechg.com"],
  razer: ["razer.com"],
  corsair: ["corsair.com"],
  "tp-link": ["tp-link.com"],
  tplink: ["tp-link.com"],
  "d-link": ["dlink.com"],
  cisco: ["cisco.com"],
  ubiquiti: ["ui.com"],
  mikrotik: ["mikrotik.com"],
  apc: ["apc.com", "se.com"],
  mercury: ["mercury-pc.com"],
  bluegate: ["bluegate.com.ng"],
  ecoflow: ["ecoflow.com"],
  bluetti: ["bluettipower.com"],
  jackery: ["jackery.com"],
  anker: ["anker.com"],
  sandisk: ["sandisk.com", "westerndigital.com"],
  "western digital": ["westerndigital.com"],
  wd: ["westerndigital.com"],
  seagate: ["seagate.com"],
  kingston: ["kingston.com"],
  transcend: ["transcend-info.com"],
  jbl: ["jbl.com"],
  oraimo: ["oraimo.com"],
  tecno: ["tecno-mobile.com"],
  infinix: ["infinixmobility.com"],
};

export type PhotoCandidate = { imageUrl: string; pageUrl: string; title: string; host: string; width?: number; height?: number; official: boolean };

export class ImageSearchError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
    this.name = "ImageSearchError";
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};
const onDomain = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/** "HP EliteBook 840 G8 Core i7 (UK Used)" → "HP EliteBook 840 G8 Core i7" */
export function searchTerms(name: string, brand?: string | null) {
  const cleaned = name
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(uk[- ]?used|brand[- ]?new|refurbished|open[- ]?box|pre[- ]?owned|grade ?a|tokunbo|london used)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return brand && !cleaned.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${cleaned}` : cleaned;
}

/** Model tokens are the parts with digits ("840", "g8", "m404dn") — a photo title must mention them. */
export function modelTokens(name: string) {
  const NOT_A_MODEL = [
    /^\d{1,2}$/, // "15", "8"
    /^\d+(\.\d+)?(gb|tb|mb|hz|w|kw|v|va|kva|ah|mah|wh|kwh|inch|in|mm|cm|k|p|ppm|lm)$/, // sizes and ratings
    /^i[3579]$/, // Core i5
    /^r[3579]$/, // Ryzen 5
    /^\d+(st|nd|rd|th)$/, // 11th Gen
    /^(ddr|usb|wifi|gen)\d$/,
  ];
  const tokens = name.toLowerCase().match(/[a-z]*\d[a-z0-9.-]*/g) ?? [];
  return [...new Set(tokens.map((t) => t.replace(/[.-]+$/, "")))].filter((t) => t.length >= 2 && !NOT_A_MODEL.some((re) => re.test(t))).slice(0, 4);
}

let lastCall = 0;

async function brave(query: string): Promise<{ title?: string; url?: string; properties?: { url?: string; width?: number; height?: number }; thumbnail?: { src?: string; width?: number; height?: number } }[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new ImageSearchError("Photo search is not configured (BRAVE_SEARCH_API_KEY).", false);
  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "30");
  url.searchParams.set("safesearch", "strict");
  url.searchParams.set("spellcheck", "false");
  // The free plan allows one request per second.
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch (err) {
    throw new ImageSearchError(`Photo search could not be reached: ${(err as Error).message}`, true);
  }
  if (res.status === 429) throw new ImageSearchError("The photo search allowance for now is used up. It will continue later.", true);
  if (res.status === 401 || res.status === 403) throw new ImageSearchError("The photo search key was rejected. Check BRAVE_SEARCH_API_KEY.", false);
  if (!res.ok) throw new ImageSearchError(`Photo search failed (${res.status}).`, res.status >= 500);
  const body = (await res.json()) as { results?: unknown };
  return Array.isArray(body.results) ? (body.results as never) : [];
}

/**
 * Best photo candidates for a product, official manufacturer pages first.
 * `vendorOnly` returns nothing rather than a photo from another website.
 */
export async function findProductPhotos(p: { name: string; brand?: string | null }, opts: { vendorOnly: boolean }): Promise<PhotoCandidate[]> {
  const terms = searchTerms(p.name, p.brand);
  const domains = p.brand ? (VENDOR_DOMAINS[p.brand.trim().toLowerCase()] ?? []) : [];
  const tokens = modelTokens(terms);
  const words = terms.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

  const rank = (raw: Awaited<ReturnType<typeof brave>>): PhotoCandidate[] =>
    raw
      .map((r) => {
        const imageUrl = r.properties?.url ?? "";
        const pageUrl = r.url ?? "";
        const host = hostOf(pageUrl) || hostOf(imageUrl);
        const title = (r.title ?? "").toLowerCase();
        const width = r.properties?.width ?? r.thumbnail?.width;
        const height = r.properties?.height ?? r.thumbnail?.height;
        const official = domains.length > 0 && (onDomain(hostOf(pageUrl), domains) || onDomain(hostOf(imageUrl), domains));
        const tokenHits = tokens.filter((t) => title.includes(t) || imageUrl.toLowerCase().includes(t)).length;
        const wordHits = words.filter((w) => title.includes(w)).length;
        let score = (official ? 100 : 0) + tokenHits * 25 + wordHits * 4;
        if (width && height) {
          const ratio = width / height;
          if (ratio < 0.5 || ratio > 2.2) score -= 60; // banners and strips
          if (Math.min(width, height) < 300) score -= 40;
        }
        if (/\.(svg|gif)(\?|$)/i.test(imageUrl)) score -= 200;
        if (/logo|icon|banner|sprite|placeholder|avatar/i.test(imageUrl)) score -= 80;
        // A photo must be about this model: every candidate needs at least one model token when the name has any.
        const relevant = tokens.length ? tokenHits > 0 : wordHits >= Math.min(2, words.length);
        return { c: { imageUrl, pageUrl, title: r.title ?? "", host, width, height, official }, score, relevant };
      })
      .filter((x) => x.c.imageUrl.startsWith("https://") && x.relevant && x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);

  // 1) Ask for the manufacturer's site specifically.
  if (domains.length) {
    const official = rank(await brave(`${terms} site:${domains[0]}`)).filter((c) => c.official);
    if (official.length) return official.slice(0, 5);
  }
  if (opts.vendorOnly && domains.length) return [];
  // 2) The wider web; official pages still sort first.
  const any = rank(await brave(`${terms} product photo`));
  const picked = opts.vendorOnly ? any.filter((c) => c.official) : any;
  if (!picked.length) log.info("No product photo candidates", { terms });
  return picked.slice(0, 5);
}
