import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_ART } from "@/components/store/icons";
import { ProductImage } from "@/components/store/product-image";
import { Breadcrumbs } from "@/components/ui/misc";
import { categoryCounts, getNavigation } from "@/server/queries/catalog";

export const metadata: Metadata = { title: "All categories", alternates: { canonical: "/categories" } };

export default async function CategoriesPage() {
  const [nav, counts] = await Promise.all([getNavigation(), categoryCounts()]);
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Categories" }]} />
      <h1 className="mb-6 font-display text-2xl font-extrabold sm:text-3xl">All categories</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {nav.categories.map((c) => (
          <div key={c.id} className="flex gap-4 rounded-2xl border border-line bg-white p-4">
            <Link href={`/categories/${c.slug}`} className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-surface" aria-label={c.name}>
              <ProductImage src={c.image ?? CATEGORY_ART[c.slug]} alt="" fill sizes="96px" className="p-2" />
            </Link>
            <div className="min-w-0">
              <Link href={`/categories/${c.slug}`} className="text-lg font-bold hover:text-brand-700">
                {c.name}
              </Link>
              <p className="text-xs text-muted">{counts.get(c.id) ?? 0} products</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nav.collections.map((col) => (
                  <Link key={col.id} href={`/${col.slug}/${c.slug}`} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold hover:bg-brand-50 hover:text-brand-700">
                    {col.name}
                  </Link>
                ))}
                {c.children.map((ch) => (
                  <Link key={ch.id} href={`/categories/${c.slug}?sub=${ch.slug}`} className="rounded-full bg-surface px-2.5 py-1 text-xs hover:bg-brand-50 hover:text-brand-700">
                    {ch.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
