import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { applyBps, type Kobo } from "@/lib/money";
import { db, type Executor } from "../db";
import {
  couponRedemptions,
  coupons,
  discounts,
  inventory,
  logisticsRates,
  productImages,
  productVariants,
  products,
} from "../db/schema";
import { UserError } from "../errors";
import { getSettingsFor } from "../settings";

/**
 * THE single source of truth for money. Checkout, Paystack initialisation, bank transfer and POS
 * all call `quote()`. The browser only ever sends variant ids, quantities, a coupon code and a
 * location — never prices, discounts, VAT, logistics or totals.
 *
 * Formula (spec §102):
 *   subtotal     = Σ list price × qty
 *   discount     = product/automatic discounts + coupon discount
 *   VAT          = rate × taxable goods after discount (+ logistics if configured)
 *   grand total  = subtotal − discount + VAT + logistics
 */

export type QuoteLineInput = { variantId: string; quantity: number };

export type Fulfilment =
  | { method: "delivery"; state: string; city: string; rateId?: string | null }
  | { method: "pickup"; state: string; city: string; rateId?: string | null }
  | { method: "in_store" }; // POS — no logistics

export type QuoteLine = {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  image: string | null;
  quantity: number;
  listPrice: Kobo;
  unitPrice: Kobo;
  productDiscount: Kobo; // (list − unit) × qty
  couponDiscount: Kobo;
  lineTotal: Kobo; // unit × qty (before coupon)
  vatExempt: boolean;
  available: number;
  warranty: string | null;
  categoryId: string;
  brandId: string | null;
};

export type QuoteIssue = { variantId?: string; code: "unavailable" | "insufficient_stock" | "coupon" | "logistics"; message: string };

export type Quote = {
  lines: QuoteLine[];
  subtotal: Kobo;
  productDiscount: Kobo;
  couponDiscount: Kobo;
  discountTotal: Kobo;
  coupon: { id: string; code: string } | null;
  logistics: { rateId: string | null; label: string; fee: Kobo; etaDaysMin: number; etaDaysMax: number } | null;
  vatRateBps: number;
  vatAmount: Kobo;
  grandTotal: Kobo;
  currency: string;
  issues: QuoteIssue[];
};

type QuoteOptions = {
  lines: QuoteLineInput[];
  couponCode?: string | null;
  fulfilment?: Fulfilment | null;
  userId?: string | null;
  /** Extra discount entered by authorised POS staff (kobo), applied after coupon. */
  manualDiscount?: Kobo;
  now?: Date;
};

function isLive(start: Date | null, end: Date | null, now: Date) {
  return (!start || start <= now) && (!end || end >= now);
}

export async function quote(opts: QuoteOptions, tx: Executor = db): Promise<Quote> {
  const now = opts.now ?? new Date();
  const issues: QuoteIssue[] = [];
  const { tax, currency } = await getSettingsFor(["tax", "currency"], tx);

  // Merge duplicate variant lines and validate quantities.
  const merged = new Map<string, number>();
  for (const l of opts.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100) throw new UserError("Invalid quantity.");
    merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.quantity);
  }
  const variantIds = [...merged.keys()];
  if (!variantIds.length) {
    return emptyQuote(currency.code, tax.vatEnabled ? tax.vatRateBps : 0);
  }

  const rows = await tx
    .select({
      variantId: productVariants.id,
      variantName: productVariants.name,
      variantSku: productVariants.sku,
      variantPrice: productVariants.price,
      variantDiscount: productVariants.discountPrice,
      variantImage: productVariants.image,
      variantActive: productVariants.isActive,
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      productPrice: products.price,
      productDiscount: products.discountPrice,
      productStatus: products.status,
      productDeleted: products.deletedAt,
      vatExempt: products.vatExempt,
      warranty: products.warranty,
      categoryId: products.categoryId,
      brandId: products.brandId,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(inArray(productVariants.id, variantIds));

  const images = await tx
    .selectDistinctOn([productImages.productId], { productId: productImages.productId, url: productImages.url })
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((r) => r.productId)))
    .orderBy(productImages.productId, productImages.sortOrder);
  const imageByProduct = new Map(images.map((i) => [i.productId, i.url]));

  const activeDiscounts = (await tx.select().from(discounts).where(eq(discounts.isActive, true))).filter((d) =>
    isLive(d.startsAt, d.endsAt, now),
  );

  const lines: QuoteLine[] = [];
  for (const variantId of variantIds) {
    const quantity = merged.get(variantId)!;
    const r = rows.find((x) => x.variantId === variantId);
    if (!r || !r.variantActive || r.productStatus !== "active" || r.productDeleted) {
      issues.push({ variantId, code: "unavailable", message: `${r?.productName ?? "An item"} is no longer available.` });
      continue;
    }
    const listPrice = r.variantPrice ?? r.productPrice;
    const candidates: number[] = [listPrice];
    const sale = r.variantPrice != null ? r.variantDiscount : (r.variantDiscount ?? r.productDiscount);
    if (sale != null && sale < listPrice) candidates.push(sale);
    for (const d of activeDiscounts) {
      const applies =
        d.appliesTo === "all" ||
        (d.appliesTo === "product" && d.targetIds.includes(r.productId)) ||
        (d.appliesTo === "category" && d.targetIds.includes(r.categoryId)) ||
        (d.appliesTo === "brand" && r.brandId != null && d.targetIds.includes(r.brandId));
      if (!applies) continue;
      const off = d.type === "percentage" ? applyBps(listPrice, d.value) : d.value;
      candidates.push(Math.max(0, listPrice - off));
    }
    const unitPrice = Math.min(...candidates);
    const available = Math.max(0, (r.onHand ?? 0) - (r.reserved ?? 0));
    if (available < quantity) {
      issues.push({
        variantId,
        code: "insufficient_stock",
        message: available === 0 ? `${r.productName} is out of stock.` : `Only ${available} left of ${r.productName}.`,
      });
    }
    lines.push({
      variantId,
      productId: r.productId,
      productName: r.productName,
      productSlug: r.productSlug,
      variantName: r.variantName,
      sku: r.variantSku,
      image: r.variantImage ?? imageByProduct.get(r.productId) ?? null,
      quantity,
      listPrice,
      unitPrice,
      productDiscount: (listPrice - unitPrice) * quantity,
      couponDiscount: 0,
      lineTotal: unitPrice * quantity,
      vatExempt: r.vatExempt,
      available,
      warranty: r.warranty,
      categoryId: r.categoryId,
      brandId: r.brandId,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.listPrice * l.quantity, 0);
  const productDiscount = lines.reduce((s, l) => s + l.productDiscount, 0);
  const netGoods = subtotal - productDiscount;

  // ── Coupon ─────────────────────────────────────────────────────────
  let coupon: Quote["coupon"] = null;
  let couponDiscount = 0;
  const code = opts.couponCode?.trim().toUpperCase();
  if (code) {
    const [c] = await tx.select().from(coupons).where(eq(sql`upper(${coupons.code})`, code));
    const fail = (message: string) => issues.push({ code: "coupon", message });
    if (!c || !c.isActive || !isLive(c.startsAt, c.endsAt, now)) fail("This coupon code is invalid or has expired.");
    else if (c.usageLimit != null && c.usedCount >= c.usageLimit) fail("This coupon has reached its usage limit.");
    else if (netGoods < c.minOrderAmount) fail(`This coupon requires a minimum order of ₦${(c.minOrderAmount / 100).toLocaleString()}.`);
    else {
      let perCustomerOk = true;
      if (opts.userId && c.perCustomerLimit > 0) {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(couponRedemptions)
          .where(and(eq(couponRedemptions.couponId, c.id), eq(couponRedemptions.userId, opts.userId)));
        perCustomerOk = n < c.perCustomerLimit;
      }
      if (!perCustomerOk) fail("You have already used this coupon.");
      else {
        const eligible = lines.filter(
          (l) =>
            (c.productIds.length === 0 && c.categoryIds.length === 0) ||
            c.productIds.includes(l.productId) ||
            c.categoryIds.includes(l.categoryId),
        );
        const base = eligible.reduce((s, l) => s + l.lineTotal, 0);
        if (base <= 0) fail("This coupon does not apply to the items in your cart.");
        else {
          couponDiscount = c.type === "percentage" ? applyBps(base, Number(c.value)) : Math.min(Number(c.value), base);
          if (c.maxDiscountAmount != null) couponDiscount = Math.min(couponDiscount, c.maxDiscountAmount);
          allocate(eligible, couponDiscount);
          coupon = { id: c.id, code: c.code };
        }
      }
    }
  }

  // ── Manual POS discount (bounded by goods value) ──────────────────
  let manual = Math.max(0, Math.min(opts.manualDiscount ?? 0, netGoods - couponDiscount));
  if (manual > 0) allocate(lines, manual);
  else manual = 0;

  // ── Logistics (server-controlled rates only) ──────────────────────
  let logistics: Quote["logistics"] = null;
  const f = opts.fulfilment;
  if (f && f.method !== "in_store") {
    const rate = await resolveLogisticsRate(tx, f.method, f.state, f.city, f.rateId);
    if (!rate) {
      issues.push({ code: "logistics", message: `We don't currently ${f.method === "pickup" ? "offer collection" : "deliver"} to ${f.city}, ${f.state}. Please choose another option or contact us.` });
    } else {
      logistics = { rateId: rate.id, label: rate.label, fee: rate.price, etaDaysMin: rate.etaDaysMin, etaDaysMax: rate.etaDaysMax };
    }
  } else if (f?.method === "in_store") {
    logistics = { rateId: null, label: "In-store", fee: 0, etaDaysMin: 0, etaDaysMax: 0 };
  }

  // ── VAT ────────────────────────────────────────────────────────────
  const vatRateBps = tax.vatEnabled ? tax.vatRateBps : 0;
  const taxableGoods = lines.filter((l) => !l.vatExempt).reduce((s, l) => s + l.lineTotal - l.couponDiscount, 0);
  const taxable = taxableGoods + (tax.vatOnLogistics ? (logistics?.fee ?? 0) : 0);
  const vatAmount = vatRateBps ? applyBps(Math.max(0, taxable), vatRateBps) : 0;

  const discountTotal = productDiscount + couponDiscount + manual;
  const grandTotal = subtotal - discountTotal + vatAmount + (logistics?.fee ?? 0);

  return {
    lines,
    subtotal,
    productDiscount,
    couponDiscount: couponDiscount + manual,
    discountTotal,
    coupon,
    logistics,
    vatRateBps,
    vatAmount,
    grandTotal,
    currency: currency.code,
    issues,
  };
}

/** Spreads a discount over lines proportionally to their totals (remainder to the largest line). */
function allocate(lines: QuoteLine[], amount: number) {
  const base = lines.reduce((s, l) => s + l.lineTotal - l.couponDiscount, 0);
  if (base <= 0 || amount <= 0) return;
  let remaining = amount;
  const sorted = [...lines].sort((a, b) => b.lineTotal - a.lineTotal);
  for (const l of sorted.slice(1)) {
    const share = Math.floor(((l.lineTotal - l.couponDiscount) * amount) / base);
    l.couponDiscount += share;
    remaining -= share;
  }
  sorted[0].couponDiscount += remaining;
}

export async function resolveLogisticsRate(
  tx: Executor,
  method: "delivery" | "pickup",
  state: string,
  city: string,
  rateId?: string | null,
) {
  const candidates = await tx
    .select()
    .from(logisticsRates)
    .where(
      and(
        eq(logisticsRates.isActive, true),
        eq(logisticsRates.method, method),
        sql`lower(${logisticsRates.state}) = lower(${state.trim()})`,
      ),
    );
  const cityMatch = (r: (typeof candidates)[number]) => r.city != null && r.city.toLowerCase() === city.trim().toLowerCase();
  const usable = candidates.filter((r) => r.city == null || cityMatch(r));
  if (rateId) return usable.find((r) => r.id === rateId) ?? null;
  // Most specific (city) first, then cheapest.
  usable.sort((a, b) => Number(cityMatch(b)) - Number(cityMatch(a)) || a.price - b.price);
  return usable[0] ?? null;
}

/** Options shown to the customer for a location (all computed server-side). */
export async function logisticsOptions(state: string, city: string) {
  const rows = await db
    .select()
    .from(logisticsRates)
    .where(and(eq(logisticsRates.isActive, true), sql`lower(${logisticsRates.state}) = lower(${state.trim()})`));
  const c = city.trim().toLowerCase();
  return rows
    .filter((r) => r.city == null || r.city.toLowerCase() === c)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price)
    .map((r) => ({ id: r.id, method: r.method, label: r.label, price: r.price, etaDaysMin: r.etaDaysMin, etaDaysMax: r.etaDaysMax, notes: r.notes }));
}

function emptyQuote(currency: string, vatRateBps: number): Quote {
  return {
    lines: [],
    subtotal: 0,
    productDiscount: 0,
    couponDiscount: 0,
    discountTotal: 0,
    coupon: null,
    logistics: null,
    vatRateBps,
    vatAmount: 0,
    grandTotal: 0,
    currency,
    issues: [],
  };
}

export function assertQuoteOk(q: Quote) {
  if (!q.lines.length) throw new UserError("Your cart is empty.");
  const blocking = q.issues.filter((i) => i.code !== "coupon");
  if (blocking.length) throw new UserError(blocking.map((i) => i.message).join(" "));
  const couponIssue = q.issues.find((i) => i.code === "coupon");
  if (couponIssue) throw new UserError(couponIssue.message);
}
