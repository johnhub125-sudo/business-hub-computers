import { inArray } from "drizzle-orm";
import { GitCompareArrows } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { CompareRemove } from "@/components/store/compare-remove";
import { Price } from "@/components/store/product-card";
import { ProductImage } from "@/components/store/product-image";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, EmptyState, Stars } from "@/components/ui/misc";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";
import { productsByIds } from "@/server/queries/catalog";

export const metadata: Metadata = { title: "Compare products", robots: { index: false } };

const KEY_ROWS = ["Processor", "RAM", "Storage", "Screen", "Graphics", "Operating system", "Battery", "Weight"];

export default async function ComparePage() {
  let ids: string[] = [];
  try {
    ids = JSON.parse((await cookies()).get("bhc_compare")?.value ?? "[]");
  } catch {}
  ids = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 4);
  const cards = await productsByIds(ids);
  const specs = cards.length ? await db.select({ id: products.id, specifications: products.specifications }).from(products).where(inArray(products.id, cards.map((c) => c.id))) : [];
  const specOf = new Map(specs.map((s) => [s.id, s.specifications]));
  const extraKeys = [...new Set(specs.flatMap((s) => Object.keys(s.specifications)))].filter((k) => !KEY_ROWS.includes(k));
  const rows = [...KEY_ROWS.filter((k) => specs.some((s) => s.specifications[k])), ...extraKeys];

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Compare" }]} />
      <h1 className="mb-5 font-display text-3xl font-extrabold">Compare products</h1>
      {cards.length === 0 ? (
        <EmptyState icon={<GitCompareArrows />} title="Nothing to compare yet" description="Use the compare button on up to 4 products to see them side by side." action={<ButtonLink href="/products">Browse products</ButtonLink>} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th scope="col" className="w-40 p-4 text-left align-bottom text-muted">
                  {cards.length} of 4
                </th>
                {cards.map((c) => (
                  <th key={c.id} scope="col" className="p-4 text-left align-top font-normal">
                    <div className="relative mb-2 aspect-square w-32 overflow-hidden rounded-xl bg-surface">
                      <ProductImage src={c.image} alt="" fill sizes="128px" className="p-2" />
                    </div>
                    <Link href={`/products/${c.slug}`} className="line-clamp-2 font-bold hover:text-brand-700">
                      {c.name}
                    </Link>
                    <CompareRemove productId={c.id} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_tr:nth-child(odd)]:bg-surface/70">
              <tr>
                <th scope="row" className="p-3 text-left font-semibold text-muted">
                  Price
                </th>
                {cards.map((c) => (
                  <td key={c.id} className="p-3">
                    <Price list={c.listPrice} sale={c.salePrice} size="sm" />
                  </td>
                ))}
              </tr>
              {[
                ["Brand", (c: (typeof cards)[number]) => c.brand ?? "—"],
                ["Condition", (c: (typeof cards)[number]) => c.condition],
                ["Warranty", (c: (typeof cards)[number]) => c.warranty ?? "—"],
                ["Availability", (c: (typeof cards)[number]) => (c.stock > 0 ? `In stock (${c.stock})` : "Out of stock")],
                ["Rating", (c: (typeof cards)[number]) => (c.ratingCount ? <Stars value={Number(c.rating)} /> : "No reviews")],
              ].map(([label, fn]) => (
                <tr key={label as string}>
                  <th scope="row" className="p-3 text-left font-semibold text-muted">
                    {label as string}
                  </th>
                  {cards.map((c) => (
                    <td key={c.id} className="p-3">
                      {(fn as (c: (typeof cards)[number]) => React.ReactNode)(c)}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.map((k) => (
                <tr key={k}>
                  <th scope="row" className="p-3 text-left font-semibold text-muted">
                    {k}
                  </th>
                  {cards.map((c) => (
                    <td key={c.id} className="p-3">
                      {specOf.get(c.id)?.[k] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
