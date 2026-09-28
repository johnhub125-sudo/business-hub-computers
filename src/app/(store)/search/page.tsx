import type { Metadata } from "next";
import { CatalogListing } from "@/components/store/catalog-listing";
import { SearchBox } from "@/components/store/search-box";
import { enforceRateLimit, RateLimitError } from "@/server/ratelimit";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { q } = await searchParams;
  const term = typeof q === "string" ? q.slice(0, 60) : "";
  return { title: term ? `Search: ${term}` : "Search", robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  if (!q) {
    return (
      <div className="container-page py-10">
        <h1 className="mb-4 font-display text-2xl font-extrabold">Search products</h1>
        <SearchBox autoFocus className="max-w-2xl" />
      </div>
    );
  }
  try {
    await enforceRateLimit("search");
  } catch (e) {
    if (e instanceof RateLimitError) {
      return <div className="container-page py-16 text-center text-muted">You are searching very quickly. Please wait a moment and try again.</div>;
    }
    throw e;
  }
  return <CatalogListing title={`Results for “${q.slice(0, 60)}”`} basePath="/search" searchParams={sp} crumbs={[{ label: "Home", href: "/" }, { label: "Search" }]} />;
}
