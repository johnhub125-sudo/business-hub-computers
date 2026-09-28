import { and, desc, eq, isNotNull } from "drizzle-orm";
import { BadgeCheck, MessageCircleQuestion, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { breadcrumbLd, JsonLd, siteUrl } from "@/components/json-ld";
import { ProductRail } from "@/components/store/product-card";
import { AskQuestion, RecentlyViewed, ReviewForm } from "@/components/store/product-extras";
import { ProductGallery } from "@/components/store/product-gallery";
import { ProductPurchase } from "@/components/store/product-purchase";
import { Breadcrumbs, SectionHeading, Stars } from "@/components/ui/misc";
import { discountPercent } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { productQuestions, reviews as reviewsTable } from "@/server/db/schema";
import { frequentlyBoughtWith, getProductBySlug, incrementView, productReviews, relatedProducts } from "@/server/queries/catalog";
import { purchasedOrder } from "@/server/services/reviews";
import { getCurrentUser } from "@/server/session";
import { wishlistProductIds } from "@/server/services/wishlist";
import { getSettings } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return { title: "Product not found" };
  const img = p.images[0]?.url;
  return {
    title: p.product.seoTitle ?? p.product.name,
    description: p.product.seoDescription ?? p.product.shortDescription ?? undefined,
    keywords: p.product.seoKeywords ?? undefined,
    alternates: { canonical: `/products/${p.product.slug}` },
    openGraph: { title: p.product.name, description: p.product.shortDescription ?? undefined, images: img && !img.endsWith(".svg") ? [img] : undefined, type: "website" },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const data = await getProductBySlug(slug);
  if (!data) notFound();
  const { product: p, brand, category, condition, subcategory, images, videos, variants } = data;
  const me = await getCurrentUser();
  const [reviews, related, fbt, wished, settings, questions, bought] = await Promise.all([
    productReviews(p.id),
    relatedProducts(p.id, p.categoryId),
    frequentlyBoughtWith(p.id),
    me ? wishlistProductIds(me.id) : Promise.resolve([] as string[]),
    getSettings(),
    db.select().from(productQuestions).where(and(eq(productQuestions.productId, p.id), isNotNull(productQuestions.answer), eq(productQuestions.status, "approved"))).orderBy(desc(productQuestions.createdAt)).limit(10),
    me ? purchasedOrder(me.id, p.id) : Promise.resolve(null),
  ]);
  after(() => incrementView(p.id).catch(() => {}));

  const def = variants.find((v) => v.isDefault) ?? variants[0];
  const price = def ? (def.salePrice ?? def.listPrice) : p.price;
  const inStock = variants.some((v) => v.available > 0);
  const specs = Object.entries(p.specifications ?? {});
  const alreadyReviewed = me
    ? (await db.select({ id: reviewsTable.id }).from(reviewsTable).where(and(eq(reviewsTable.productId, p.id), eq(reviewsTable.userId, me.id)))).length > 0
    : false;

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    gtin13: p.barcode ?? undefined,
    description: p.shortDescription ?? p.description ?? undefined,
    image: images.map((i) => (i.url.startsWith("http") ? i.url : `${siteUrl()}${i.url}`)),
    brand: brand ? { "@type": "Brand", name: brand.name } : undefined,
    itemCondition: condition.slug === "brand-new" ? "https://schema.org/NewCondition" : condition.slug === "refurbished" ? "https://schema.org/RefurbishedCondition" : "https://schema.org/UsedCondition",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "NGN",
      lowPrice: (Math.min(...variants.map((v) => v.salePrice ?? v.listPrice)) / 100).toFixed(2),
      highPrice: (Math.max(...variants.map((v) => v.salePrice ?? v.listPrice)) / 100).toFixed(2),
      offerCount: variants.length,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: settings.company.name },
    },
    aggregateRating: reviews.count ? { "@type": "AggregateRating", ratingValue: reviews.avg.toFixed(1), reviewCount: reviews.count } : undefined,
  };

  return (
    <div className="container-page py-6">
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: category.name, path: `/categories/${category.slug}` }, { name: p.name, path: `/products/${p.slug}` }])} />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: condition.name, href: condition.isCollection ? `/${condition.slug}` : undefined },
          { label: category.name, href: `/categories/${category.slug}` },
          ...(subcategory ? [{ label: subcategory.name, href: `/categories/${category.slug}?sub=${subcategory.slug}` }] : []),
          { label: p.name },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery images={images.map((i) => ({ id: i.id, url: i.url, alt: i.alt }))} videos={videos.map((v) => ({ id: v.id, url: v.url, title: v.title }))} name={p.name} variantImage={def?.image} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${condition.slug === "brand-new" ? "bg-brand-700 text-white" : "bg-accent-500 text-white"}`}>{condition.name}</span>
            {brand && (
              <Link href={`/brands/${brand.slug}`} className="text-sm font-semibold uppercase tracking-wide text-brand-600 hover:underline">
                {brand.name}
              </Link>
            )}
            {def?.salePrice && <span className="rounded-md bg-accent-50 px-2 py-0.5 text-xs font-bold text-accent-600">Save {discountPercent(def.listPrice, def.salePrice)}%</span>}
          </div>
          <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
            {reviews.count ? (
              <a href="#reviews" className="flex items-center gap-1.5 hover:text-ink">
                <Stars value={reviews.avg} /> {reviews.avg.toFixed(1)} ({reviews.count} review{reviews.count === 1 ? "" : "s"})
              </a>
            ) : (
              <span>No reviews yet</span>
            )}
            <span>SKU: {p.sku}</span>
            {p.soldCount > 0 && <span>{p.soldCount} sold</span>}
          </div>
          {p.shortDescription && <p className="mt-4 text-[15px] leading-relaxed text-muted">{p.shortDescription}</p>}
          <div className="mt-6">
            <ProductPurchase
              productId={p.id}
              slug={p.slug}
              variants={variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku, attributes: v.attributes, listPrice: v.listPrice, salePrice: v.salePrice, available: v.available, isDefault: v.isDefault }))}
              wished={wished.includes(p.id)}
              warranty={p.warranty}
            />
          </div>
          <p className="mt-4 text-xs text-muted">From {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(price / 100)} · {settings.company.name}</p>
        </div>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-8">
          {specs.length > 0 && (
            <section id="specs">
              <h2 className="mb-3 text-xl font-extrabold">Specifications</h2>
              <div className="overflow-hidden rounded-2xl border border-line">
                <table className="w-full text-sm">
                  <tbody>
                    {specs.map(([k, v], i) => (
                      <tr key={k} className={i % 2 ? "bg-white" : "bg-surface/70"}>
                        <th scope="row" className="w-2/5 px-4 py-2.5 text-left font-semibold text-muted">
                          {k}
                        </th>
                        <td className="px-4 py-2.5">{v}</td>
                      </tr>
                    ))}
                    {p.weightGrams && (
                      <tr className="bg-white">
                        <th scope="row" className="px-4 py-2.5 text-left font-semibold text-muted">
                          Weight
                        </th>
                        <td className="px-4 py-2.5">{(p.weightGrams / 1000).toFixed(2)} kg</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {p.description && (
            <section id="description">
              <h2 className="mb-3 text-xl font-extrabold">Description</h2>
              <div className="prose-content">
                {p.description.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="space-y-3">
          {[
            { icon: Truck, title: "Delivery information", body: "Door delivery or collection at a motor park/agent in all 36 states + FCT. Free pickup at our Ibadan store. Costs are calculated at checkout.", href: "/shipping" },
            { icon: RotateCcw, title: "Returns", body: "Faulty or not as described? Report within 48 hours of delivery for repair, replacement or refund.", href: "/returns" },
            { icon: ShieldCheck, title: "Warranty", body: p.warranty ?? "Covered by the Business Hub warranty.", href: "/warranty" },
            { icon: BadgeCheck, title: "Genuine & tested", body: condition.description ?? "Every device is checked before dispatch." },
          ].map((b) => (
            <div key={b.title} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
              <b.icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
              <div>
                <h3 className="font-bold">{b.title}</h3>
                <p className="mt-0.5 text-sm text-muted">{b.body}</p>
                {b.href && (
                  <Link href={b.href} className="mt-1 inline-block text-sm font-semibold text-brand-600 hover:underline">
                    Read policy
                  </Link>
                )}
              </div>
            </div>
          ))}
        </aside>
      </div>

      {fbt.length > 0 && (
        <section className="mt-12">
          <SectionHeading title="Frequently purchased together" />
          <ProductRail items={fbt} wished={wished} />
        </section>
      )}

      <section id="reviews" className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <h2 className="text-xl font-extrabold">Customer reviews</h2>
          <div className="mt-4 rounded-2xl border border-line bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="text-4xl font-extrabold">{reviews.count ? reviews.avg.toFixed(1) : "–"}</span>
              <div>
                <Stars value={reviews.avg} size={18} />
                <p className="text-sm text-muted">
                  {reviews.count} verified review{reviews.count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              {reviews.dist.map((d) => (
                <div key={d.star} className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-muted">{d.star}★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${reviews.count ? (d.count / reviews.count) * 100 : 0}%` }} />
                  </span>
                  <span className="w-6 text-right text-muted">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            {!me ? (
              <p className="text-sm text-muted">
                <Link href={`/login?next=/products/${p.slug}%23reviews`} className="font-semibold text-brand-600 underline">
                  Sign in
                </Link>{" "}
                to review products you have bought.
              </p>
            ) : bought && !alreadyReviewed ? (
              <ReviewForm productId={p.id} />
            ) : (
              <p className="text-sm text-muted">{alreadyReviewed ? "Thanks for reviewing this product." : "Reviews are limited to verified buyers of this product."}</p>
            )}
          </div>
        </div>
        <div className="space-y-4">
          {reviews.rows.length === 0 && <p className="rounded-2xl bg-surface p-6 text-center text-muted">No reviews yet. Be the first verified buyer to share your experience.</p>}
          {reviews.rows.map((r) => (
            <article key={r.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                {r.title && <h3 className="font-bold">{r.title}</h3>}
              </div>
              <p className="mt-2 text-[15px] leading-relaxed">{r.comment}</p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold text-ink">{r.author.split(" ")[0]}</span> · {formatDate(r.createdAt)}
                {r.isVerifiedPurchase && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">✓ Verified purchase</span>}
              </p>
              {r.adminResponse && (
                <div className="mt-3 rounded-xl bg-brand-50 p-3 text-sm">
                  <span className="font-semibold text-brand-700">Response from {settings.company.name}:</span> {r.adminResponse}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section id="questions" className="mt-12 rounded-3xl bg-surface p-5 sm:p-8">
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <MessageCircleQuestion className="size-6 text-brand-600" aria-hidden /> Questions & answers
        </h2>
        <div className="mt-4 space-y-3">
          {questions.length === 0 && <p className="text-sm text-muted">No questions yet.</p>}
          {questions.map((q) => (
            <div key={q.id} className="rounded-2xl bg-white p-4">
              <p className="font-semibold">Q: {q.question}</p>
              <p className="mt-1 text-sm text-muted">A: {q.answer}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 max-w-xl">
          <AskQuestion productId={p.id} signedIn={!!me} />
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-12">
          <SectionHeading title="Related products" href={`/categories/${category.slug}`} />
          <ProductRail items={related} wished={wished} />
        </section>
      )}
      <div className="mt-12">
        <RecentlyViewed currentId={p.id} />
      </div>
    </div>
  );
}
