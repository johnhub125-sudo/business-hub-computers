import { ArrowRight, BadgeCheck, Clock, Mail, MapPin, MessageCircle, Phone, Quote, ShieldCheck, Truck, Wrench } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading, Stars } from "@/components/ui/misc";
import { initials } from "@/lib/utils";
import { categoryCounts, getNavigation, latestReviews, productRail } from "@/server/queries/catalog";
import { getBranches, getGallery, getProjects, getSiteContent, getTeam, getTestimonials } from "@/server/queries/content";
import { getSettings } from "@/server/settings";
import { CategoryTabs } from "./category-tabs";
import { CATEGORY_ART, DynamicIcon } from "./icons";
import { directionsUrl, MapEmbed } from "./map-embed";
import { NewsletterForm } from "./newsletter-form";
import { ProductRail } from "./product-card";
import { ProductImage } from "./product-image";

type Section = { id: string; type: string; title: string | null; subtitle: string | null; config: Record<string, unknown> };
type Item = { title: string; description: string; icon?: string };

export async function TrustBar() {
  const items = [
    { icon: ShieldCheck, title: "Warranty on every device", text: "Manufacturer or Business Hub warranty" },
    { icon: Truck, title: "Nationwide delivery", text: "Door delivery or motor-park collection" },
    { icon: BadgeCheck, title: "Tested & certified", text: "Every UK-used unit is quality checked" },
    { icon: Wrench, title: "Expert after-sales support", text: "Repairs, upgrades & advice" },
  ];
  return (
    <section aria-label="Why shop with us" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.title} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 sm:p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <it.icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-bold leading-tight text-ink sm:text-sm">{it.title}</span>
            <span className="hidden text-xs text-muted sm:block">{it.text}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

export async function CategoriesSection({ s }: { s: Section }) {
  const [nav, counts] = await Promise.all([getNavigation(), categoryCounts()]);
  return (
    <section>
      <SectionHeading title={s.title ?? "Shop by category"} subtitle={s.subtitle} href="/categories" />
      <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-6">
        {nav.categories.map((c) => (
          <Link key={c.id} href={`/categories/${c.slug}`} className="group flex flex-col items-center rounded-2xl border border-line bg-white p-3 text-center transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-lift)] sm:p-4">
            <span className="relative mb-2 aspect-square w-full overflow-hidden rounded-xl bg-surface">
              <ProductImage src={c.image ?? CATEGORY_ART[c.slug]} alt="" fill sizes="(max-width:1024px) 30vw, 15vw" className="p-2 transition group-hover:scale-105" />
            </span>
            <span className="text-[13.5px] font-bold text-ink sm:text-sm">{c.name}</span>
            <span className="text-xs text-muted">{counts.get(c.id) ?? 0} products</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export async function RailSection({ s, wished }: { s: Section; wished: string[] }) {
  const cfg = s.config as { source?: string; value?: string; limit?: number; viewAll?: string; style?: string };
  const items = await productRail(cfg.source ?? "featured", cfg.value, cfg.limit ?? 10);
  if (!items.length) return null;
  const viewAll =
    cfg.viewAll ?? { featured: "/products?flag=featured", deal: "/deals", new: "/products?sort=newest", bestseller: "/products?sort=popular" }[cfg.source ?? ""] ?? "/products";
  if (cfg.style === "deal") {
    return (
      <section className="rounded-3xl bg-gradient-to-br from-accent-600 to-accent-800 p-4 sm:p-6">
        <div className="mb-5 flex items-end justify-between gap-4 text-white">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">🔥 {s.title}</h2>
            {s.subtitle && <p className="mt-1 text-sm text-accent-100">{s.subtitle}</p>}
          </div>
          <Link href={viewAll} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold hover:bg-white/25">
            All deals <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ProductRail items={items} wished={wished} />
      </section>
    );
  }
  return (
    <section>
      <SectionHeading title={s.title ?? ""} subtitle={s.subtitle} href={viewAll} />
      <ProductRail items={items} wished={wished} />
    </section>
  );
}

export async function CollectionsSection({ s }: { s: Section }) {
  return (
    <section>
      <SectionHeading title={s.title ?? "Brand new or UK used?"} subtitle={s.subtitle} />
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { href: "/brand-new", title: "Brand New", text: "Factory-sealed devices with full manufacturer warranty. The latest processors and designs.", img: "/images/catalog/laptop-1.svg", cls: "from-brand-700 to-brand-900" },
          { href: "/uk-used", title: "UK Used", text: "Grade-A business-class machines, individually tested and certified — premium quality for less.", img: "/images/catalog/laptop-2.svg", cls: "from-accent-600 to-accent-800" },
        ].map((c) => (
          <Link key={c.href} href={c.href} className={`group relative flex min-h-56 overflow-hidden rounded-3xl bg-gradient-to-br ${c.cls} p-6 text-white sm:p-8`}>
            <div className="relative z-10 max-w-[60%]">
              <h3 className="font-display text-2xl font-extrabold sm:text-3xl">{c.title}</h3>
              <p className="mt-2 text-sm text-white/85 sm:text-[15px]">{c.text}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-ink transition group-hover:gap-2.5">
                Shop {c.title.toLowerCase()} <ArrowRight className="size-4" aria-hidden />
              </span>
            </div>
            <div className="absolute -bottom-6 -right-6 size-60 opacity-95 transition duration-500 group-hover:scale-105 sm:size-72">
              <Image src={c.img} alt="" fill unoptimized className="object-contain" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export async function CategoryTabsSection({ s, wished }: { s: Section; wished: string[] }) {
  const slugs = ((s.config as { categories?: string[] }).categories ?? []).slice(0, 8);
  const nav = await getNavigation();
  const tabs = await Promise.all(
    slugs.map(async (slug) => ({ slug, name: nav.allCategories.find((c) => c.slug === slug)?.name ?? slug, items: await productRail("category", slug, 10) })),
  );
  const nonEmpty = tabs.filter((t) => t.items.length);
  if (!nonEmpty.length) return null;
  return (
    <section>
      <SectionHeading title={s.title ?? "More to explore"} subtitle={s.subtitle ?? "Monitors, accessories, printers, projectors and power"} />
      <CategoryTabs tabs={nonEmpty} wished={wished} />
    </section>
  );
}

export async function ServicesSection({ s, id }: { s?: Section; id?: string }) {
  const services = await getSiteContent<Item[]>("content_services", []);
  return (
    <section id={id}>
      <SectionHeading title={s?.title ?? "Our services"} subtitle={s?.subtitle ?? "Beyond sales — we keep your technology running"} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((sv) => (
          <div key={sv.title} className="rounded-2xl border border-line bg-white p-5 transition hover:border-brand-200 hover:shadow-[var(--shadow-card)]">
            <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow">
              <DynamicIcon name={sv.icon} className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-bold">{sv.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{sv.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function SetupsSection({ s }: { s: Section }) {
  const blocks = [
    { title: "Office setup", points: ["Business laptops & desktops", "Networking & Wi-Fi", "Printers & scanners", "Power backup"] },
    { title: "School setup", points: ["ICT labs of any size", "Teacher stations & projectors", "Content filtering", "Staff training"] },
    { title: "CBT centre setup", points: ["JAMB-standard workstations", "LAN & exam server", "UPS & inverter systems", "Ongoing maintenance"] },
  ];
  return (
    <section className="overflow-hidden rounded-3xl bg-brand-950 text-white">
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-300">Turnkey IT for institutions</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{s.title ?? "Office, school & CBT centre setup"}</h2>
          <p className="mt-3 text-slate-300">{s.subtitle ?? "From 10 to 200 seats: we plan, supply, install and support the whole setup, so you can focus on your business or students."}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/contact?subject=Setup%20enquiry" variant="accent">
              Request a quote
            </ButtonLink>
            <ButtonLink href="/projects" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10">
              See our projects
            </ButtonLink>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {blocks.map((b) => (
            <div key={b.title} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <h3 className="font-bold">{b.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {b.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent-400" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-start justify-between gap-3 border-t border-white/10 bg-white/5 px-6 py-4 sm:flex-row sm:items-center sm:px-10">
        <p className="flex items-center gap-2 text-sm">
          <Wrench className="size-4 text-accent-300" aria-hidden />
          <span>
            <strong>Repair services:</strong> screens, keyboards, batteries, motherboards, data recovery & upgrades.
          </span>
        </p>
        <Link href="/contact?subject=Repair%20request" className="text-sm font-semibold text-accent-200 hover:text-white">
          Book a repair →
        </Link>
      </div>
    </section>
  );
}

export async function WhyUsSection({ s }: { s?: Section }) {
  const items = await getSiteContent<Item[]>("content_why_us", []);
  return (
    <section>
      <SectionHeading title={s?.title ?? "Why choose Business Hub Computers"} subtitle={s?.subtitle} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((w) => (
          <div key={w.title} className="rounded-2xl bg-surface p-4 sm:p-5">
            <DynamicIcon name={w.icon} className="size-7 text-accent-500" />
            <h3 className="mt-3 font-bold">{w.title}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{w.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function AboutSection({ s }: { s?: Section }) {
  const { company } = await getSettings();
  return (
    <section className="grid items-center gap-8 rounded-3xl border border-line bg-white p-6 sm:p-10 lg:grid-cols-2">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent-500">{s?.title ?? "About us"}</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{company.tagline}</h2>
        <p className="mt-4 leading-relaxed text-muted">{company.about}</p>
        <p className="mt-3 leading-relaxed text-muted">{company.aboutLong.split(". ").slice(0, 2).join(". ")}.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/about">Learn more about us</ButtonLink>
          <ButtonLink href="/contact" variant="outline">
            Contact us
          </ButtonLink>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["10,000+", "Devices supplied"],
          ["37", "States served"],
          ["150+", "Institutions equipped"],
          ["4.9★", "Customer rating"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-5 ring-1 ring-brand-100">
            <p className="font-display text-3xl font-extrabold text-brand-700">{n}</p>
            <p className="mt-1 text-sm text-muted">{l}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function TestimonialsSection({ s }: { s?: Section }) {
  const items = await getTestimonials();
  if (!items.length) return null;
  return (
    <section>
      <SectionHeading title={s?.title ?? "What our customers say"} subtitle={s?.subtitle} />
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
        {items.map((t) => (
          <figure key={t.id} className="w-[82%] shrink-0 snap-start rounded-2xl border border-line bg-white p-5 sm:w-auto">
            <Quote className="size-7 text-brand-200" aria-hidden />
            <Stars value={t.rating} className="mt-2" />
            <blockquote className="mt-2 text-[15px] leading-relaxed text-ink">“{t.content}”</blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{initials(t.name)}</span>
              <span>
                <span className="block text-sm font-bold">{t.name}</span>
                <span className="text-xs text-muted">{t.role}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export async function ReviewsSection({ s }: { s: Section }) {
  const items = await latestReviews(4);
  if (!items.length) return null;
  return (
    <section>
      <SectionHeading title={s.title ?? "Latest product reviews"} subtitle="From verified buyers" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface p-5">
            <div className="flex items-center justify-between">
              <Stars value={r.rating} />
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Verified purchase</span>
            </div>
            {r.title && <p className="mt-2 font-bold">{r.title}</p>}
            <p className="mt-1 line-clamp-3 text-sm text-muted">{r.comment}</p>
            <p className="mt-3 text-xs text-muted">
              {r.author.split(" ")[0]} on{" "}
              <Link href={`/products/${r.productSlug}`} className="font-semibold text-brand-600 hover:underline">
                {r.productName}
              </Link>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function ProjectsSection({ s, limit = 4 }: { s?: Section; limit?: number }) {
  const items = (await getProjects()).slice(0, limit);
  if (!items.length) return null;
  return (
    <section>
      <SectionHeading title={s?.title ?? "Completed projects"} subtitle={s?.subtitle ?? "Offices, schools and CBT centres we've equipped"} href="/projects" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((p) => (
          <article key={p.id} className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="relative aspect-[16/10] bg-surface">
              <ProductImage src={p.images[0]} alt={p.title} fill sizes="(max-width:1024px) 50vw, 25vw" className="object-cover" />
              {p.category && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-brand-700">{p.category}</span>}
            </div>
            <div className="p-4">
              <h3 className="font-bold leading-snug">{p.title}</h3>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                <MapPin className="size-3.5" aria-hidden /> {p.location}
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-muted">{p.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export async function TeamSection({ s, limit = 4 }: { s?: Section; limit?: number }) {
  const team = (await getTeam()).slice(0, limit);
  if (!team.length) return null;
  return (
    <section>
      <SectionHeading title={s?.title ?? "Meet the team"} subtitle={s?.subtitle ?? "Real people who know technology"} href="/team" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {team.map((m) => (
          <div key={m.id} className="rounded-2xl border border-line bg-white p-5 text-center">
            {m.photo ? (
              <Image src={m.photo} alt={m.name} width={96} height={96} className="mx-auto size-20 rounded-full object-cover" />
            ) : (
              <span className="mx-auto grid size-20 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-xl font-bold text-white">{initials(m.name)}</span>
            )}
            <h3 className="mt-3 font-bold">{m.name}</h3>
            <p className="text-sm text-accent-600">{m.position}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function GallerySection({ s, limit = 6 }: { s?: Section; limit?: number }) {
  const items = (await getGallery()).slice(0, limit);
  if (!items.length) return null;
  return (
    <section>
      <SectionHeading title={s?.title ?? "Gallery"} href="/gallery" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map((g, i) => (
          <figure key={g.id} className={`group relative overflow-hidden rounded-2xl bg-surface ${i === 0 ? "md:row-span-2" : ""}`}>
            <div className={`relative ${i === 0 ? "aspect-square md:aspect-auto md:h-full" : "aspect-[4/3]"}`}>
              <ProductImage src={g.imageUrl} alt={g.alt ?? g.title} fill sizes="(max-width:768px) 50vw, 33vw" className="object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-semibold text-white">{g.title}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export async function ContactSection({ s }: { s?: Section }) {
  const [{ company }, branches] = await Promise.all([getSettings(), getBranches()]);
  const primary = branches.find((b) => b.isPrimary) ?? branches[0];
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <div className="rounded-3xl bg-brand-700 p-6 text-white sm:p-8">
        <h2 className="font-display text-2xl font-extrabold">{s?.title ?? "Visit or contact us"}</h2>
        <p className="mt-2 text-brand-100">Walk into our Ibadan showroom, call, WhatsApp or email — we&apos;re happy to advise.</p>
        <ul className="mt-6 space-y-4 text-[15px]">
          {branches.map((b) => (
            <li key={b.id} className="flex gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-accent-300" aria-hidden />
              <span>
                <strong className="block">{b.name}</strong>
                <span className="text-brand-100">{b.address}</span>
                <a href={directionsUrl(b.mapsQuery)} target="_blank" rel="noopener" className="mt-1 block text-sm font-semibold text-accent-200 hover:text-white">
                  Directions →
                </a>
              </span>
            </li>
          ))}
          <li className="flex gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-accent-300" aria-hidden /> {primary?.hours ?? "Mon–Sat, 8:30am – 6:30pm"}
          </li>
        </ul>
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <a href={`tel:${company.phone.replace(/\s/g, "")}`} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/20">
            <Phone className="size-4" aria-hidden /> Call
          </a>
          <a href={`https://wa.me/${company.whatsapp}`} target="_blank" rel="noopener" className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-2.5 text-sm font-semibold">
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
          <a href={`mailto:${company.email}`} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/20">
            <Mail className="size-4" aria-hidden /> Email
          </a>
        </div>
      </div>
      {primary && <MapEmbed query={primary.mapsQuery} title={`Map showing ${primary.name}`} className="h-full min-h-80 w-full rounded-3xl border-0" />}
    </section>
  );
}

export async function NewsletterSection({ s }: { s?: Section }) {
  return (
    <section className="flex flex-col items-center rounded-3xl bg-gradient-to-br from-brand-50 via-white to-accent-50 px-6 py-10 text-center ring-1 ring-line">
      <h2 className="font-display text-2xl font-extrabold">{s?.title ?? "Get deals in your inbox"}</h2>
      <p className="mt-2 max-w-md text-muted">New arrivals, price drops and exclusive discounts — straight to your inbox.</p>
      <div className="mt-5 w-full max-w-md">
        <NewsletterForm dark={false} />
      </div>
    </section>
  );
}

export type { Section };
