import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/misc";
import { db } from "@/server/db";
import { brands, products } from "@/server/db/schema";

export const metadata: Metadata = { title: "Shop by brand", alternates: { canonical: "/brands" } };

export default async function BrandsPage() {
  const rows = await db
    .select({ name: brands.name, slug: brands.slug, n: sql<number>`count(${products.id})::int` })
    .from(brands)
    .leftJoin(products, and(eq(products.brandId, brands.id), eq(products.status, "active"), isNull(products.deletedAt)))
    .where(eq(brands.isActive, true))
    .groupBy(brands.id)
    .orderBy(asc(brands.sortOrder));
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Brands" }]} />
      <h1 className="mb-6 font-display text-2xl font-extrabold sm:text-3xl">Shop by brand</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((b) => (
          <Link key={b.slug} href={`/brands/${b.slug}`} className="group rounded-2xl border border-line bg-white p-5 text-center transition hover:border-brand-200 hover:shadow-[var(--shadow-lift)]">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-white text-xl font-extrabold text-brand-700 ring-1 ring-brand-100">{b.name.slice(0, 2).toUpperCase()}</span>
            <span className="mt-3 block font-bold group-hover:text-brand-700">{b.name}</span>
            <span className="text-xs text-muted">{b.n} products</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
