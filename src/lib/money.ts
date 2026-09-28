/**
 * All money is integer minor units (kobo for NGN). Never use floats for amounts.
 * Rates are integer basis points (750 = 7.5%).
 */

export type Kobo = number;

export function assertKobo(value: number, label = "amount"): Kobo {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer number of minor units`);
  return value;
}

/** Converts a naira amount typed by an admin ("125,000.50") into kobo without float drift. */
export function nairaToKobo(input: string | number): Kobo {
  const raw = String(input).replace(/[,\s₦]/g, "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) throw new Error(`Invalid amount: ${input}`);
  const negative = raw.startsWith("-");
  const [whole, frac = ""] = raw.replace("-", "").split(".");
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -kobo : kobo;
}

export function koboToNairaString(kobo: Kobo): string {
  const negative = kobo < 0;
  const abs = Math.abs(kobo);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${negative ? "-" : ""}${whole}.${String(frac).padStart(2, "0")}`;
}

/** Percentage of an amount using basis points, rounded half-up to the nearest kobo. */
export function applyBps(amount: Kobo, bps: number): Kobo {
  assertKobo(amount);
  if (!Number.isInteger(bps)) throw new Error("bps must be an integer");
  // amount * bps / 10000 with half-up rounding, in integer arithmetic
  const product = amount * bps;
  const q = Math.trunc(product / 10000);
  const r = product - q * 10000;
  return r * 2 >= 10000 ? q + 1 : r * 2 <= -10000 ? q - 1 : q;
}

export function formatMoney(kobo: Kobo, currency = "NGN", locale = "en-NG"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: kobo % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
}

export function discountPercent(price: Kobo, salePrice: Kobo | null | undefined): number {
  if (!salePrice || salePrice >= price || price <= 0) return 0;
  return Math.round(((price - salePrice) / price) * 100);
}
