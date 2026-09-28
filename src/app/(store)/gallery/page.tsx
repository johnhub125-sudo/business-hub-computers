import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/store/product-image";
import { Breadcrumbs } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { getGallery } from "@/server/queries/content";

export const metadata: Metadata = { title: "Gallery", alternates: { canonical: "/gallery" } };

export default async function GalleryPage({ searchParams }: PageProps<"/gallery">) {
  const sp = await searchParams;
  const all = await getGallery();
  const cats = [...new Set(all.map((g) => g.category))];
  const active = typeof sp.category === "string" && cats.includes(sp.category) ? sp.category : null;
  const items = active ? all.filter((g) => g.category === active) : all;
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Gallery" }]} />
      <h1 className="mb-4 font-display text-3xl font-extrabold">Gallery</h1>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 scrollbar-none">
        <Link href="/gallery" className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold capitalize", !active ? "bg-brand-700 text-white" : "bg-surface")}>
          All
        </Link>
        {cats.map((c) => (
          <Link key={c} href={`/gallery?category=${c}`} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold capitalize", active === c ? "bg-brand-700 text-white" : "bg-surface")}>
            {c}
          </Link>
        ))}
      </div>
      <div className="columns-2 gap-3 md:columns-3 [&>figure]:mb-3">
        {items.map((g) => (
          <figure key={g.id} className="break-inside-avoid overflow-hidden rounded-2xl bg-surface">
            <div className="relative aspect-[4/3]">
              <ProductImage src={g.imageUrl} alt={g.alt ?? g.title} fill sizes="(max-width:768px) 50vw, 33vw" className="object-cover" />
            </div>
            <figcaption className="p-3 text-sm font-medium">{g.title}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
