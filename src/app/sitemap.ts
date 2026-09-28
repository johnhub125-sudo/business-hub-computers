import { and, eq, isNull } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { siteUrl } from "@/components/json-ld";
import { db } from "@/server/db";
import { brands, categories, contentPages, productConditions, products } from "@/server/db/schema";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const statics = ["", "/products", "/categories", "/brands", "/deals", "/about", "/contact", "/support", "/projects", "/gallery", "/team", "/faq", "/track-order"].map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.7,
  }));
  try {
    const [prods, cats, brs, conds, pages] = await Promise.all([
      db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(and(eq(products.status, "active"), isNull(products.deletedAt))),
      db.select({ slug: categories.slug, updatedAt: categories.updatedAt }).from(categories).where(eq(categories.isActive, true)),
      db.select({ slug: brands.slug }).from(brands).where(eq(brands.isActive, true)),
      db.select({ slug: productConditions.slug }).from(productConditions).where(eq(productConditions.isCollection, true)),
      db.select({ slug: contentPages.slug, updatedAt: contentPages.updatedAt }).from(contentPages).where(eq(contentPages.status, "published")),
    ]);
    return [
      ...statics,
      ...conds.map((c) => ({ url: `${base}/${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 })),
      ...conds.flatMap((c) => cats.map((cat) => ({ url: `${base}/${c.slug}/${cat.slug}`, lastModified: now, priority: 0.8 }))),
      ...cats.map((c) => ({ url: `${base}/categories/${c.slug}`, lastModified: c.updatedAt, priority: 0.8 })),
      ...brs.map((b) => ({ url: `${base}/brands/${b.slug}`, lastModified: now, priority: 0.6 })),
      ...prods.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.9 })),
      ...pages.filter((p) => p.slug !== "about").map((p) => ({ url: `${base}/${p.slug}`, lastModified: p.updatedAt, priority: 0.3 })),
    ];
  } catch {
    return statics;
  }
}
