"use client";

import { Headset, Heart, Home, LayoutGrid, Mail, MessageCircle, Phone, Search, ShoppingCart, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** Non-intrusive floating contact buttons (collapsed into one launcher). */
export function FloatingContact({ phone, whatsapp, email }: { phone: string; whatsapp: string; email: string }) {
  const [open, setOpen] = useState(false);
  const items = [
    { href: `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hello Business Hub Computers, I'd like to make an enquiry.")}`, label: "WhatsApp", icon: MessageCircle, cls: "bg-[#25D366] text-white", external: true },
    { href: `tel:${phone.replace(/\s/g, "")}`, label: "Call", icon: Phone, cls: "bg-brand-700 text-white" },
    { href: `mailto:${email}`, label: "Email", icon: Mail, cls: "bg-white text-brand-700 border border-line" },
    { href: "/support", label: "Support", icon: Headset, cls: "bg-white text-brand-700 border border-line" },
  ];
  return (
    <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2 lg:bottom-6">
      {open &&
        items.map((it) => (
          <a
            key={it.label}
            href={it.href}
            target={it.external ? "_blank" : undefined}
            rel={it.external ? "noopener" : undefined}
            className={cn("flex items-center gap-2 rounded-full py-2 pl-3 pr-4 text-sm font-semibold shadow-lg animate-slide-up", it.cls)}
          >
            <it.icon className="size-4" aria-hidden /> {it.label}
          </a>
        ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close contact options" : "Contact us"}
        className={cn("grid size-14 place-items-center rounded-full shadow-[var(--shadow-lift)] transition", open ? "bg-slate-800 text-white" : "bg-[#25D366] text-white hover:scale-105")}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-7" />}
      </button>
    </div>
  );
}

/** Bottom tab bar for phones (§143). */
export function MobileTabBar({ cartCount }: { cartCount: number }) {
  const path = usePathname();
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/categories", label: "Categories", icon: LayoutGrid },
    { href: "/search", label: "Search", icon: Search },
    { href: "/account/wishlist", label: "Wishlist", icon: Heart },
    { href: "/cart", label: "Cart", icon: ShoppingCart, badge: cartCount },
    { href: "/account", label: "Account", icon: User },
  ];
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-6">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium", active ? "text-brand-700" : "text-muted")} aria-current={active ? "page" : undefined}>
                <t.icon className="size-5" aria-hidden />
                {t.label}
                {!!t.badge && <span className="absolute right-[18%] top-1 grid min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-bold leading-4 text-white">{t.badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** NDPA-friendly cookie notice: essential cookies only unless the visitor accepts analytics. */
const noop = () => () => {};
function needsCookieChoice() {
  try {
    return !localStorage.getItem("bhc_cookie_choice");
  } catch {
    return false;
  }
}

export function CookieBanner() {
  const needed = useSyncExternalStore(noop, needsCookieChoice, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!needed || dismissed) return null;
  const choose = (v: "all" | "essential") => {
    try {
      localStorage.setItem("bhc_cookie_choice", v);
    } catch {}
    setDismissed(true);
  };
  return (
    <div role="dialog" aria-label="Cookie preferences" className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-2xl rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-lift)] animate-slide-up lg:bottom-5">
      <p className="text-sm text-ink">
        We use essential cookies to keep you signed in and remember your cart, plus privacy-friendly analytics to improve the store.{" "}
        <Link href="/cookies" className="font-semibold text-brand-600 underline">
          Cookie policy
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => choose("essential")} className="h-9 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-surface">
          Essential only
        </button>
        <button onClick={() => choose("all")} className="h-9 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800">
          Accept all
        </button>
      </div>
    </div>
  );
}
