import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs (?tab=…) — shareable and work without JavaScript. */
export function AdminTabs({ base, tabs, active }: { base: string; tabs: [string, string][]; active: string }) {
  return (
    <nav aria-label="Sections" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1 scrollbar-none">
      {tabs.map(([key, label]) => (
        <Link
          key={key}
          href={`${base}?tab=${key}`}
          aria-current={active === key ? "page" : undefined}
          className={cn("shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition", active === key ? "border-brand-700 text-brand-700" : "border-transparent text-muted hover:text-ink")}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function tabOf(sp: Record<string, string | string[] | undefined>, allowed: string[]) {
  const t = typeof sp.tab === "string" ? sp.tab : allowed[0];
  return allowed.includes(t) ? t : allowed[0];
}
