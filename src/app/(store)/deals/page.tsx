import type { Metadata } from "next";
import { CatalogListing, parseFilters } from "@/components/store/catalog-listing";

export const metadata: Metadata = {
  title: "Deals & discounts",
  description: "Hot deals on laptops, desktops, monitors and accessories at Business Hub Computers.",
  alternates: { canonical: "/deals" },
};

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const sp = await searchParams;
  return (
    <CatalogListing
      title="🔥 Deals & discounts"
      description="Limited-time prices on popular devices. Prices and stock update in real time."
      basePath="/deals"
      searchParams={sp}
      fixed={{ discounted: true, sort: parseFilters(sp).sort ?? "discount" }}
      crumbs={[{ label: "Home", href: "/" }, { label: "Deals" }]}
    />
  );
}
