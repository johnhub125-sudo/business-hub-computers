import { ChevronDown, Heart, LayoutGrid, MessageCircle, Phone, ShoppingCart, Truck, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getNavigation } from "@/server/queries/catalog";
import { cartCount } from "@/server/services/cart";
import { getCurrentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { whatsappLink } from "@/server/integrations/whatsapp";
import { MobileNav } from "./mobile-nav";
import { SearchBox } from "./search-box";

export async function SiteHeader() {
  const [nav, settings, count, me] = await Promise.all([getNavigation(), getSettings(), cartCount(), getCurrentUser()]);
  const { company } = settings;
  const collections = nav.collections;
  const firstName = me?.name.split(" ")[0];

  return (
    <header className="site-header sticky top-0 z-40 bg-white/95 backdrop-blur-xl supports-[backdrop-filter]:bg-white/80">
      {/* Announcement bar */}
      <div className="topbar text-white">
        <div className="container-page flex h-9 items-center justify-between gap-4 text-[12.5px]">
          <p className="truncate">
            <Truck className="mr-1.5 inline size-3.5 -translate-y-px text-accent-300" aria-hidden />
            {company.announcement}
          </p>
          <div className="hidden shrink-0 items-center gap-4 md:flex">
            <a href={`tel:${company.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-accent-200">
              <Phone className="size-3.5" aria-hidden /> {company.phone}
            </a>
            <a href={whatsappLink(company.whatsapp)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 hover:text-accent-200">
              <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
            </a>
            <Link href="/track-order" className="hover:text-accent-200">
              Track order
            </Link>
          </div>
        </div>
      </div>

      {/* Main row */}
      <div className="border-b border-line">
        <div className="container-page flex h-[68px] items-center gap-3 lg:gap-6">
          <MobileNav nav={nav} signedIn={!!me} phone={company.phone} whatsapp={company.whatsapp} />
          <Link href="/" className="shrink-0" aria-label={`${company.name} — home`}>
            <Image src={company.logo} alt={company.name} width={640} height={170} priority className="h-9 w-auto sm:h-11" />
          </Link>
          <SearchBox className="hidden flex-1 md:block" />
          <nav aria-label="Account" className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link href={me ? "/account" : "/login"} className="hidden items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-surface sm:flex">
              <User className="size-5 text-brand-700" aria-hidden />
              <span className="text-left leading-tight">
                <span className="block text-[11px] text-muted">{me ? "Hello," : "Sign in"}</span>
                <span className="block text-sm font-semibold">{me ? firstName : "Account"}</span>
              </span>
            </Link>
            <Link href="/account/wishlist" className="relative rounded-xl p-2.5 hover:bg-surface" aria-label="Wishlist">
              <Heart className="size-5 text-brand-700" aria-hidden />
            </Link>
            <Link href="/cart" className="relative flex items-center gap-2 rounded-xl p-2.5 hover:bg-surface" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
              <ShoppingCart className="size-5 text-brand-700" aria-hidden />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold leading-5 text-white">{count > 99 ? "99+" : count}</span>
              )}
              <span className="hidden text-sm font-semibold lg:inline">Cart</span>
            </Link>
          </nav>
        </div>
        <div className="container-page pb-3 md:hidden">
          <SearchBox />
        </div>
      </div>

      {/* Category nav (desktop) */}
      <nav aria-label="Main" className="hidden border-b border-line bg-white lg:block">
        <div className="container-page flex h-12 items-center gap-1 text-[14px] font-medium">
          <div className="group relative">
            <Link href="/categories" className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-700 px-4 text-white hover:bg-brand-800">
              <LayoutGrid className="size-4" aria-hidden /> All categories
            </Link>
            <div className="invisible absolute left-0 top-full z-50 w-[640px] translate-y-1 rounded-2xl border border-line bg-white p-5 opacity-0 shadow-[var(--shadow-lift)] transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              <div className="grid grid-cols-3 gap-5">
                {nav.categories.map((c) => (
                  <div key={c.id}>
                    <Link href={`/categories/${c.slug}`} className="font-semibold text-ink hover:text-brand-600">
                      {c.name}
                    </Link>
                    <ul className="mt-1.5 space-y-1">
                      {c.children.map((ch) => (
                        <li key={ch.id}>
                          <Link href={`/categories/${c.slug}?sub=${ch.slug}`} className="text-sm text-muted hover:text-brand-600">
                            {ch.name}
                          </Link>
                        </li>
                      ))}
                      {collections.map((col) => (
                        <li key={col.id}>
                          <Link href={`/${col.slug}/${c.slug}`} className="text-sm text-muted hover:text-brand-600">
                            {col.name} {c.name.toLowerCase()}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {collections.map((col) => (
            <div key={col.id} className="group relative">
              <Link href={`/${col.slug}`} className="inline-flex h-12 items-center gap-1 rounded-lg px-3 hover:text-brand-600" aria-haspopup="true">
                {col.name} <ChevronDown className="size-4 transition group-hover:rotate-180" aria-hidden />
              </Link>
              <div className="invisible absolute left-0 top-full z-50 w-60 translate-y-1 rounded-2xl border border-line bg-white p-2 opacity-0 shadow-[var(--shadow-lift)] transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                {nav.categories.map((c) => (
                  <Link key={c.id} href={`/${col.slug}/${c.slug}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-brand-50 hover:text-brand-700">
                    {c.name}
                  </Link>
                ))}
                <Link href={`/${col.slug}`} className="mt-1 block rounded-lg border-t border-line px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50">
                  Shop all {col.name.toLowerCase()} →
                </Link>
              </div>
            </div>
          ))}
          <Link href="/deals" className="inline-flex h-12 items-center rounded-lg px-3 text-accent-600 hover:text-accent-700">
            🔥 Deals
          </Link>
          <Link href="/brands" className="inline-flex h-12 items-center rounded-lg px-3 hover:text-brand-600">
            Brands
          </Link>
          <Link href="/about#services" className="inline-flex h-12 items-center rounded-lg px-3 hover:text-brand-600">
            Services
          </Link>
          <Link href="/projects" className="inline-flex h-12 items-center rounded-lg px-3 hover:text-brand-600">
            Projects
          </Link>
          <Link href="/dropshipping" className="inline-flex h-12 items-center rounded-lg px-3 hover:text-brand-600">
            Dropshipping
          </Link>
          <Link href="/support" className="ml-auto inline-flex h-12 items-center rounded-lg px-3 hover:text-brand-600">
            Help & support
          </Link>
        </div>
      </nav>
    </header>
  );
}
