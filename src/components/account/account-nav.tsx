"use client";

import { Bell, Heart, Headset, LayoutDashboard, LogOut, MapPin, Package, Shield, Star, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/account", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/account/orders", label: "Orders & tracking", icon: Package },
  { href: "/account/profile", label: "Profile", icon: User },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/reviews", label: "My reviews", icon: Star },
  { href: "/account/support", label: "Support tickets", icon: Headset },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/security", label: "Security & privacy", icon: Shield },
];

export function AccountNav({ unread }: { unread: number }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <nav aria-label="Account" className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:flex-col lg:px-0">
      {ITEMS.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-brand-700 text-white" : "text-ink hover:bg-surface")}
          >
            <it.icon className="size-4" aria-hidden />
            {it.label}
            {it.href === "/account/notifications" && unread > 0 && <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-bold", active ? "bg-white text-brand-700" : "bg-accent-500 text-white")}>{unread}</span>}
          </Link>
        );
      })}
      <button
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
          router.refresh();
        }}
        className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        <LogOut className="size-4" aria-hidden /> Log out
      </button>
    </nav>
  );
}
