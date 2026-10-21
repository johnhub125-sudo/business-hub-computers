import { ArrowRight, Building2, ChevronRight, MessageCircle, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { whatsappLink } from "@/server/integrations/whatsapp";
import { getNavigation, productRail } from "@/server/queries/catalog";
import { getSettings } from "@/server/settings";
import { DynamicIcon } from "./icons";
import { ProductRail } from "./product-card";

/** Icon for a department, from its own icon or its name. */
export function departmentIcon(c: { icon?: string | null; name: string }) {
  if (c.icon) return c.icon;
  const n = c.name.toLowerCase();
  if (/print|toner|ink|cartridge/.test(n)) return "printer";
  if (/solar|power|inverter|battery|ups/.test(n)) return "sun";
  if (/network|router|wifi/.test(n)) return "router";
  if (/phone|mobile|tablet/.test(n)) return "smartphone";
  if (/monitor|display/.test(n)) return "monitor";
  if (/projector/.test(n)) return "projector";
  if (/accessor|mouse|keyboard/.test(n)) return "mouse";
  if (/computer|laptop|desktop|pc|book/.test(n)) return "laptop";
  return "tag";
}

/**
 * The top of the home page, marketplace style: departments on the left, the promotions carousel in
 * the middle and quick help on the right (wide screens).
 */
export async function HomeTop({ children }: { children: ReactNode }) {
  const [nav, { company }] = await Promise.all([getNavigation(), getSettings()]);
  return (
    <section className="grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_248px]" aria-label="Shop">
      <nav aria-label="Departments" className="hidden flex-col rounded-3xl border border-line bg-white p-2 shadow-[var(--shadow-card)] lg:flex">
        <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">Departments</p>
        <ul className="flex-1">
          {nav.categories.slice(0, 11).map((c) => (
            <li key={c.id}>
              <Link href={`/categories/${c.slug}`} className="group flex items-center gap-3 rounded-xl px-3 py-[7px] text-[14px] font-medium text-ink transition hover:bg-brand-50 hover:text-brand-700">
                <DynamicIcon name={departmentIcon(c)} className="size-[18px] shrink-0 text-brand-600" />
                <span className="truncate">{c.name}</span>
                <ChevronRight className="ml-auto size-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/categories" className="mt-1 flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          All categories <ArrowRight className="size-4" aria-hidden />
        </Link>
      </nav>

      <div className="min-w-0">{children}</div>

      <aside className="hidden grid-rows-3 gap-3 xl:grid" aria-label="Quick help">
        <a href={whatsappLink(company.whatsapp)} target="_blank" rel="noopener" className="group flex flex-col justify-between rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5">
          <MessageCircle className="size-6" aria-hidden />
          <span>
            <span className="block text-[15px] font-extrabold leading-tight">Order on WhatsApp</span>
            <span className="text-xs text-emerald-50">Chat with a sales expert now</span>
          </span>
        </a>
        <a href={`tel:${company.phone.replace(/\s/g, "")}`} className="group flex flex-col justify-between rounded-3xl bg-gradient-to-br from-brand-700 to-brand-950 p-4 text-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5">
          <Phone className="size-6" aria-hidden />
          <span>
            <span className="block text-[15px] font-extrabold leading-tight">Call to order</span>
            <span className="text-xs text-brand-100">{company.phone}</span>
          </span>
        </a>
        <Link href="/contact?subject=Bulk%20or%20corporate%20order" className="group flex flex-col justify-between rounded-3xl bg-gradient-to-br from-accent-500 to-accent-700 p-4 text-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5">
          <Building2 className="size-6" aria-hidden />
          <span>
            <span className="block text-[15px] font-extrabold leading-tight">Bulk & corporate orders</span>
            <span className="text-xs text-accent-50">Request a quote for your office</span>
          </span>
        </Link>
      </aside>
    </section>
  );
}

const SEGMENT_COLOURS = [
  "from-brand-700 to-brand-900",
  "from-accent-600 to-accent-800",
  "from-emerald-600 to-emerald-800",
  "from-amber-500 to-orange-600",
  "from-violet-600 to-violet-800",
  "from-sky-600 to-sky-800",
  "from-rose-600 to-rose-800",
  "from-teal-600 to-teal-800",
];

/** One colour-coded row per department that has products, with its types as quick links. */
export async function DepartmentSegments({ wished }: { wished: string[] }) {
  const nav = await getNavigation();
  const blocks = (await Promise.all(nav.categories.slice(0, 10).map(async (c) => ({ c, items: await productRail("category", c.slug, 12) })))).filter((b) => b.items.length);
  if (!blocks.length) return null;
  return (
    <div className="space-y-6 sm:space-y-8">
      {blocks.map(({ c, items }, i) => (
        <section key={c.id} className="overflow-hidden rounded-3xl border border-line bg-white shadow-[var(--shadow-card)]" aria-labelledby={`dept-${c.id}`}>
          <div className={`flex items-center gap-3 bg-gradient-to-r ${SEGMENT_COLOURS[i % SEGMENT_COLOURS.length]} px-4 py-3 text-white sm:px-5`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">
              <DynamicIcon name={departmentIcon(c)} className="size-5" />
            </span>
            <h2 id={`dept-${c.id}`} className="font-display text-lg font-extrabold tracking-tight sm:text-xl">
              {c.name}
            </h2>
            <div className="hidden min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none md:flex">
              {c.children.slice(0, 6).map((ch) => (
                <Link key={ch.id} href={`/categories/${c.slug}?sub=${ch.slug}`} className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[13px] font-medium hover:bg-white/25">
                  {ch.name}
                </Link>
              ))}
            </div>
            <Link href={`/categories/${c.slug}`} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-ink hover:bg-white/90">
              See all <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {c.children.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5 scrollbar-none md:hidden">
              {c.children.map((ch) => (
                <Link key={ch.id} href={`/categories/${c.slug}?sub=${ch.slug}`} className="shrink-0 rounded-full bg-surface px-3 py-1 text-[13px] font-medium text-ink">
                  {ch.name}
                </Link>
              ))}
            </div>
          )}
          <div className="p-3 sm:p-4">
            <ProductRail items={items} wished={wished} />
          </div>
        </section>
      ))}
    </div>
  );
}

const BUDGETS = [
  { label: "Under ₦100k", hint: "Accessories, ink & more", max: 100_000, cls: "from-sky-500 to-sky-700" },
  { label: "₦100k – ₦300k", hint: "Everyday laptops & printers", min: 100_000, max: 300_000, cls: "from-emerald-500 to-emerald-700" },
  { label: "₦300k – ₦600k", hint: "Business laptops & power", min: 300_000, max: 600_000, cls: "from-brand-600 to-brand-800" },
  { label: "₦600k – ₦1M", hint: "Performance & gaming", min: 600_000, max: 1_000_000, cls: "from-violet-600 to-violet-800" },
  { label: "Above ₦1M", hint: "Workstations & premium", min: 1_000_000, cls: "from-accent-600 to-accent-800" },
];

/** Shop by budget: one tap to every product in a price band. */
export function BudgetStrip() {
  return (
    <section aria-labelledby="budget-title">
      <h2 id="budget-title" className="mb-4 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
        Shop by budget
      </h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-5">
        {BUDGETS.map((b) => {
          const qs = new URLSearchParams({ ...(b.min ? { min: String(b.min) } : {}), ...(b.max ? { max: String(b.max) } : {}), stock: "1" });
          return (
            <Link key={b.label} href={`/products?${qs}`} className={`group relative w-[62%] shrink-0 snap-start overflow-hidden rounded-2xl bg-gradient-to-br ${b.cls} p-4 text-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 sm:w-auto`}>
              <span className="absolute -right-6 -top-6 size-20 rounded-full bg-white/10" aria-hidden />
              <span className="relative block font-display text-lg font-extrabold">{b.label}</span>
              <span className="relative mt-0.5 block text-xs text-white/85">{b.hint}</span>
              <span className="relative mt-3 inline-flex items-center gap-1 text-[13px] font-semibold">
                Shop now <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** The brands customers can actually buy here, logo first. */
export async function BrandStrip() {
  const nav = await getNavigation();
  if (!nav.brands.length) return null;
  return (
    <section aria-labelledby="brands-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 id="brands-title" className="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
          Top brands
        </h2>
        <Link href="/brands" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-800">
          All brands <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
        {nav.brands.slice(0, 18).map((b) => (
          <Link key={b.slug} href={`/brands/${b.slug}`} className="flex h-14 min-w-28 shrink-0 items-center justify-center rounded-2xl border border-line bg-white px-5 text-[15px] font-extrabold tracking-tight text-ink transition hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 hover:shadow-md">
            {b.logo ? <Image src={b.logo} alt={b.name} width={96} height={32} className="h-7 w-auto object-contain" /> : b.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
