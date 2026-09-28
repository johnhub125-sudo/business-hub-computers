import type { Metadata } from "next";
import { CatalogListing } from "@/components/store/catalog-listing";

export const metadata: Metadata = {
  title: "All products",
  description: "Shop brand-new and UK-used laptops, desktops, monitors, printers, projectors, accessories and power stations.",
  alternates: { canonical: "/products" },
};

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const sp = await searchParams;
  return <CatalogListing title="All products" basePath="/products" searchParams={sp} crumbs={[{ label: "Home", href: "/" }, { label: "Products" }]} />;
}
