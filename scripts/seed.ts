/**
 * Seeds reference data (roles, permissions, settings, categories, conditions, brands, logistics,
 * bank accounts, CMS content). Safe to re-run: existing rows are left alone.
 *
 *   npm run db:seed              → reference data + demo catalogue
 *   npm run db:seed -- --demo    → also demo customers, staff, orders & reviews (refused in production)
 *
 * Run with the react-server condition (see package.json) so server-only modules load outside Next.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { DEFAULT_ROLES, PERMISSIONS, type Permission } from "../src/lib/permissions";
import { closeDb, db } from "../src/server/db";
import * as s from "../src/server/db/schema";
import { SETTINGS_DEFAULTS } from "../src/server/settings";
import {
  BRANDS,
  CAROUSEL,
  CATEGORIES,
  CONDITIONS,
  FAQS,
  LOGISTICS_ZONES,
  PAGES,
  PRODUCTS,
  PROJECTS,
  SERVICES,
  TEAM,
  TESTIMONIALS,
  WHY_US,
} from "./seed-data";

const N = (naira: number) => Math.round(naira * 100);
const slugify = (v: string) =>
  v
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function seedRbac() {
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await db.insert(s.permissions).values({ key, module: meta.module, description: meta.description }).onConflictDoNothing();
  }
  const perms = await db.select().from(s.permissions);
  const byKey = new Map(perms.map((p) => [p.key, p.id]));
  for (const r of DEFAULT_ROLES) {
    const [existing] = await db.select().from(s.roles).where(eq(s.roles.slug, r.slug));
    const role = existing ?? (await db.insert(s.roles).values({ slug: r.slug, name: r.name, description: r.description, isSystem: true }).returning())[0];
    if (!existing) {
      const list = r.permissions === "*" ? (Object.keys(PERMISSIONS) as Permission[]) : r.permissions;
      if (list.length) await db.insert(s.rolePermissions).values(list.map((k) => ({ roleId: role.id, permissionId: byKey.get(k)! }))).onConflictDoNothing();
    }
  }
  console.log(`✓ roles (${DEFAULT_ROLES.length}) & permissions (${perms.length})`);
}

async function seedSettings() {
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    await db.insert(s.siteSettings).values({ key, value }).onConflictDoNothing();
  }
  const accounts = [
    { bankName: "Fidelity Bank", accountNumber: "5600789389", accountName: "Business-Hub Computers", sortOrder: 1 },
    { bankName: "Moniepoint", accountNumber: "6501479810", accountName: "Business-Hub Computers", sortOrder: 2 },
    { bankName: "FirstBank", accountNumber: "2042451574", accountName: "Business-Hub Computers", sortOrder: 3 },
  ];
  const existing = await db.select().from(s.paymentAccounts);
  if (!existing.length) await db.insert(s.paymentAccounts).values(accounts);
  const branches = await db.select().from(s.branches);
  if (!branches.length) {
    await db.insert(s.branches).values([
      { name: "Head Office", address: "Akinkunmi Nigeria Building, Iyaolobe, Queen Cinema, Beside Gastab Filling Station, Ibadan, Oyo State, Nigeria.", mapsQuery: "9VRM+896 Iya Olobe Oketedo Street, Ibadan 200284, Oyo, Nigeria", phone: "+234 803 394 1858", hours: "Mon–Sat, 8:30am – 6:30pm", isPrimary: true, sortOrder: 1 },
      { name: "Branch", address: "Signs and Wonders Building, Iyaolobe, Queen Cinema, Beside Gastab Filling Station, Ibadan.", mapsQuery: "Iyaolobe Queen Cinema Ibadan Oyo Nigeria", phone: "+234 803 394 1858", hours: "Mon–Sat, 8:30am – 6:30pm", sortOrder: 2 },
    ]);
  }
  const socials = await db.select().from(s.socialLinks);
  if (!socials.length) {
    await db.insert(s.socialLinks).values([
      { platform: "YouTube", url: "https://www.youtube.com/@Business-HubComputers", sortOrder: 1 },
      { platform: "TikTok", url: "https://www.tiktok.com/@bizhubb", sortOrder: 2 },
      { platform: "WhatsApp", url: "https://wa.me/2348033941858", sortOrder: 3 },
    ]);
  }
  console.log("✓ settings, bank accounts, branches, social links");
}

async function seedCatalog() {
  for (const c of CONDITIONS) await db.insert(s.productConditions).values(c).onConflictDoNothing();
  for (const c of CATEGORIES) {
    await db.insert(s.categories).values({ name: c.name, slug: c.slug, icon: c.icon, sortOrder: c.sortOrder, seoTitle: `${c.name} in Nigeria | Business Hub Computers` }).onConflictDoNothing();
    const [parent] = await db.select().from(s.categories).where(eq(s.categories.slug, c.slug));
    for (const child of c.children) {
      await db.insert(s.categories).values({ ...child, parentId: parent.id, showInMenu: true }).onConflictDoNothing();
    }
  }
  for (const [i, b] of BRANDS.entries()) await db.insert(s.brands).values({ name: b, slug: slugify(b), sortOrder: i }).onConflictDoNothing();

  const [supplier] = await db.select().from(s.suppliers).limit(1);
  const sup = supplier ?? (await db.insert(s.suppliers).values({ name: "UK Tech Imports Ltd", contactName: "Supplier Desk", email: "orders@supplier.example", phone: "+44 20 0000 0000" }).returning())[0];

  const cats = new Map((await db.select().from(s.categories)).map((c) => [c.slug, c.id]));
  const conds = new Map((await db.select().from(s.productConditions)).map((c) => [c.slug, c.id]));
  const brands = new Map((await db.select().from(s.brands)).map((b) => [b.name, b.id]));

  let created = 0;
  for (const [idx, p] of PRODUCTS.entries()) {
    const slug = slugify(p.name);
    const [exists] = await db.select({ id: s.products.id }).from(s.products).where(eq(s.products.slug, slug));
    if (exists) continue;
    const sku = `BHC-${p.category.slice(0, 3).toUpperCase()}-${String(idx + 1).padStart(4, "0")}`;
    await db.transaction(async (tx) => {
      const [prod] = await tx
        .insert(s.products)
        .values({
          sku,
          barcode: `20${String(600000000 + idx * 7919).padStart(11, "0")}`,
          name: p.name,
          slug,
          brandId: brands.get(p.brand) ?? null,
          categoryId: cats.get(p.category)!,
          subcategoryId: p.subcategory ? cats.get(p.subcategory) : null,
          conditionId: conds.get(p.condition)!,
          shortDescription: p.short,
          description: p.description,
          specifications: p.specs,
          purchasePrice: N(p.purchasePrice),
          price: N(p.price),
          discountPrice: p.discountPrice ? N(p.discountPrice) : null,
          warranty: p.warranty,
          warrantyMonths: p.warrantyMonths,
          supplierId: sup.id,
          weightGrams: p.weightGrams,
          status: "active",
          seoTitle: `${p.name} Price in Nigeria`,
          seoDescription: p.short,
          ...(p.flags ?? {}),
        })
        .returning();
      const imgs = [p.image, ...(p.images ?? [])];
      const kind = p.image.replace(/-\d$/, "");
      for (let k = 1; k <= 3; k++) if (!imgs.includes(`${kind}-${k}`)) imgs.push(`${kind}-${k}`);
      await tx.insert(s.productImages).values(imgs.slice(0, 3).map((im, i) => ({ productId: prod.id, url: `/images/catalog/${im}.svg`, alt: `${p.name} — view ${i + 1}`, sortOrder: i })));
      const variants = p.variants?.length ? p.variants : [{ name: "Default", attributes: {}, price: p.price, discountPrice: p.discountPrice, stock: p.stock }];
      for (const [vi, v] of variants.entries()) {
        const isDefault = p.variants?.length ? v.price === p.price : true;
        const [variant] = await tx
          .insert(s.productVariants)
          .values({
            productId: prod.id,
            sku: p.variants?.length ? `${sku}-${vi + 1}` : `${sku}-STD`,
            name: v.name,
            attributes: { ...v.attributes, Condition: CONDITIONS.find((c) => c.slug === p.condition)!.name },
            price: p.variants?.length ? N(v.price) : null,
            discountPrice: p.variants?.length && v.discountPrice ? N(v.discountPrice) : null,
            isDefault,
            sortOrder: vi,
          })
          .returning();
        await tx.insert(s.inventory).values({ variantId: variant.id, onHand: v.stock });
        await tx.insert(s.inventoryTransactions).values({ variantId: variant.id, type: "purchase", quantity: v.stock, onHandAfter: v.stock, reservedAfter: 0, referenceType: "seed", referenceId: "opening-stock", note: "Opening stock", idempotencyKey: `seed:${variant.id}` });
      }
    });
    created++;
  }
  console.log(`✓ catalogue: ${CATEGORIES.length} categories, ${BRANDS.length} brands, ${created} new products`);
}

async function seedLogistics() {
  const existing = await db.select({ id: s.logisticsRates.id }).from(s.logisticsRates).limit(1);
  if (existing.length) return console.log("• logistics rates exist — skipped");
  const rows: (typeof s.logisticsRates.$inferInsert)[] = [
    { state: "Oyo", city: "Ibadan", zone: "Home", method: "pickup", label: "Collect at our Ibadan store (free)", price: 0, etaDaysMin: 0, etaDaysMax: 1, sortOrder: 0, notes: "Iyaolobe, Queen Cinema — bring your order number." },
    { state: "Oyo", city: "Ibadan", zone: "Home", method: "delivery", label: "Ibadan door delivery", price: N(3_000), etaDaysMin: 0, etaDaysMax: 1, sortOrder: 1 },
    { state: "Oyo", city: null, zone: "Home", method: "delivery", label: "Oyo State door delivery", price: N(6_000), etaDaysMin: 1, etaDaysMax: 2, sortOrder: 2 },
    { state: "Oyo", city: null, zone: "Home", method: "pickup", label: "Motor park collection (Oyo State)", price: N(3_500), etaDaysMin: 1, etaDaysMax: 2, sortOrder: 3 },
  ];
  for (const z of LOGISTICS_ZONES) {
    for (const state of z.states) {
      rows.push({ state, zone: z.zone, method: "delivery", label: `${state} door delivery`, price: N(z.delivery), etaDaysMin: z.eta[0], etaDaysMax: z.eta[1], sortOrder: 1 });
      rows.push({ state, zone: z.zone, method: "pickup", label: `Motor park / agent collection (${state})`, price: N(z.pickup), etaDaysMin: z.eta[0], etaDaysMax: z.eta[1], sortOrder: 2 });
    }
  }
  rows.push({ state: "Lagos", city: "Ikeja", zone: "South-West", method: "delivery", label: "Ikeja express delivery", price: N(7_500), etaDaysMin: 1, etaDaysMax: 2, isSpecial: true, sortOrder: 0 });
  await db.insert(s.logisticsRates).values(rows);
  console.log(`✓ logistics: ${rows.length} rates covering all 37 states`);
}

async function seedContent() {
  if (!(await db.select().from(s.carouselSlides).limit(1)).length) {
    await db.insert(s.carouselSlides).values(CAROUSEL.map((c, i) => ({ ...c, sortOrder: i })));
  }
  if (!(await db.select().from(s.homepageSections).limit(1)).length) {
    const sections: (typeof s.homepageSections.$inferInsert)[] = [
      { type: "hero", title: "Hero carousel" },
      { type: "trust_bar", title: "Trust badges" },
      { type: "categories", title: "Shop by category", subtitle: "Brand new & UK used — everything IT, in one place" },
      { type: "product_rail", title: "Featured products", config: { source: "featured", limit: 10 } },
      { type: "product_rail", title: "Hot deals", subtitle: "Limited-time prices on popular devices", config: { source: "deal", limit: 10, style: "deal" } },
      { type: "collections", title: "Brand new or UK used?", subtitle: "Two ways to get the right device for your budget" },
      { type: "product_rail", title: "New arrivals", config: { source: "new", limit: 10 } },
      { type: "product_rail", title: "Brand new", config: { source: "condition", value: "brand-new", limit: 10, viewAll: "/brand-new" } },
      { type: "product_rail", title: "UK used — tested & certified", config: { source: "condition", value: "uk-used", limit: 10, viewAll: "/uk-used" } },
      { type: "product_rail", title: "Business laptops", config: { source: "category", value: "business-laptops", limit: 10, viewAll: "/categories/computers?sub=business-laptops" } },
      { type: "product_rail", title: "Gaming systems", config: { source: "category", value: "gaming-systems", limit: 10, viewAll: "/categories/computers?sub=gaming-systems" } },
      { type: "category_tabs", title: "More to explore", config: { categories: ["monitors", "accessories", "printers", "projectors", "power-station"] } },
      { type: "services", title: "Our services", subtitle: "Beyond sales — we keep your technology running" },
      { type: "setups", title: "Office, school & CBT centre setup", subtitle: "Turnkey IT for institutions of every size" },
      { type: "why_us", title: "Why choose Business Hub Computers" },
      { type: "about", title: "About us" },
      { type: "testimonials", title: "What our customers say" },
      { type: "reviews", title: "Latest product reviews" },
      { type: "projects", title: "Completed projects" },
      { type: "team", title: "Meet the team" },
      { type: "gallery", title: "Gallery" },
      { type: "contact", title: "Visit or contact us" },
      { type: "newsletter", title: "Get deals in your inbox" },
    ];
    await db.insert(s.homepageSections).values(sections.map((sec, i) => ({ ...sec, sortOrder: i, status: "published" as const })));
  }
  await db.insert(s.siteSettings).values({ key: "content_services", value: SERVICES }).onConflictDoNothing();
  await db.insert(s.siteSettings).values({ key: "content_why_us", value: WHY_US }).onConflictDoNothing();
  if (!(await db.select().from(s.teamMembers).limit(1)).length) await db.insert(s.teamMembers).values(TEAM.map((t, i) => ({ ...t, sortOrder: i })));
  if (!(await db.select().from(s.projects).limit(1)).length) {
    const imgs = ["/images/banners/hero-setup.svg", "/images/catalog/desktop-1.svg", "/images/catalog/projector-1.svg", "/images/catalog/monitor-2.svg"];
    await db.insert(s.projects).values(PROJECTS.map((p, i) => ({ ...p, slug: slugify(p.title), images: [imgs[i % imgs.length]], completedAt: new Date(Date.now() - (i + 1) * 45 * 86_400_000), sortOrder: i })));
  }
  if (!(await db.select().from(s.testimonials).limit(1)).length) await db.insert(s.testimonials).values(TESTIMONIALS.map((t, i) => ({ ...t, status: "approved", sortOrder: i })));
  if (!(await db.select().from(s.faqs).limit(1)).length) await db.insert(s.faqs).values(FAQS.map((f, i) => ({ ...f, sortOrder: i })));
  for (const p of PAGES) await db.insert(s.contentPages).values({ ...p, status: "published" }).onConflictDoNothing();
  if (!(await db.select().from(s.galleryItems).limit(1)).length) {
    const g = [
      ["Showroom", "company", "/images/banners/hero-laptops.svg"],
      ["CBT centre installation", "installations", "/images/banners/hero-setup.svg"],
      ["Gaming corner", "products", "/images/banners/hero-gaming.svg"],
      ["Power solutions", "products", "/images/banners/hero-power.svg"],
      ["UK-used stock arrival", "office", "/images/banners/hero-uk-used.svg"],
      ["Printer lab", "training", "/images/catalog/printer-2.svg"],
    ];
    await db.insert(s.galleryItems).values(g.map(([title, category, imageUrl], i) => ({ title, category, imageUrl, alt: title, sortOrder: i })));
  }
  console.log("✓ CMS content: homepage, carousel, pages, team, projects, testimonials, FAQs, gallery");
}

/* ─────────────────────────── demo data (dev only) ─────────────────────────── */

async function createCredentialUser(input: { name: string; email: string; password: string; userType: "customer" | "staff"; status?: "active" | "pending" }) {
  const [existing] = await db.select().from(s.user).where(eq(s.user.email, input.email));
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(s.user).values({ id, name: input.name, email: input.email, emailVerified: true, userType: input.userType, status: input.status ?? "active" });
  await db.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(input.password) });
  return id;
}

async function seedDemo() {
  const env = process.env.VERCEL_ENV ?? process.env.APP_ENV;
  if (env === "production") throw new Error("Refusing to create demo accounts in production.");
  const password = `Demo-${randomBytes(4).toString("hex")}!Aa9`;
  const customers = [
    { surname: "Obi", firstName: "Adaeze", email: "ada.customer@example.test", phone: "08031111111", state: "Lagos", city: "Ikeja", address: "12 Allen Avenue, Ikeja" },
    { surname: "Bello", firstName: "Musa", email: "musa.customer@example.test", phone: "08032222222", state: "Kano", city: "Kano", address: "4 Zoo Road, Nassarawa" },
    { surname: "Adeyemi", firstName: "Tolu", email: "tolu.customer@example.test", phone: "08033333333", state: "Oyo", city: "Ibadan", address: "22 Ring Road, Ibadan" },
  ];
  const customerIds: string[] = [];
  for (const c of customers) {
    const id = await createCredentialUser({ name: `${c.firstName} ${c.surname}`, email: c.email, password, userType: "customer" });
    await db.insert(s.customerProfiles).values({ userId: id, surname: c.surname, firstName: c.firstName, phone: c.phone, whatsapp: c.phone, address: c.address, state: c.state, city: c.city, termsAcceptedAt: new Date() }).onConflictDoNothing();
    await db.insert(s.addresses).values({ userId: id, label: "Home", fullName: `${c.firstName} ${c.surname}`, phone: c.phone, line1: c.address, city: c.city, state: c.state, isDefault: true }).onConflictDoNothing();
    customerIds.push(id);
  }
  const roles = new Map((await db.select().from(s.roles)).map((r) => [r.slug, r.id]));
  const staff = [
    { name: "Sade Sales", email: "sales.staff@example.test", role: "sales-manager", dept: "Sales" },
    { name: "Femi Finance", email: "finance.staff@example.test", role: "finance-officer", dept: "Finance" },
    { name: "Ireti Inventory", email: "inventory.staff@example.test", role: "inventory-manager", dept: "Inventory" },
    { name: "Pat Pending", email: "pending.staff@example.test", role: null, dept: "Support", pending: true },
  ];
  for (const st of staff) {
    const id = await createCredentialUser({ name: st.name, email: st.email, password, userType: "staff", status: st.pending ? "pending" : "active" });
    const [first, last] = st.name.split(" ");
    await db.insert(s.staffProfiles).values({ userId: id, firstName: first, surname: last, phone: "08030000000", department: st.dept, position: st.dept + " staff", approval: st.pending ? "pending" : "approved" }).onConflictDoNothing();
    if (st.role) await db.insert(s.userRoles).values({ userId: id, roleId: roles.get(st.role)! }).onConflictDoNothing();
  }

  // Demo orders through the real services (same code path as production).
  const { createOrder, changeOrderStatus } = await import("../src/server/services/orders");
  const { verifyBankTransfer, submitBankTransferProof } = await import("../src/server/services/payments");
  const [finance] = await db.select().from(s.user).where(eq(s.user.email, "finance.staff@example.test"));
  const variants = await db
    .select({ id: s.productVariants.id, productId: s.productVariants.productId })
    .from(s.productVariants)
    .where(eq(s.productVariants.isDefault, true))
    .limit(12);
  const existingOrders = await db.select({ id: s.orders.id }).from(s.orders).limit(1);
  if (!existingOrders.length) {
    for (let i = 0; i < 6; i++) {
      const cid = customerIds[i % customerIds.length];
      const c = customers[i % customers.length];
      const res = await createOrder({
        userId: cid,
        lines: [{ variantId: variants[i % variants.length].id, quantity: 1 }, ...(i % 2 ? [{ variantId: variants[(i + 5) % variants.length].id, quantity: 1 }] : [])],
        fulfilment: { method: i % 3 === 0 ? "pickup" : "delivery", state: c.state, city: c.city },
        contact: { name: `${c.firstName} ${c.surname}`, email: c.email, phone: c.phone, whatsapp: c.phone, address: c.address, city: c.city, state: c.state },
        paymentMethod: "bank_transfer",
        idempotencyKey: `demo-${i}`,
      });
      if (i < 5) {
        await submitBankTransferProof({ orderId: res.orderId, userId: cid, payerName: `${c.firstName} ${c.surname}`, transferReference: `FT${100000 + i}` });
      }
      if (i < 4) {
        const [p] = await db.select().from(s.payments).where(eq(s.payments.id, res.paymentId));
        await verifyBankTransfer(p.id, { id: finance.id, email: finance.email, roleLabel: "Finance Officer" }, { amountConfirmed: p.amountExpected, note: "Demo verification" });
        const path = i < 2 ? ["processing", "ready_for_delivery", "dispatched", "delivered"] : ["processing"];
        for (const to of path) {
          await db.transaction((tx) => changeOrderStatus(tx, { orderId: res.orderId, to, actor: { id: finance.id, email: finance.email, roleLabel: "Demo" }, allowed: [to] }));
        }
      }
    }
    // Reviews on delivered orders
    const delivered = await db.select().from(s.orders).where(inArray(s.orders.status, ["delivered", "collected"]));
    for (const o of delivered) {
      const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, o.id));
      for (const it of items) {
        if (!it.productId || !o.userId) continue;
        await db.insert(s.reviews).values({ productId: it.productId, userId: o.userId, orderId: o.id, rating: 5, title: "Excellent purchase", comment: "Arrived quickly and exactly as described. The team was very helpful.", isVerifiedPurchase: true, status: "approved" }).onConflictDoNothing();
        await db.execute(sql`UPDATE products SET rating_average = sub.avg, rating_count = sub.cnt FROM (SELECT product_id, avg(rating)::numeric(3,2) avg, count(*)::int cnt FROM reviews WHERE status = 'approved' GROUP BY product_id) sub WHERE products.id = sub.product_id`);
      }
    }
  }
  await db.insert(s.tasks).values([
    { title: "Photograph new UK-used stock", description: "Take product photos for the 12 new EliteBooks and upload them.", department: "Content", priority: "high", status: "assigned", deadline: new Date(Date.now() + 2 * 86_400_000) },
    { title: "Reconcile last week's transfers", description: "Match Moniepoint statement against verified transfers.", department: "Finance", priority: "medium", status: "in_progress", completion: 40, deadline: new Date(Date.now() + 86_400_000) },
  ]);

  mkdirSync(".data", { recursive: true });
  const lines = [
    "# Demo credentials (local development only — never use in production)",
    "",
    `Password for every demo account: ${password}`,
    "",
    ...customers.map((c) => `- Customer: ${c.email}`),
    ...staff.map((st) => `- Staff (${st.role ?? "pending approval"}): ${st.email}`),
    "",
    "Super Admin: created by `npm run admin:bootstrap` from ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD.",
  ];
  writeFileSync(".data/demo-credentials.md", lines.join("\n"));
  console.log("✓ demo customers, staff, orders, reviews, tasks — credentials written to .data/demo-credentials.md");
}

async function main() {
  const t = Date.now();
  await seedRbac();
  await seedSettings();
  await seedCatalog();
  await seedLogistics();
  await seedContent();
  if (process.argv.includes("--demo")) await seedDemo();
  // keep ratings consistent
  await db.execute(sql`UPDATE products SET rating_count = 0 WHERE rating_count IS NULL`);
  console.log(`✓ seed complete in ${Date.now() - t}ms`);
  await closeDb();
}

main().catch(async (e) => {
  console.error("✗ seed failed:", e);
  await closeDb();
  process.exit(1);
});

