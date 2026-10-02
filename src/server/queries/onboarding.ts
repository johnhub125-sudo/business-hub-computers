import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { branches, categories, contentPages, inventory, logisticsRates, paymentAccounts, products, siteSettings, staffProfiles } from "../db/schema";
import { integrations } from "../env";
import { paystackConfig } from "../integrations/paystack";

/** Setup checklist (spec §155). Items are detected automatically from real configuration. */
export async function onboardingChecklist() {
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const settingKeys = new Set((await db.select({ key: siteSettings.key, updatedBy: siteSettings.updatedBy }).from(siteSettings)).filter((s) => s.updatedBy).map((s) => s.key));
  const ps = await paystackConfig();
  const items = [
    { key: "company", label: "Company information verified", done: settingKeys.has("company"), href: "/admin/settings?tab=company" },
    { key: "locations", label: "Locations & map", done: (await count(db.select({ n: sql<number>`count(*)::int` }).from(branches))) > 0, href: "/admin/settings?tab=branches" },
    { key: "categories", label: "Categories", done: (await count(db.select({ n: sql<number>`count(*)::int` }).from(categories))) > 0, href: "/admin/categories" },
    { key: "products", label: "Products added", done: (await count(db.select({ n: sql<number>`count(*)::int` }).from(products))) > 0, href: "/admin/products" },
    { key: "inventory", label: "Opening stock recorded", done: (await count(db.select({ n: sql<number>`count(*)::int` }).from(inventory).where(sql`${inventory.onHand} > 0`))) > 0, href: "/admin/inventory" },
    { key: "logistics", label: "Logistics rates", done: (await count(db.select({ n: sql<number>`count(*)::int` }).from(logisticsRates))) > 0, href: "/admin/logistics" },
    { key: "vat", label: "VAT configuration reviewed", done: settingKeys.has("tax"), href: "/admin/settings?tab=tax" },
    { key: "banks", label: "Bank accounts verified", done: (await count(db.select({ n: sql<number>`count(*)::int` }).from(paymentAccounts).where(eq(paymentAccounts.isActive, true)))) > 0 && settingKeys.has("payments"), href: "/admin/settings?tab=payments" },
    { key: "paystack", label: "Paystack keys configured", done: ps.configured, href: "/admin/settings?tab=payments" },
    { key: "email", label: "Transactional email (Resend)", done: integrations.email(), href: "/admin/security" },
    { key: "storage", label: "File storage (Cloudflare R2 or Vercel Blob)", done: integrations.blob(), href: "/admin/security" },
    { key: "notifications", label: "Admin alert email", done: settingKeys.has("notifications"), href: "/admin/settings?tab=notifications" },
    { key: "policies", label: "Policies reviewed", done: (await count(db.select({ n: sql<number>`count(*)::int` }).from(contentPages).where(sql`${contentPages.updatedBy} IS NOT NULL`))) > 0, href: "/admin/content?tab=pages" },
    { key: "seo", label: "SEO defaults", done: settingKeys.has("seo"), href: "/admin/settings?tab=seo" },
    { key: "maps", label: "Google Maps key", done: integrations.maps(), href: "/admin/security" },
    { key: "staff", label: "Staff invited & approved", done: (await count(db.select({ n: sql<number>`count(*)::int` }).from(staffProfiles).where(eq(staffProfiles.approval, "approved")))) > 1, href: "/admin/staff" },
  ];
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}
