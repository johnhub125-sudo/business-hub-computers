import { Cookie, FileText, type LucideIcon, Lock, RotateCcw, ShieldCheck, Truck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { Breadcrumbs } from "@/components/ui/misc";
import { cn, formatDate } from "@/lib/utils";
import { getPage } from "@/server/queries/content";

export async function policyMetadata(slug: string): Promise<Metadata> {
  const p = await getPage(slug);
  return p ? { title: p.seoTitle ?? p.title, description: p.seoDescription ?? undefined, alternates: { canonical: `/${slug}` } } : {};
}

/** The policies customers look for, in the order they usually need them. */
const POLICIES: { slug: string; label: string; icon: LucideIcon; blurb: string }[] = [
  { slug: "warranty", label: "Warranty", icon: ShieldCheck, blurb: "What is covered and how to claim" },
  { slug: "returns", label: "Returns", icon: RotateCcw, blurb: "Faulty or wrong item" },
  { slug: "refund-policy", label: "Refunds", icon: Wallet, blurb: "How and when you are paid back" },
  { slug: "shipping", label: "Shipping", icon: Truck, blurb: "Delivery and collection" },
  { slug: "terms", label: "Terms & conditions", icon: FileText, blurb: "The rules of buying from us" },
  { slug: "privacy", label: "Privacy", icon: Lock, blurb: "How we protect your data" },
  { slug: "cookies", label: "Cookies", icon: Cookie, blurb: "What we store in your browser" },
];

/** Renders a CMS-managed page (terms, privacy, shipping, …). Edited in Admin → Content → Pages. */
export async function PolicyPage({ slug }: { slug: string }) {
  const p = await getPage(slug);
  if (!p) notFound();
  const current = POLICIES.find((x) => x.slug === slug);
  const Icon = current?.icon ?? FileText;
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: p.title }]} />
      <header className="relative mt-3 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-6 text-white sm:p-9">
        <div className="absolute -right-10 -top-14 size-56 rounded-full bg-accent-500/25 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Icon className="size-7" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-4xl">{p.title}</h1>
            <p className="mt-1 text-sm text-brand-200">Last updated {formatDate(p.updatedAt)}</p>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Policies" className="lg:sticky lg:top-44 lg:h-fit">
          <ul className="flex gap-2 overflow-x-auto pb-1 scrollbar-none lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-2xl lg:border lg:border-line lg:bg-white lg:p-2">
            {POLICIES.map((x) => (
              <li key={x.slug} className="shrink-0">
                <Link
                  href={`/${x.slug}`}
                  aria-current={x.slug === slug ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition lg:border-transparent",
                    x.slug === slug ? "border-brand-200 bg-brand-50 font-semibold text-brand-800" : "border-line bg-white text-ink hover:bg-surface",
                  )}
                >
                  <x.icon className="size-4 shrink-0 text-brand-600" aria-hidden />
                  <span>
                    {x.label}
                    <span className="hidden text-xs font-normal text-muted lg:block">{x.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0 rounded-3xl border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-10">
          <Markdown source={p.body} skipTitle />
          <div className="mt-8 rounded-2xl bg-surface p-5 text-sm">
            <p className="font-semibold text-ink">Need help with this?</p>
            <p className="mt-1 text-muted">
              Our team is happy to explain anything on this page.{" "}
              <Link href="/support" className="font-semibold text-brand-600 hover:underline">
                Contact support
              </Link>{" "}
              or{" "}
              <Link href="/track-order" className="font-semibold text-brand-600 hover:underline">
                track an order
              </Link>
              .
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
