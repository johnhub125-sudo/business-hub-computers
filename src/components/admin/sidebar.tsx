"use client";

import { Circle, LogOut, Menu, X, Boxes, Briefcase, Calculator, Contact, CreditCard, FileBarChart, FolderTree, GalleryHorizontal, Headset, Images, LayoutDashboard, LayoutTemplate, LineChart, ListChecks, Map, Package, PackageCheck, Receipt, ScrollText, Settings, Shield, ShieldCheck, ShoppingBag, Star, Tags, TicketPercent, Truck, Users, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { Boxes, Briefcase, Calculator, Contact, CreditCard, FileBarChart, FolderTree, GalleryHorizontal, Headset, Images, LayoutDashboard, LayoutTemplate, LineChart, ListChecks, Map, Package, PackageCheck, Receipt, ScrollText, Settings, Shield, ShieldCheck, ShoppingBag, Star, Tags, TicketPercent, Truck, Users };
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav-config";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Circle;
  return <C className={className} aria-hidden />;
}

export function AdminSidebar({ groups, badges, logo }: { groups: NavGroup[]; badges: Record<string, number>; logo: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }

  const nav = (
    <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-brand-300/70">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = path === it.href || path.startsWith(it.href + "/");
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition", active ? "bg-white/12 text-white" : "text-brand-100/85 hover:bg-white/6 hover:text-white")}
                  >
                    <Icon name={it.icon} className="size-4 shrink-0" />
                    <span className="truncate">{it.label}</span>
                    {!!badges[it.href] && <span className="ml-auto rounded-full bg-accent-500 px-1.5 text-[11px] font-bold leading-5 text-white">{badges[it.href]}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const shell = (
    <div className="flex h-full flex-col bg-brand-950">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        <Link href="/admin/dashboard" className="rounded-lg bg-white px-2 py-1">
          <Image src={logo} alt="Business Hub Computers admin" width={640} height={170} className="h-7 w-auto" />
        </Link>
        <button className="rounded-lg p-1.5 text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      {nav}
      <div className="border-t border-white/10 p-3">
        <Link href="/" className="block rounded-lg px-3 py-2 text-[13px] text-brand-100/80 hover:bg-white/5 hover:text-white">
          ← View storefront
        </Link>
        <button
          onClick={async () => {
            await authClient.signOut();
            router.push("/admin/login");
            router.refresh();
          }}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-red-300 hover:bg-white/5"
        >
          <LogOut className="size-4" aria-hidden /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed left-3 top-3.5 z-40 rounded-lg bg-white p-2 shadow ring-1 ring-line lg:hidden print:hidden" aria-label="Open admin menu">
        <Menu className="size-5 text-brand-800" />
      </button>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block print:!hidden">{shell}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-in">{shell}</div>
        </div>
      )}
    </>
  );
}
