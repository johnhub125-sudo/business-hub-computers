"use client";

import { ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Nav = {
  categories: { id: string; name: string; slug: string; children: { id: string; name: string; slug: string }[] }[];
  collections: { id: string; name: string; slug: string }[];
};

export function MobileNav({ nav, signedIn, phone, whatsapp }: { nav: Nav; signedIn: boolean; phone: string; whatsapp: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="-ml-1 rounded-xl p-2 hover:bg-surface lg:hidden" aria-label="Open menu">
        <Menu className="size-6 text-brand-800" />
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        className="m-0 h-dvh max-h-dvh w-[88vw] max-w-sm bg-white p-0 backdrop:bg-slate-900/50 open:animate-fade-in"
        aria-label="Menu"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-bold text-brand-800">Menu</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-surface" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <Link href={signedIn ? "/account" : "/login"} className="mb-2 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-3 font-semibold text-brand-800">
              {signedIn ? "My account" : "Sign in / Register"} <ChevronRight className="size-4" />
            </Link>
            {nav.collections.map((col) => (
              <details key={col.id} className="group rounded-xl">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-3 font-semibold hover:bg-surface">
                  {col.name}
                  <ChevronRight className="size-4 transition group-open:rotate-90" />
                </summary>
                <div className="mb-2 ml-3 border-l border-line pl-3">
                  {nav.categories.map((c) => (
                    <Link key={c.id} href={`/${col.slug}/${c.slug}`} className="block rounded-lg px-3 py-2 text-[15px] text-muted hover:bg-surface hover:text-ink">
                      {c.name}
                    </Link>
                  ))}
                  <Link href={`/${col.slug}`} className="block rounded-lg px-3 py-2 text-[15px] font-semibold text-brand-600">
                    Shop all
                  </Link>
                </div>
              </details>
            ))}
            <details className="group rounded-xl">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-3 font-semibold hover:bg-surface">
                Categories
                <ChevronRight className="size-4 transition group-open:rotate-90" />
              </summary>
              <div className="mb-2 ml-3 border-l border-line pl-3">
                {nav.categories.map((c) => (
                  <Link key={c.id} href={`/categories/${c.slug}`} className="block rounded-lg px-3 py-2 text-[15px] text-muted hover:bg-surface hover:text-ink">
                    {c.name}
                  </Link>
                ))}
              </div>
            </details>
            {[
              ["/deals", "🔥 Deals"],
              ["/brands", "Brands"],
              ["/about", "About us"],
              ["/projects", "Projects"],
              ["/gallery", "Gallery"],
              ["/team", "Our team"],
              ["/track-order", "Track order"],
              ["/support", "Help & support"],
              ["/contact", "Contact"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="block rounded-xl px-3 py-3 font-medium hover:bg-surface">
                {label}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="rounded-xl border border-line py-2.5 text-center text-sm font-semibold">
              Call us
            </a>
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener" className="rounded-xl bg-[#25D366] py-2.5 text-center text-sm font-semibold text-white">
              WhatsApp
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
