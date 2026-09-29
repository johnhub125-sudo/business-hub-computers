import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BRAND_DEFAULTS } from "@/lib/brand";
import { getBranches, getSocialLinks } from "@/server/queries/content";
import { getNavigation } from "@/server/queries/catalog";
import { getSettings } from "@/server/settings";
import { NewsletterForm } from "./newsletter-form";

export async function SiteFooter() {
  const [{ company }, branches, socials, nav] = await Promise.all([getSettings(), getBranches(), getSocialLinks(), getNavigation()]);
  const year = new Date().getFullYear();
  const cols: [string, [string, string][]][] = [
    [
      "Shop",
      [
        ["/products", "All products"],
        ["/brand-new", "Brand new"],
        ["/uk-used", "UK used"],
        ["/deals", "Deals"],
        ["/brands", "Brands"],
        ["/compare", "Compare products"],
      ],
    ],
    [
      "Company",
      [
        ["/about", "About us"],
        ["/about#services", "Services"],
        ["/projects", "Projects"],
        ["/team", "Our team"],
        ["/gallery", "Gallery"],
        ["/contact", "Contact"],
      ],
    ],
    [
      "Help",
      [
        ["/support", "Support centre"],
        ["/track-order", "Track your order"],
        ["/faq", "FAQs"],
        ["/shipping", "Shipping policy"],
        ["/returns", "Returns"],
        ["/refund-policy", "Refund policy"],
        ["/warranty", "Warranty"],
      ],
    ],
  ];

  return (
    <footer className="mt-16 bg-brand-950 text-slate-300">
      <div className="border-b border-white/10">
        <div className="container-page flex flex-col items-start justify-between gap-5 py-8 md:flex-row md:items-center">
          <div>
            <p className="text-lg font-bold text-white">Get exclusive deals & new arrivals</p>
            <p className="text-sm text-slate-400">No spam. Unsubscribe anytime.</p>
          </div>
          <NewsletterForm />
        </div>
      </div>
      <div className="container-page grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="inline-block rounded-xl bg-white p-2.5">
            <Image src={company.logo} alt={company.name} width={640} height={170} className="h-10 w-auto" />
          </div>
          <p className="mt-4 font-semibold text-white">{company.tagline}</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{company.about}</p>
          <ul className="mt-5 space-y-2.5 text-sm">
            <li>
              <a href={`tel:${company.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 hover:text-white">
                <Phone className="size-4 text-accent-400" aria-hidden /> {company.phone}
              </a>
            </li>
            <li>
              <a href={`https://wa.me/${company.whatsapp}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-white">
                <MessageCircle className="size-4 text-accent-400" aria-hidden /> WhatsApp {BRAND_DEFAULTS.contact.whatsappDisplay}
              </a>
            </li>
            <li>
              <a href={`mailto:${company.email}`} className="inline-flex items-center gap-2 hover:text-white">
                <Mail className="size-4 text-accent-400" aria-hidden /> {company.email}
              </a>
            </li>
          </ul>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            {title === "Shop" && (
              <ul className="mt-2.5 space-y-2.5 text-sm">
                {nav.categories.slice(0, 3).map((c) => (
                  <li key={c.id}>
                    <Link href={`/categories/${c.slug}`} className="hover:text-white">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="container-page grid gap-4 border-t border-white/10 py-8 md:grid-cols-2">
        {branches.map((b) => (
          <div key={b.id} className="flex gap-3 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-accent-400" aria-hidden />
            <div>
              <p className="font-semibold text-white">{b.name}</p>
              <p className="text-slate-400">{b.address}</p>
              <a className="text-accent-300 hover:text-accent-200" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.mapsQuery)}`}>
                Get directions →
              </a>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        {/* Extra bottom padding on mobile so the fixed tab bar never covers this row. */}
        <div className="container-page flex flex-col items-center justify-between gap-3 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] text-center text-[13px] text-slate-400 md:flex-row md:text-left lg:pb-5">
          <p>
            © {year} {company.name}. All rights reserved. {company.rcNumber}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/cookies" className="hover:text-white">
              Cookies
            </Link>
            {socials.map((s) => (
              <a key={s.id} href={s.url} target="_blank" rel="noopener" className="hover:text-white">
                {s.platform}
              </a>
            ))}
          </div>
          <p>
            Powered and maintained by <span className="font-semibold text-white">{BRAND_DEFAULTS.company.poweredBy}</span>
            <span className="block sm:inline">
              <span className="hidden sm:inline"> · </span>
              <a href={BRAND_DEFAULTS.company.poweredByUrl} target="_blank" rel="noopener" className="hover:text-white">
                {BRAND_DEFAULTS.company.poweredByWebsite}
              </a>
              {" · "}
              <a href={`tel:${BRAND_DEFAULTS.company.poweredByPhoneHref}`} className="hover:text-white">
                {BRAND_DEFAULTS.company.poweredByPhone}
              </a>
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
