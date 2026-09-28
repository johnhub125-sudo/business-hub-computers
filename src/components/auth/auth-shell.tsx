import { BadgeCheck, ShieldCheck, Truck } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="container-page grid gap-10 py-8 sm:py-12 lg:grid-cols-[1fr_420px] lg:items-start">
      <div className={wide ? "lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-3xl" : "mx-auto w-full max-w-md lg:mx-0 lg:ml-auto"}>
        <div className="rounded-3xl border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      {!wide && (
        <aside className="hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-950 p-8 text-white lg:block">
          <h2 className="text-xl font-bold">Why create an account?</h2>
          <ul className="mt-5 space-y-4 text-[15px] text-brand-100">
            <li className="flex gap-3">
              <Truck className="size-5 shrink-0 text-accent-300" aria-hidden /> Track orders and get delivery updates by email & WhatsApp
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="size-5 shrink-0 text-accent-300" aria-hidden /> Keep receipts and warranty details in one place
            </li>
            <li className="flex gap-3">
              <BadgeCheck className="size-5 shrink-0 text-accent-300" aria-hidden /> Save your wishlist and checkout faster
            </li>
          </ul>
        </aside>
      )}
    </div>
  );
}
