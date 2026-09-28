import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogListing } from "@/components/store/catalog-listing";
import { getNavigation } from "@/server/queries/catalog";

/** Collections (Brand New, UK Used, …) are product conditions flagged as collections in the admin. */
async function load(slug: string) {
  return (await getNavigation()).collections.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/[collection]">): Promise<Metadata> {
  const col = await load((await params).collection);
  if (!col) return {};
  return { title: `${col.name} computers & IT equipment`, description: col.description ?? undefined, alternates: { canonical: `/${col.slug}` } };
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/[collection]">) {
  const col = await load((await params).collection);
  if (!col) notFound();
  return (
    <CatalogListing
      title={col.name}
      description={col.description}
      basePath={`/${col.slug}`}
      searchParams={await searchParams}
      fixed={{ condition: [col.slug] }}
      crumbs={[{ label: "Home", href: "/" }, { label: col.name }]}
    />
  );
}
