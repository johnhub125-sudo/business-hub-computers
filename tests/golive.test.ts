import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { appSecrets, cartItems, carts, categories, inventory, productConditions, productVariants, products } from "@/server/db/schema";
import { paystackConfig, paystackKeys, paystackWebhookSecrets } from "@/server/integrations/paystack";
import { listProducts, searchSuggestions } from "@/server/queries/catalog";
import { deleteSecrets, getSecret, maskHint, secretHints, setSecret } from "@/server/secrets";
import { importProducts, saveProduct } from "@/server/services/products";
import { makeUser, resetDb } from "./support/fixtures";

const staff = { id: "", email: "admin@example.test", roleLabel: "Super Admin" };

async function base() {
  const [cat] = await db.insert(categories).values({ name: "Computers", slug: "computers" }).returning();
  const [cond] = await db.insert(productConditions).values({ name: "Brand New", slug: "brand-new", isCollection: true }).returning();
  return { cat, cond };
}

/** A placeholder product exactly as the seed creates it: no creator, never edited, with stock. */
async function demoProduct(catId: string, condId: string, name: string, edited = false) {
  const now = new Date();
  const [p] = await db
    .insert(products)
    .values({ sku: `DEMO-${name}`, name, slug: `demo-${name.toLowerCase()}`, categoryId: catId, conditionId: condId, price: 10_000_000, status: "active", createdAt: now, updatedAt: edited ? new Date(now.getTime() + 60_000) : now })
    .returning();
  const [v] = await db.insert(productVariants).values({ productId: p.id, sku: `DEMO-${name}-STD`, isDefault: true }).returning();
  await db.insert(inventory).values({ variantId: v.id, onHand: 7 });
  return { p, v };
}

describe("Paystack keys entered in the admin", () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("PAYSTACK_TEST_SECRET_KEY", "sk_test_fromenvironment0000");
    vi.stubEnv("PAYSTACK_TEST_PUBLIC_KEY", "pk_test_fromenvironment0000");
    vi.stubEnv("PAYSTACK_LIVE_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_LIVE_PUBLIC_KEY", "");
    await deleteSecrets(["paystack.test.public", "paystack.test.secret", "paystack.live.public", "paystack.live.secret"]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stores keys encrypted and only ever exposes a masked hint", async () => {
    const secret = "sk_live_abcdefghijklmnop1234";
    await setSecret("paystack.live.secret", secret, null);
    const [row] = await db.select().from(appSecrets).where(eq(appSecrets.key, "paystack.live.secret"));
    expect(row.ciphertext).not.toContain("abcdefghijklmnop");
    expect(row.ciphertext.startsWith("v1.")).toBe(true);
    expect(row.hint).toBe("sk_live_••••1234");
    expect(maskHint(secret)).toBe("sk_live_••••1234");
    expect(await getSecret("paystack.live.secret")).toBe(secret);
    expect(JSON.stringify([...(await secretHints(["paystack.live.secret"])).values()])).not.toContain("abcdefghijklmnop");
  });

  it("cannot be read back with a different master secret", async () => {
    await setSecret("paystack.live.secret", "sk_live_abcdefghijklmnop1234", null);
    await deleteSecrets([]); // no-op; keeps the row
    vi.stubEnv("BETTER_AUTH_SECRET", "a-completely-different-master-secret-000");
    // Bypass the short in-memory cache by reading the row through a fresh name lookup.
    const [row] = await db.select().from(appSecrets).where(eq(appSecrets.key, "paystack.live.secret"));
    await db.delete(appSecrets).where(eq(appSecrets.key, "paystack.live.secret"));
    await db.insert(appSecrets).values({ ...row, key: "paystack.live.public" });
    expect(await getSecret("paystack.live.public")).toBeNull(); // decryption fails closed → treated as not set
  });

  it("uses admin-entered keys before environment variables, and starts working immediately", async () => {
    expect(await paystackKeys("test")).toMatchObject({ secret: "sk_test_fromenvironment0000", source: "environment" });
    expect((await paystackKeys("live")).source).toBeNull();

    await setSecret("paystack.test.public", "pk_test_enteredinadmin00001", null);
    await setSecret("paystack.test.secret", "sk_test_enteredinadmin00001", null);
    expect(await paystackKeys("test")).toMatchObject({ secret: "sk_test_enteredinadmin00001", publicKey: "pk_test_enteredinadmin00001", source: "admin" });
    expect(await paystackConfig()).toMatchObject({ mode: "test", configured: true, secret: "sk_test_enteredinadmin00001" });
    // Webhooks signed with either the new or the old key are still recognised.
    expect(await paystackWebhookSecrets()).toEqual(expect.arrayContaining(["sk_test_enteredinadmin00001", "sk_test_fromenvironment0000"]));

    await deleteSecrets(["paystack.test.public", "paystack.test.secret"]);
    expect((await paystackKeys("test")).source).toBe("environment");
  });
});

describe("placeholder products and stock sync", () => {
  beforeEach(async () => {
    await resetDb();
    staff.id = await makeUser({ userType: "staff" });
  });

  it("removes untouched placeholders as soon as real products are imported", async () => {
    const { cat, cond } = await base();
    const untouched = await demoProduct(cat.id, cond.id, "Alpha");
    const adopted = await demoProduct(cat.id, cond.id, "Beta", true); // staff edited it → it is theirs now
    const [cart] = await db.insert(carts).values({ guestToken: "guest-1" }).returning();
    await db.insert(cartItems).values({ cartId: cart.id, variantId: untouched.v.id, quantity: 1 });

    const res = await importProducts([{ name: "HP EliteBook 840 G8", category: "Computers", condition: "Brand New", price: "520000", stock: "4" }], staff, false);
    expect(res.created).toBe(1);
    expect(res.notes.join(" ")).toMatch(/1 placeholder product/);

    const names = (await listProducts({})).items.map((p) => p.name).sort();
    expect(names).toEqual(["Beta", "HP EliteBook 840 G8"]);
    const [gone] = await db.select().from(products).where(eq(products.id, untouched.p.id));
    expect(gone.deletedAt).not.toBeNull();
    expect((await db.select().from(inventory).where(eq(inventory.variantId, untouched.v.id)))[0].onHand).toBe(0);
    expect(await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id))).toHaveLength(0);
    expect((await db.select().from(products).where(eq(products.id, adopted.p.id)))[0].deletedAt).toBeNull();
  });

  it("also clears placeholders when the first product is added with the form", async () => {
    const { cat, cond } = await base();
    await demoProduct(cat.id, cond.id, "Alpha");
    await saveProduct({ name: "Dell Latitude 5420", sku: "DL-5420", categoryId: cat.id, conditionId: cond.id, price: "450000", status: "active", variants: [{ name: "Standard", sku: "DL-5420-STD", isDefault: true, openingStock: 2 }] }, staff);
    expect((await listProducts({})).items.map((p) => p.name)).toEqual(["Dell Latitude 5420"]);
  });

  it("sets stock to the number in the sheet on re-import, and leaves it alone when blank", async () => {
    await base();
    const row = { name: "HP EliteBook 840 G8", category: "Computers", condition: "Brand New", price: "520000" };
    await importProducts([{ ...row, stock: "4" }], staff, false);
    const [p] = await db.select().from(products);
    const stock = async () => (await db.select({ onHand: inventory.onHand }).from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).where(eq(productVariants.productId, p.id)))[0].onHand;
    expect(await stock()).toBe(4);

    const again = await importProducts([{ ...row, price: "500000", stock: "9" }], staff, false);
    expect(again).toMatchObject({ created: 0, updated: 1 });
    expect(again.notes.join(" ")).toMatch(/Stock updated on 1/);
    expect(await stock()).toBe(9);

    await importProducts([{ ...row, stock: "" }], staff, false);
    expect(await stock()).toBe(9); // blank = unchanged
    await importProducts([{ ...row, stock: "0" }], staff, false);
    expect(await stock()).toBe(0); // an explicit 0 is honoured
  });
});

describe("dropshipping", () => {
  beforeEach(async () => {
    await resetDb();
    staff.id = await makeUser({ userType: "staff" });
    await base();
  });

  it("keeps partner goods out of the normal shop and on their own listing", async () => {
    await importProducts(
      [
        { name: "HP EliteBook 840 G8", category: "Computers", condition: "Brand New", price: "520000", stock: "4" },
        { name: "Industrial Label Printer ZT411", category: "Computers", condition: "Brand New", price: "900000", stock: "10", dropship_partner: "TechSource Ltd", dropship_days: "7" },
      ],
      staff,
      false,
    );
    expect((await listProducts({})).items.map((p) => p.name)).toEqual(["HP EliteBook 840 G8"]);
    const drop = await listProducts({ fulfilment: "dropship" });
    expect(drop.items).toHaveLength(1);
    expect(drop.items[0]).toMatchObject({ name: "Industrial Label Printer ZT411", fulfilment: "dropship", dropshipLeadDays: 7 });
    expect((await listProducts({ fulfilment: "all" })).total).toBe(2);
    expect(await searchSuggestions("Industrial")).toHaveLength(0); // public search never reveals them
    const [row] = await db.select().from(products).where(eq(products.fulfilment, "dropship"));
    expect(row.dropshipPartner).toBe("TechSource Ltd");
  });

  it("requires a partner name for a dropship product added with the form", async () => {
    const [cat] = await db.select().from(categories);
    const [cond] = await db.select().from(productConditions);
    await expect(saveProduct({ name: "Partner Item", sku: "PI-1", categoryId: cat.id, conditionId: cond.id, price: "1000", status: "active", fulfilment: "dropship", variants: [{ name: "Standard", sku: "PI-1-STD" }] }, staff)).rejects.toThrow();
  });
});
