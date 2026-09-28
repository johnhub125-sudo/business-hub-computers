import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogListing } from "@/components/store/catalog-listing";
import { getNavigation } from "@/server/queries/catalog";

async function load(collection: string, category: string) {
  const nav = await getNavigation();
  const col = nav.collections.find((c) => c.slug === collection);
  const cat = nav.allCategories.find((c) => c.slug === category);
  return col && cat ? { col, cat } : null;
}

export async function generateMetadata({ params }: PageProps<"/[collection]/[category]">): Promise<Metadata> {
  const { collection, category } = await params;
  const r = await load(collection, category);
  if (!r) return {};
  return {
    title: `${r.col.name} ${r.cat.name}`,
    description: `${r.col.name} ${r.cat.name.toLowerCase()} in Nigeria, tested, with warranty and nationwide delivery.`,
    alternates: { canonical: `/${r.col.slug}/${r.cat.slug}` },
  };
}

export default async function CollectionCategoryPage({ params, searchParams }: PageProps<"/[collection]/[category]">) {
  const { collection, category } = await params;
  const r = await load(collection, category);
  if (!r) notFound();
  return (
    <CatalogListing
      title={`${r.col.name} ${r.cat.name}`}
      description={r.col.description}
      basePath={`/${r.col.slug}/${r.cat.slug}`}
      searchParams={await searchParams}
      fixed={{ condition: [r.col.slug], category: r.cat.slug }}
      crumbs={[{ label: "Home", href: "/" }, { label: r.col.name, href: `/${r.col.slug}` }, { label: r.cat.name }]}
    />
  );
}
