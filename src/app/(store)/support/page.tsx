import { FileText, Headset, MessageCircle, Package, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/misc";
import { getFaqs } from "@/server/queries/content";
import { getCurrentUser } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Help & support", alternates: { canonical: "/support" } };

export default async function SupportPage() {
  const [{ company }, me, faqs] = await Promise.all([getSettings(), getCurrentUser(), getFaqs()]);
  const tiles = [
    { href: "/track-order", icon: Truck, title: "Track an order", text: "Use your order or tracking number" },
    { href: me ? "/account/orders" : "/login?next=/account/orders", icon: Package, title: "My orders & receipts", text: "View, pay, download receipts" },
    { href: "/returns", icon: RotateCcw, title: "Returns", text: "Faulty or not as described" },
    { href: "/warranty", icon: ShieldCheck, title: "Warranty", text: "What's covered and how to claim" },
    { href: "/shipping", icon: FileText, title: "Shipping", text: "Delivery & collection nationwide" },
    { href: me ? "/account/support" : "/login?next=/account/support", icon: Headset, title: "Support tickets", text: "Get help from our team" },
  ];
  return (
    <div className="container-page space-y-8 py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Support" }]} />
      <header className="rounded-3xl bg-brand-50 p-6 sm:p-10">
        <h1 className="font-display text-3xl font-extrabold">How can we help?</h1>
        <p className="mt-2 max-w-xl text-muted">Our support team is available Monday to Saturday, 8:30am to 6:30pm. The fastest way to reach us is WhatsApp.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href={`https://wa.me/${company.whatsapp}`} target="_blank" rel="noopener" variant="whatsapp">
            <MessageCircle aria-hidden /> Chat on WhatsApp
          </ButtonLink>
          <ButtonLink href={me ? "/account/support" : "/contact"} variant="outline">
            {me ? "Open a support ticket" : "Send a message"}
          </ButtonLink>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.title} href={t.href} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 transition hover:border-brand-200 hover:shadow-[var(--shadow-card)]">
            <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <t.icon className="size-6" aria-hidden />
            </span>
            <span>
              <span className="block font-bold">{t.title}</span>
              <span className="text-sm text-muted">{t.text}</span>
            </span>
          </Link>
        ))}
      </div>
      <section>
        <h2 className="mb-3 text-xl font-bold">Popular questions</h2>
        <div className="space-y-2">
          {faqs.slice(0, 5).map((f) => (
            <details key={f.id} className="rounded-2xl border border-line bg-white p-4">
              <summary className="cursor-pointer font-semibold">{f.question}</summary>
              <p className="mt-2 text-muted">{f.answer}</p>
            </details>
          ))}
        </div>
        <Link href="/faq" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
          See all FAQs →
        </Link>
      </section>
    </div>
  );
}
