import { Building2, Clock, LockKeyhole, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CatalogListing } from "@/components/store/catalog-listing";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/misc";
import { listProducts } from "@/server/queries/catalog";
import { getCurrentUser } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Dropshipping — partner goods delivered to you",
  description: "Order goods from our trusted partner companies through Business Hub Computers. We take the order and payment, the partner ships, and we stand behind the sale.",
  alternates: { canonical: "/dropshipping" },
};

const STEPS = [
  { icon: PackageCheck, title: "You order here", text: "Browse partner goods and pay through our secure checkout, just like any other product." },
  { icon: Building2, title: "Our partner prepares it", text: "We place the order with the supplying company the moment your payment is confirmed." },
  { icon: Truck, title: "Delivered to you", text: "The goods are shipped to your address or to our store for collection. You can track the order in your account." },
  { icon: ShieldCheck, title: "We stand behind it", text: "Your receipt, warranty and after-sales support come from Business Hub Computers." },
];

/**
 * Dropshipping: goods supplied and shipped by partner companies. The page is public, but the goods
 * themselves are shown to signed-in customers only.
 */
export default async function DropshippingPage({ searchParams }: PageProps<"/dropshipping">) {
  const [me, sp, { company }] = await Promise.all([getCurrentUser(), searchParams, getSettings()]);

  if (me) {
    return (
      <CatalogListing
        title="Dropshipping"
        description="Goods supplied and shipped by our partner companies. Pay here as usual — we place the order with the partner and keep you updated. Delivery times are shown on each product."
        basePath="/dropshipping"
        searchParams={sp}
        fixed={{ fulfilment: "dropship" }}
        crumbs={[{ label: "Home", href: "/" }, { label: "Dropshipping" }]}
      />
    );
  }

  const { total } = await listProducts({ fulfilment: "dropship", perPage: 1 });
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Dropshipping" }]} />
      <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-7 text-white sm:p-12">
        <div className="absolute -right-16 -top-16 size-72 rounded-full bg-accent-500/25 blur-3xl" aria-hidden />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider ring-1 ring-white/20">
            <Truck className="size-4" aria-hidden /> Dropshipping
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">More products, delivered straight from our partners</h1>
          <p className="mt-4 text-lg text-brand-100">
            {company.name} works with trusted supplying companies. Order their goods here, pay securely, and they ship directly to you — with our receipt, warranty and support.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <ButtonLink href="/login?next=/dropshipping" size="lg" className="btn-3d bg-accent-500 text-white hover:bg-accent-600">
              <LockKeyhole className="size-4" aria-hidden /> Sign in to view the goods
            </ButtonLink>
            <ButtonLink href="/register?next=/dropshipping" size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
              Create a free account
            </ButtonLink>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-brand-200">
            <Clock className="size-4" aria-hidden />
            {total > 0 ? `${total} partner product${total === 1 ? "" : "s"} available to signed-in customers.` : "Partner products are added regularly. Sign in to see what is available."}
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="how">
        <h2 id="how" className="font-display text-2xl font-extrabold tracking-tight">
          How it works
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card-3d rounded-2xl border border-line bg-white p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <s.icon className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-brand-500">Step {i + 1}</p>
              <h3 className="font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-surface p-6 text-sm text-muted">
        <h2 className="font-bold text-ink">Good to know</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Dropship goods are supplied by a partner, so delivery takes longer than items from our own stock. The usual time is shown on each product.</li>
          <li>Prices include our handling. VAT and delivery are calculated at checkout as usual.</li>
          <li>
            Returns, refunds and warranty follow our published policies — see the{" "}
            <Link href="/warranty" className="font-semibold text-brand-600 hover:underline">
              Warranty
            </Link>
            ,{" "}
            <Link href="/returns" className="font-semibold text-brand-600 hover:underline">
              Returns
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="font-semibold text-brand-600 hover:underline">
              Terms
            </Link>{" "}
            pages.
          </li>
          <li>Are you a supplier who wants your goods listed? Contact us on {company.phone}.</li>
        </ul>
      </section>
    </div>
  );
}
