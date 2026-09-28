import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { Breadcrumbs } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { getPage } from "@/server/queries/content";

export async function policyMetadata(slug: string): Promise<Metadata> {
  const p = await getPage(slug);
  return p ? { title: p.seoTitle ?? p.title, description: p.seoDescription ?? undefined, alternates: { canonical: `/${slug}` } } : {};
}

/** Renders a CMS-managed page (terms, privacy, shipping, …). Edited in Admin → Content → Pages. */
export async function PolicyPage({ slug }: { slug: string }) {
  const p = await getPage(slug);
  if (!p) notFound();
  return (
    <div className="container-page max-w-3xl py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: p.title }]} />
      <article className="rounded-3xl border border-line bg-white p-6 sm:p-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-brand-800">{p.title}</h1>
        <p className="mb-6 mt-1 text-xs text-muted">Last updated {formatDate(p.updatedAt)}</p>
        <Markdown source={p.body} skipTitle />
      </article>
    </div>
  );
}
