import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogListing } from "@/components/store/catalog-listing";
import { getNavigation } from "@/server/queries/catalog";

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const b = (await getNavigation()).brands.find((x) => x.slug === slug);
  return b ? { title: `${b.name} products`, alternates: { canonical: `/brands/${slug}` } } : {};
}

export default async function BrandPage({ params, searchParams }: PageProps<"/brands/[slug]">) {
  const { slug } = await params;
  const b = (await getNavigation()).brands.find((x) => x.slug === slug);
  if (!b) notFound();
  return (
    <CatalogListing
      title={b.name}
      description={`Genuine ${b.name} products, brand new and UK used, with warranty.`}
      basePath={`/brands/${slug}`}
      searchParams={await searchParams}
      fixed={{ brand: [slug] }}
      crumbs={[{ label: "Home", href: "/" }, { label: "Brands", href: "/brands" }, { label: b.name }]}
    />
  );
}
