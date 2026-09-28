import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { discounts, siteSettings } from "@/server/db/schema";
import { quote } from "@/server/services/pricing";
import { makeCatalog, makeCoupon, makeUser, resetDb } from "./support/fixtures";

beforeEach(resetDb);

describe("pricing.quote (server-side totals)", () => {
  it("computes subtotal, 7.5% VAT, city logistics and grand total", async () => {
    const { variant } = await makeCatalog({ price: 50_000_000 });
    const q = await quote({ lines: [{ variantId: variant.id, quantity: 2 }], fulfilment: { method: "delivery", state: "Oyo", city: "Ibadan" } });
    expect(q.issues).toEqual([]);
    expect(q.subtotal).toBe(100_000_000);
    expect(q.logistics?.fee).toBe(150_000); // city rate beats state rate
    expect(q.vatRateBps).toBe(750);
    expect(q.vatAmount).toBe(7_500_000);
    expect(q.grandTotal).toBe(100_000_000 + 7_500_000 + 150_000);
  });

  it("falls back to the state-wide rate and reports unsupported locations", async () => {
    const { variant } = await makeCatalog();
    const oyo = await quote({ lines: [{ variantId: variant.id, quantity: 1 }], fulfilment: { method: "delivery", state: "oyo", city: "Ogbomoso" } });
    expect(oyo.logistics?.fee).toBe(300_000);
    const kano = await quote({ lines: [{ variantId: variant.id, quantity: 1 }], fulfilment: { method: "delivery", state: "Kano", city: "Kano" } });
    expect(kano.logistics).toBeNull();
    expect(kano.issues.some((i) => i.code === "logistics")).toBe(true);
  });

  it("applies product discount price and shows it in the discount line", async () => {
    const { variant } = await makeCatalog({ price: 50_000_000, discountPrice: 45_000_000 });
    const q = await quote({ lines: [{ variantId: variant.id, quantity: 1 }] });
    expect(q.subtotal).toBe(50_000_000);
    expect(q.productDiscount).toBe(5_000_000);
    expect(q.vatAmount).toBe(3_375_000); // 7.5% of 450,000
    expect(q.grandTotal).toBe(50_000_000 - 5_000_000 + 3_375_000);
  });

  it("applies automatic discounts only while active", async () => {
    const { variant, category } = await makeCatalog({ price: 10_000_000 });
    await db.insert(discounts).values({ name: "10% computers", type: "percentage", value: 1000, appliesTo: "category", targetIds: [category.id] });
    await db.insert(discounts).values({ name: "expired", type: "percentage", value: 5000, appliesTo: "all", endsAt: new Date(Date.now() - 1000) });
    const q = await quote({ lines: [{ variantId: variant.id, quantity: 1 }] });
    expect(q.lines[0].unitPrice).toBe(9_000_000);
  });

  it("validates coupons: percentage with cap, minimum order, per-customer limit", async () => {
    const { variant } = await makeCatalog({ price: 10_000_000 });
    const userId = await makeUser();
    await makeCoupon({ code: "SAVE10", type: "percentage", value: 1000, maxDiscountAmount: 500_000 });
    await makeCoupon({ code: "BIGSPEND", type: "fixed", value: 100_000, minOrderAmount: 50_000_000 });
    const q = await quote({ lines: [{ variantId: variant.id, quantity: 1 }], couponCode: "save10", userId });
    expect(q.coupon?.code).toBe("SAVE10");
    expect(q.couponDiscount).toBe(500_000); // capped
    expect(q.vatAmount).toBe(712_500); // 7.5% × (100,000 − 5,000)
    const min = await quote({ lines: [{ variantId: variant.id, quantity: 1 }], couponCode: "BIGSPEND" });
    expect(min.coupon).toBeNull();
    expect(min.issues[0].code).toBe("coupon");
    const bad = await quote({ lines: [{ variantId: variant.id, quantity: 1 }], couponCode: "NOPE" });
    expect(bad.issues[0].message).toMatch(/invalid/);
  });

  it("respects VAT exemption and configurable VAT settings", async () => {
    const { variant } = await makeCatalog({ price: 10_000_000, vatExempt: true });
    const exempt = await quote({ lines: [{ variantId: variant.id, quantity: 1 }] });
    expect(exempt.vatAmount).toBe(0);
    await db.insert(siteSettings).values({ key: "tax", value: { vatEnabled: true, vatRateBps: 1000, vatOnLogistics: true } });
    const { variant: v2 } = await makeCatalog({ price: 10_000_000 });
    const q = await quote({ lines: [{ variantId: v2.id, quantity: 1 }], fulfilment: { method: "delivery", state: "Oyo", city: "Ibadan" } });
    expect(q.vatAmount).toBe(1_000_000 + 15_000); // 10% of goods + logistics
  });

  it("flags insufficient stock and unavailable products", async () => {
    const { variant } = await makeCatalog({ stock: 1 });
    const q = await quote({ lines: [{ variantId: variant.id, quantity: 3 }] });
    expect(q.issues[0]).toMatchObject({ code: "insufficient_stock" });
    await expect(quote({ lines: [{ variantId: variant.id, quantity: 0 }] })).rejects.toThrow(/quantity/i);
  });
});
