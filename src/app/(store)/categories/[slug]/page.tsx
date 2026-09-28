import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { breadcrumbLd, JsonLd } from "@/components/json-ld";
import { CatalogListing } from "@/components/store/catalog-listing";
import { getNavigation } from "@/server/queries/catalog";

async function load(slug: string) {
  const nav = await getNavigation();
  return nav.allCategories.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const cat = await load((await params).slug);
  if (!cat) return {};
  return {
    title: cat.seoTitle ?? `${cat.name}: brand new & UK used`,
    description: cat.seoDescription ?? cat.description ?? `Shop ${cat.name.toLowerCase()} in Nigeria at the best prices, with warranty and nationwide delivery.`,
    alternates: { canonical: `/categories/${cat.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const cat = await load(slug);
  if (!cat) notFound();
  const sp = await searchParams;
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Categories", path: "/categories" }, { name: cat.name, path: `/categories/${cat.slug}` }])} />
      <CatalogListing
        title={cat.name}
        description={cat.description ?? `Brand-new and UK-used ${cat.name.toLowerCase()} with warranty and nationwide delivery.`}
        basePath={`/categories/${cat.slug}`}
        searchParams={sp}
        fixed={{ category: cat.slug }}
        crumbs={[{ label: "Home", href: "/" }, { label: "Categories", href: "/categories" }, { label: cat.name }]}
      />
    </>
  );
}
