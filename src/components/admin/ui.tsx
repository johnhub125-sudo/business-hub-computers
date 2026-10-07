import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-sm text-brand-600 hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="admin-title font-display text-2xl font-extrabold tracking-tight text-ink sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("panel rounded-2xl border border-line bg-white", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-gradient-to-r from-surface/70 to-white px-5 py-3.5">
          {title && <h2 className="font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Responsive table: horizontal scroll on small screens, sticky header. */
export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="panel overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-gradient-to-r from-brand-50/80 to-surface text-left text-xs uppercase tracking-wide text-brand-800/80">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-3 [&_tr:hover]:bg-surface/50">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function EmptyRow({ cols, text = "Nothing here yet." }: { cols: number; text?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-muted">
        {text}
      </td>
    </tr>
  );
}

/** GET filter bar — works without JavaScript; filters live in the URL so they can be bookmarked/shared. */
export function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3">
      {children}
      <button className="h-10 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">Apply</button>
      <Link href={action} className="grid h-10 place-items-center rounded-xl border border-line px-3 text-sm font-semibold hover:bg-surface">
        Reset
      </Link>
    </form>
  );
}

export function FilterInput({ name, label, defaultValue, type = "text", placeholder, className }: { name: string; label: string; defaultValue?: string; type?: string; placeholder?: string; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-semibold text-muted", className)}>
      {label}
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="h-10 rounded-xl border border-line px-3 text-sm font-normal text-ink" />
    </label>
  );
}

export function FilterSelect({ name, label, defaultValue, options }: { name: string; label: string; defaultValue?: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
      {label}
      <select name={name} defaultValue={defaultValue ?? ""} className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-normal text-ink">
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export type SP = Record<string, string | string[] | undefined>;
export const one = (sp: SP, k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
export const pageOf = (sp: SP) => Math.max(1, Number(one(sp, "page")) || 1);

export function qsWith(base: string, sp: SP, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v != null) p.set(k, Array.isArray(v) ? v[0] : v);
  for (const [k, v] of Object.entries(patch)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
